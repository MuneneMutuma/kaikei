import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, ActivityIndicator, Modal, FlatList } from 'react-native';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { Expense } from '../services/ledger/Schema';
import { colors } from '../theme/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { ChevronLeft, ChevronRight, TrendingUp, X, ShoppingBag, Calendar, Eye, EyeOff } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor } from './AnalyticsScreen';
import { TransactionRow } from '../components/TransactionRow';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const screenWidth = Dimensions.get('window').width;

const VisualAnalyticsScreen = ({ navigation, route }: any) => {
    const insets = useSafeAreaInsets();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [segment, setSegment] = useState<'all' | 'business' | 'personal'>('all');

    // Time Navigation State
    const [selectedMonth, setSelectedMonth] = useState(new Date()); // Default to now

    // Interaction State
    const [selectedCategory, setSelectedCategory] = useState<{ name: string, value: number, color: string } | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedDayExpenses, setSelectedDayExpenses] = useState<{ date: string, items: Expense[] } | null>(null);
    const [showLegend, setShowLegend] = useState(true);

    const [selectedTx, setSelectedTx] = useState<Expense | null>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    useEffect(() => {
        loadData();
    }, []);



    const loadData = async () => {
        setLoading(true);
        try {
            const repo = new ExpenseRepository();
            const data = await repo.getAllExpenses();
            setExpenses(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Helpers ---

    const goToPrevMonth = () => {
        const newDate = new Date(selectedMonth);
        newDate.setMonth(newDate.getMonth() - 1);
        setSelectedMonth(newDate);
        setSelectedCategory(null); // Reset selection
    };

    const goToNextMonth = () => {
        const newDate = new Date(selectedMonth);
        newDate.setMonth(newDate.getMonth() + 1);

        // Constraint: Don't go past current month
        const now = new Date();
        if (newDate > now && newDate.getMonth() !== now.getMonth()) return;

        setSelectedMonth(newDate);
        setSelectedCategory(null);
    };

    const monthLabel = useMemo(() => {
        return selectedMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' });
    }, [selectedMonth]);

    // Check if next month is future
    const isNextDisabled = useMemo(() => {
        const now = new Date();
        const next = new Date(selectedMonth);
        next.setMonth(next.getMonth() + 1);
        return next > now && next.getMonth() !== now.getMonth();
    }, [selectedMonth]);

    // --- Data Processing ---

    const filteredExpenses = useMemo(() => {
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();

        return expenses.filter(e => {
            if (e.type !== 'expense') return false;

            // Segment Filter
            if (segment === 'business' && !e.isBusiness) return false;
            if (segment === 'personal' && e.isBusiness) return false;

            const d = new Date(e.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });
    }, [expenses, selectedMonth, segment]);

    const totalSpend = useMemo(() => filteredExpenses.reduce((sum, e) => sum + e.amount, 0), [filteredExpenses]);

    const pieData = useMemo(() => {
        const categoryTotals: { [key: string]: number } = {};

        filteredExpenses.forEach(e => {
            let cat = e.categoryName || 'Other';
            cat = cat.charAt(0).toUpperCase() + cat.slice(1);
            categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
        });

        const sorted = Object.entries(categoryTotals)
            .sort(([, a], [, b]) => b - a);

        // Colors
        const chartColors = ['#13ec5b', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#94a3b8', '#22d3ee', '#fbbf24'];

        return sorted.map(([name, value], index) => ({
            value,
            color: chartColors[index % chartColors.length],
            text: `${Math.round((value / totalSpend) * 100)}%`,
            legend: name,
            focused: selectedCategory ? selectedCategory.name === name : false,
            onPress: () => {
                if (selectedCategory && selectedCategory.name === name) {
                    setSelectedCategory(null);
                } else {
                    setSelectedCategory({ name, value, color: chartColors[index % chartColors.length] });
                }
            }
        }));
    }, [filteredExpenses, totalSpend, selectedCategory]);

    // Handle deep link / navigation param to highlight a category
    // This effect needs to run when pieData changes or the route params change
    useEffect(() => {
        if (route.params?.highlightCategory && pieData.length > 0) {
            console.log("VisualAnalytics: Received highlight request:", route.params.highlightCategory);
            const target = route.params.highlightCategory.toLowerCase();

            const found = pieData.find(p => p.legend.toLowerCase() === target);
            if (found) {
                // Avoid infinite loop or redundant sets
                if (!selectedCategory || selectedCategory.name !== found.legend) {
                    console.log("VisualAnalytics: Found matching category, highlighting:", found.legend);
                    setSelectedCategory({ name: found.legend, value: found.value, color: found.color });

                    // Clear param to avoid re-triggering on future updates
                    navigation.setParams({ highlightCategory: null });
                }
            } else {
                console.log("VisualAnalytics: Category not found in current month view:", target);
                // Optional: If not found, maybe try previous month? For now, just ignore.
            }
        }
    }, [route.params?.highlightCategory, pieData]);

    const barData = useMemo(() => {
        // Daily totals for the selected month
        const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
        const dailyTotals: { [key: string]: number } = {};
        const dailyItems: { [key: string]: Expense[] } = {};

        // Initialize all days
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            dailyTotals[dateStr] = 0;
            dailyItems[dateStr] = [];
        }

        filteredExpenses.forEach(e => {
            const dateKey = e.date.split('T')[0];
            if (dailyTotals.hasOwnProperty(dateKey)) {
                dailyTotals[dateKey] += e.amount;
                dailyItems[dateKey].push(e);
            }
        });

        return Object.entries(dailyTotals).map(([date, value]) => {
            const d = new Date(date);
            const dayLabel = d.getDate().toString();
            return {
                value,
                label: dayLabel,
                frontColor: colors.primary,
                spacing: 12,
                labelTextStyle: { color: '#64748b', fontSize: 10 },
                onPress: () => {
                    setSelectedDayExpenses({
                        date: d.toDateString(),
                        items: dailyItems[date] || []
                    });
                    setModalVisible(true);
                }
            };
        });
    }, [filteredExpenses, selectedMonth]);


    // --- Render Helpers ---

    const renderCenterLabel = () => {
        if (selectedCategory) {
            return (
                <TouchableOpacity onPress={() => setSelectedCategory(null)} style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, color: '#0d1b12', fontWeight: 'bold' }}>
                        {Math.round((selectedCategory.value / totalSpend) * 100)}%
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 }}>
                        {selectedCategory.name}
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.primaryDark, fontWeight: 'bold', marginTop: 2 }}>
                        K {selectedCategory.value >= 1000 ? (selectedCategory.value / 1000).toFixed(1) + 'k' : selectedCategory.value}
                    </Text>
                </TouchableOpacity>
            );
        }
        return (
            <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, color: '#0d1b12', fontWeight: 'bold' }}>
                    Total
                </Text>
                <Text style={{ fontSize: 13, color: '#64748b' }}>
                    K {(totalSpend / 1000).toFixed(1)}k
                </Text>
            </View>
        );
    };

    // --- Render ---

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader title="Analytics" subtitle="Spending Breakdown" showNotification={false} compact={true} />

            {/* Month Navigation - Sticky */}
            <View style={[styles.navRow, { marginTop: 0, marginBottom: 8 }]}>
                <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn}>
                    <ChevronLeft size={24} color="#0d1b12" />
                </TouchableOpacity>

                <View style={styles.dateDisplay}>
                    <Calendar size={16} color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.dateText}>{monthLabel}</Text>
                </View>

                <TouchableOpacity
                    onPress={goToNextMonth}
                    style={[styles.navBtn, isNextDisabled && { opacity: 0.3 }]}
                    disabled={isNextDisabled}
                >
                    <ChevronRight size={24} color="#0d1b12" />
                </TouchableOpacity>
            </View>

            {/* Segment Control */}
            <View style={styles.segmentContainer}>
                <TouchableOpacity
                    style={[styles.segmentBtn, segment === 'all' && styles.segmentActive]}
                    onPress={() => setSegment('all')}
                >
                    <Text style={[styles.segmentText, segment === 'all' && styles.segmentTextActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.segmentBtn, segment === 'personal' && styles.segmentActive]}
                    onPress={() => setSegment('personal')}
                >
                    <Text style={[styles.segmentText, segment === 'personal' && styles.segmentTextActive]}>Personal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.segmentBtn, segment === 'business' && styles.segmentActive]}
                    onPress={() => setSegment('business')}
                >
                    <Text style={[styles.segmentText, segment === 'business' && styles.segmentTextActive]}>Business</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Main Summary Card */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Total Spent</Text>
                    <Text style={styles.summaryAmount}>KES {totalSpend.toLocaleString()}</Text>
                    <View style={styles.trendRow}>
                        <TrendingUp size={16} color={colors.danger} />
                        <Text style={styles.trendText}>Tracking {filteredExpenses.length} transactions</Text>
                    </View>
                </View>

                {/* Pie Chart Section */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Category Distribution</Text>

                    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                        <PieChart
                            data={pieData}
                            donut
                            showText={false}
                            radius={110}
                            innerRadius={65}
                            focusOnPress
                            sectionAutoFocus
                            centerLabelComponent={renderCenterLabel}
                        />
                    </View>

                    {/* Legend Toggle */}
                    <TouchableOpacity
                        onPress={() => setShowLegend(!showLegend)}
                        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', padding: 8, marginTop: -10, marginBottom: 5 }}
                    >
                        <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500', marginRight: 6 }}>Legend</Text>
                        {showLegend ? <EyeOff size={16} color="#64748b" /> : <Eye size={16} color="#64748b" />}
                    </TouchableOpacity>

                    {/* Interactive Legend */}
                    {showLegend && (
                        <View style={[styles.legendContainer, { marginTop: 0 }]}>
                            {pieData.map((item, i) => {
                                const isSelected = selectedCategory && selectedCategory.name === item.legend;
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[styles.legendItem, isSelected && styles.legendItemActive]}
                                        onPress={item.onPress}
                                    >
                                        <View style={[styles.dot, { backgroundColor: item.color }]} />
                                        <Text style={[styles.legendText, isSelected && styles.legendTextActive]} numberOfLines={1}>
                                            {item.legend}
                                        </Text>
                                        <Text style={[styles.legendValue, isSelected && styles.legendTextActive]}>
                                            {Math.round((item.value / totalSpend) * 100)}%
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Bar Chart Section */}
                <View style={[styles.chartCard, { overflow: 'hidden' }]}>
                    <Text style={styles.chartTitle}>Daily Spending</Text>
                    <Text style={styles.chartSubtitle}>Scroll to view full month • Tap bars for details</Text>
                    <View style={{ paddingVertical: 16 }}>
                        <BarChart
                            key={selectedMonth.toISOString()}
                            data={barData}
                            barWidth={22}
                            spacing={14}
                            noOfSections={3}
                            barBorderRadius={4}
                            frontColor={colors.primary}
                            yAxisThickness={0}
                            xAxisThickness={1}
                            xAxisColor={'#e2e8f0'}
                            hideRules
                            height={160}
                            width={screenWidth - 90}
                            scrollAnimation={false}
                            isAnimated={false}
                        />
                    </View>
                </View>

            </ScrollView>

            {/* Daily Details Modal */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                statusBarTranslucent
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) + 10, backgroundColor: 'white' }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Daily Breakdown</Text>
                                <Text style={styles.modalSubtitle}>{selectedDayExpenses?.date}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                                <X size={24} color="#0d1b12" />
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={selectedDayExpenses?.items || []}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ padding: 16 }}
                            ListEmptyComponent={
                                <View style={{ alignItems: 'center', padding: 20 }}>
                                    <Text style={{ color: '#64748b' }}>No expenses for this day.</Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <TransactionRow
                                    item={item}
                                    onPress={(item) => {
                                        setSelectedTx(item);
                                        setDetailModalVisible(true);
                                    }}
                                    showDate={false}
                                />
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <TransactionDetailModal
                visible={detailModalVisible}
                transaction={selectedTx}
                onClose={() => setDetailModalVisible(false)}
                onUpdate={loadData}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 10 },

    // Navigation
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 5, marginBottom: 10, backgroundColor: 'white', borderRadius: 16, padding: 6, elevation: 1 },
    navBtn: { padding: 10, borderRadius: 12, backgroundColor: '#f1f5f9' },
    dateDisplay: { flexDirection: 'row', alignItems: 'center' },
    dateText: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },

    summaryCard: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
    },
    summaryLabel: { fontSize: 14, color: '#64748b', marginBottom: 4 },
    summaryAmount: { fontSize: 28, fontWeight: 'bold', color: '#0d1b12', marginBottom: 8 },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    trendText: { fontSize: 13, color: '#64748b' },

    chartCard: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
    },
    chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12', marginBottom: 4 },
    chartSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 16 },

    legendContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
    legendItem: { flexDirection: 'row', alignItems: 'center', width: '48%', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
    legendItemActive: { borderColor: colors.primary, backgroundColor: '#f0fdf4' },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    legendText: { fontSize: 12, color: '#475569', flex: 1 },
    legendTextActive: { fontWeight: 'bold', color: '#0d1b12' },
    legendValue: { fontSize: 12, fontWeight: '600', color: '#0d1b12' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0d1b12' },
    modalSubtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
    closeBtn: { padding: 8, backgroundColor: '#f1f5f9', borderRadius: 20 },

    // Transaction Rows
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
    iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    txTitle: { fontSize: 14, fontWeight: '600', color: '#0d1b12', marginBottom: 2 },
    txMeta: { fontSize: 12, color: '#64748b' },
    txAmount: { fontSize: 14, fontWeight: 'bold', color: '#dc2626' },

    // Segment
    segmentContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        padding: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 14,
        marginBottom: 8
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 10,
    },
    segmentActive: {
        backgroundColor: '#FFF',
        elevation: 1,
        shadowOpacity: 0.1
    },
    segmentText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B'
    },
    segmentTextActive: {
        color: colors.text
    },
});

export default VisualAnalyticsScreen;
