import React, { useState, useEffect, useMemo } from "react";
import {
    View, Text, StyleSheet, SectionList, TouchableOpacity, TextInput, ActivityIndicator, StatusBar, Image
} from "react-native";
import { MonthPicker } from '../components/MonthPicker';
import { colors } from "../theme/colors";
import { ScreenHeader } from "../components/ScreenHeader";
import { TransactionRow } from "../components/TransactionRow";
import { TransactionDetailModal } from "../components/TransactionDetailModal";
import {
    Search,
    Filter,
    Plus,
    ArrowUpRight,
    ArrowDownLeft,
    ArrowLeft,
    SlidersHorizontal,
    Mic,
    LayoutList,
    AlertTriangle,
    ShoppingBasket,
    Fuel,
    Utensils,
    Bus,
    Zap,
    Smartphone,
    MoreHorizontal,
    Edit3
} from "lucide-react-native";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { Expense } from "../services/ledger/Schema";
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from "@react-navigation/native";

// Helper to get relative date label
const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (target.getTime() === today.getTime()) return "Today";
    if (target.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Category Icon Helper (Reused logic, inline for self-containment or could import)
export const getCategoryIcon = (name?: string | null) => {
    const n = (name || 'Other').toLowerCase();
    if (n.includes('stock')) return ShoppingBasket;
    if (n.includes('fuel')) return Fuel;
    if (n.includes('food')) return Utensils;
    if (n.includes('transport')) return Bus;
    if (n.includes('util')) return Zap;
    if (n.includes('airtime')) return Smartphone;
    return MoreHorizontal;
};

export const getCategoryColor = (name?: string | null) => {
    const n = (name || 'Other').toLowerCase();
    if (n.includes('stock')) return "#10B981";
    if (n.includes('fuel')) return "#3B82F6";
    if (n.includes('food')) return "#F59E0B";
    if (n.includes('transport')) return "#8B5CF6";
    return "#64748B"; // Default gray
};

import { LucideIcon } from 'lucide-react-native';

interface FilterChipProps {
    label: string;
    icon: LucideIcon;
    isActive: boolean;
    activeColor: string;
    defaultColor?: string;
    onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, icon: Icon, isActive, activeColor, defaultColor = colors.text, onPress }) => {
    return (
        <TouchableOpacity
            style={[
                styles.filterChip,
                // Simple background switch, exactly like the 'All' pill
                isActive ? { backgroundColor: activeColor } : { backgroundColor: '#FFF' }
            ]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Icon size={16} color={isActive ? '#FFF' : defaultColor} />
            <Text style={[
                styles.filterText,
                isActive ? { color: '#FFF' } : { color: defaultColor }
            ]}>{label}</Text>
        </TouchableOpacity>
    );
};

const AnalyticsScreen = ({ navigation, route }: any) => {
    const tabBarHeight = useBottomTabBarHeight();
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'review'>('all');
    const [segment, setSegment] = useState<'all' | 'business' | 'personal'>('all');
    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

    // Initialize search query from params if available
    const [searchQuery, setSearchQuery] = useState(route.params?.searchQuery || "");

    useEffect(() => {
        if (route.params?.searchQuery) {
            setSearchQuery(route.params.searchQuery);
        }
    }, [route.params?.searchQuery]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(false);
    const [totals, setTotals] = useState({ today: 0, yesterday: 0 });

    const loadData = async () => {
        setLoading(true);
        const repo = new ExpenseRepository();
        const all = await repo.getExpensesByMonth(currentMonth);
        // Note: repo.getExpensesByMonth expects 'YYYY-MM'

        // Let's actually get all expenses from recent months to show list
        // For simplicity reusing getExpensesByMonth for current month + simple logic
        // Ideally we'd use `repo.getAllExpenses()`

        setExpenses(all);
        setLoading(false);
    };

    useFocusEffect(
        React.useCallback(() => {
            loadData();
        }, [currentMonth])
    );

    // Removed changeMonth function

    const formatMonthReadable = (isoMonth: string) => {
        const [y, m] = isoMonth.split('-').map(Number);
        const date = new Date(y, m - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    // Filtering & Grouping
    const sections = useMemo(() => {
        let filtered = expenses.filter(e => {
            // 1. Segment Filter (Business vs Personal)
            if (segment === 'business' && !e.isBusiness) return false;
            if (segment === 'personal' && e.isBusiness) return false;

            // 2. Search
            const q = searchQuery.toLowerCase();
            const matchesSearch = e.description.toLowerCase().includes(q) ||
                (e.categoryName || '').toLowerCase().includes(q) ||
                e.amount.toString().includes(q);
            if (!matchesSearch) return false;

            // 3. Type Filter (Income/Expense/Review)
            if (filterType === 'all') return true;
            if (filterType === 'review') return !e.isVerified; // Assuming review = unverified
            return e.type === filterType;
        });

        // Sort Descending
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Group by Date
        const grouped: { [key: string]: Expense[] } = {};
        filtered.forEach(e => {
            const dateKey = e.date.split('T')[0];
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(e);
        });

        const result = Object.keys(grouped).map(dateKey => ({
            title: getDateLabel(dateKey),
            data: grouped[dateKey],
            total: grouped[dateKey].reduce((acc, curr) =>
                curr.type === 'expense' ? acc - curr.amount : acc + curr.amount
                , 0)
        }));

        return result;
    }, [expenses, searchQuery, filterType, segment]);

    const renderHeader = () => (
        <View style={{ backgroundColor: colors.background, paddingBottom: 10 }}>
            <ScreenHeader
                title="Transaction Ledger"
                subtitle="Monthly Activity"
                showNotification={false}
            />

            <MonthPicker
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                maxMonth={new Date().toISOString().slice(0, 7)}
            />

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Search size={20} color={colors.textSecondary} style={{ marginLeft: 12 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search (e.g. 'Fuel', 'Tomatoes')"
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
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

            {/* Quick Filters */}
            <View style={styles.filtersRow}>
                <FilterChip
                    label="All"
                    icon={LayoutList}
                    isActive={filterType === 'all'}
                    activeColor="#0F172A"
                    onPress={() => setFilterType('all')}
                />
                <FilterChip
                    label="Income"
                    icon={ArrowDownLeft}
                    isActive={filterType === 'income'}
                    activeColor="#10B981"
                    defaultColor="#10B981"
                    onPress={() => setFilterType('income')}
                />
                <FilterChip
                    label="Expense"
                    icon={ArrowUpRight}
                    isActive={filterType === 'expense'}
                    activeColor="#EF4444"
                    defaultColor="#EF4444"
                    onPress={() => setFilterType('expense')}
                />
                <FilterChip
                    label="Review"
                    icon={AlertTriangle}
                    isActive={filterType === 'review'}
                    activeColor="#F97316"
                    defaultColor="#F97316"
                    onPress={() => setFilterType('review')}
                />
            </View>
        </View >
    );

    const [selectedTx, setSelectedTx] = useState<Expense | null>(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    const handleTransactionPress = (item: Expense) => {
        setSelectedTx(item);
        setDetailModalVisible(true);
    };

    const handleTransactionUpdate = async () => {
        await loadData();
    };

    const renderTransactionResponse = ({ item }: { item: Expense }) => {
        return (
            <TransactionRow
                item={item}
                onPress={handleTransactionPress}
                showDate={false}
            />
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

            {/* Sticky Header Wrapper */}
            <View style={{ backgroundColor: colors.background, paddingBottom: 8 }}>
                {renderHeader()}
            </View>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={renderTransactionResponse}
                renderSectionHeader={({ section: { title, total } }) => (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
                        <Text style={styles.sectionTotal}>KES {total.toLocaleString()} Total</Text>
                    </View>
                )}
                contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={true}
                ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 60 }}>
                        <Text style={{ color: colors.textSecondary }}>No transactions found</Text>
                    </View>
                }
            />

            {/* FAB */}
            <TouchableOpacity
                style={[styles.fab, { bottom: 20 }]} // Fixed offset from bottom of container (above tab bar)
                onPress={() => navigation.navigate('AddManual')}
                activeOpacity={0.8}
            >
                <Plus size={32} color="#0d1b12" />
            </TouchableOpacity>

            <TransactionDetailModal
                visible={detailModalVisible}
                transaction={selectedTx}
                onClose={() => setDetailModalVisible(false)}
                onUpdate={handleTransactionUpdate}
            />
        </View >
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerContainer: {
        backgroundColor: 'rgba(246, 248, 246, 0.98)',
        zIndex: 10,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12, // slightly reduced
        paddingBottom: 12
    },
    iconBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#F1F5F9'
    },
    screenTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text
    },
    searchContainer: {
        marginHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        height: 50,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 5,
        elevation: 2
    },
    searchInput: {
        flex: 1,
        paddingHorizontal: 12,
        fontSize: 15,
        color: colors.text
    },
    micBtn: {
        padding: 8,
        marginRight: 6,
        backgroundColor: 'rgba(19, 236, 91, 0.1)',
        borderRadius: 10
    },
    segmentContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        padding: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 14,
        marginBottom: 16
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
    filtersRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        gap: 6,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
        // Overflow hidden is key to preventing background bleed on rounded corners if any child has background
        overflow: 'hidden'
    },
    filterText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center', // Changed to center for better alignment when sticky
        paddingTop: 16,     // Added padding for sticky state
        paddingBottom: 8,   // Adjusted padding
        backgroundColor: colors.background, // Opaque background is critical for sticky headers
        // Optional: Add shadow or border if distinct separation is needed
        zIndex: 1
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
        letterSpacing: 0.5
    },
    sectionTotal: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        marginBottom: 12,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 5,
        elevation: 1,
        borderWidth: 1,
        borderColor: 'transparent'
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center'
    },
    cardContent: {
        flex: 1
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
        flex: 1,
        marginRight: 8
    },
    cardAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4
    },
    metaText: {
        fontSize: 12,
        color: colors.textSecondary
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CBD5E1',
        marginHorizontal: 6
    },
    sourceTag: {
        backgroundColor: 'rgba(220, 38, 38, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(220, 38, 38, 0.2)',
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    sourceText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#DC2626',
        textTransform: 'uppercase'
    },
    micTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2
    },
    micText: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textSecondary
    },
    badgeRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 8
    },
    reviewBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FEF3C7',
        paddingVertical: 2,
        paddingHorizontal: 8,
        borderRadius: 6
    },
    reviewText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#92400E'
    },
    confidenceStrip: {
        width: 4,
        height: 40,
        backgroundColor: '#ECFDF5',
        borderRadius: 2,
        justifyContent: 'flex-end',
        overflow: 'hidden',
        marginLeft: 8
    },
    confidenceFill: {
        width: '100%',
        borderRadius: 2
    },
    fab: {
        position: 'absolute',
        bottom: 80, // Above tab bar
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary,
        shadowOpacity: 0.4,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 6,
        borderWidth: 4,
        borderColor: '#FFF'
    },
    // Removed monthNav, navBtn, monthText styles
});

export default AnalyticsScreen;
