import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { LineChart, PieChart } from "react-native-gifted-charts";
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ScreenHeader } from '../components/ScreenHeader';
import { TrendingUp, Info } from 'lucide-react-native';
import { DailyBreakdownSheet } from '../components/DailyBreakdownSheet';
import { MonthPicker } from '../components/MonthPicker';

const SCREEN_WIDTH = Dimensions.get('window').width;

const CHART_COLORS = [
    '#4CAF50', // Green
    '#2196F3', // Blue
    '#FF9800', // Orange
    '#E91E63', // Pink
    '#9C27B0', // Purple
    '#3F51B5', // Indigo
    '#00BCD4', // Cyan
    '#FFEB3B', // Yellow
    '#795548', // Brown
    '#607D8B', // Blue Grey
];

export default function AnalyticsScreen() {
    const insets = useSafeAreaInsets();
    const route = useRoute<any>();

    // Date State (Replaces TimeFrame)
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);

    // Data State
    const [totalSpent, setTotalSpent] = useState(0);
    const [categoryData, setCategoryData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [topCategory, setTopCategory] = useState<string>('');
    const [insightText, setInsightText] = useState<string>('');

    const [focusedCategory, setFocusedCategory] = useState<any>(null);

    // Chart Interaction
    const [selectedPoint, setSelectedPoint] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dailyBreakdown, setDailyBreakdown] = useState<any>(null);

    // Helper state for chart scaling
    const [chartConfig, setChartConfig] = useState({ maxValue: 10000, stepValue: 2500, yAxisOffset: 0 });
    const scrollOffsetRef = useRef(0);

    // Cache State: Key by "YYYY-MM" string
    const analyticsCache = useRef<Record<string, {
        totalSpent: number;
        categoryData: any[];
        trendData: any[];
        topCategory: string;
        insightText: string;
        chartConfig: any;
    }>>({});

    // Refetch on focus or date change
    // Using simple useEffect on currentDate change, plus focus effect for resume
    useFocusEffect(
        useCallback(() => {
            // Check for navigation params
            if (route.params?.date) {
                const paramDate = new Date(route.params.date);
                // Only update if different month to avoid loop
                if (paramDate.getMonth() !== currentDate.getMonth() || paramDate.getFullYear() !== currentDate.getFullYear()) {
                    setCurrentDate(paramDate);
                    // Fetch will trigger via effect below or we call it
                }
            }
            fetchAnalytics();
        }, [currentDate, route.params])
    );

    const getMonthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

    // Memoized Chart Key
    const chartKey = useMemo(() => `chart-${getMonthKey(currentDate)}`, [currentDate]);

    // Memoized Pie Data
    const processedPieData = useMemo(() => {
        return categoryData.map(c => {
            const isFocused = focusedCategory && focusedCategory.name === c.name;
            const isAnyFocused = !!focusedCategory;
            const color = (!isAnyFocused || isFocused) ? c.color : c.color + '50';
            return {
                ...c,
                color: color,
                focused: isFocused,
                onPress: () => handleCategoryPress(c)
            };
        });
    }, [categoryData, focusedCategory]);

    const handleDateChange = (newDate: Date) => {
        setLoading(true);
        // Allow UI to update before fetch
        setTimeout(() => {
            setCurrentDate(newDate);
        }, 50);
    };

    const handlePointPress = (item: any) => {
        const dateToFetch = item.date || item.label;
        if (!dateToFetch) return;

        console.log(`[Analytics] Point Tapped:`, item);

        setSelectedDate(dateToFetch);
        setSelectedPoint({ label: dateToFetch, value: item.value });

        const rawBreakdown = item.breakdown || [];
        const coloredCategories = rawBreakdown.map((cat: any, index: number) => {
            const existing = categoryData.find(c => c.name === cat.name);
            return {
                name: cat.name,
                total: cat.amount,
                color: existing ? existing.color : CHART_COLORS[index % CHART_COLORS.length]
            };
        });

        setDailyBreakdown({
            total: item.value,
            categories: coloredCategories
        });
    };

    const handleDismissSheet = () => {
        setSelectedDate(null);
        setDailyBreakdown(null);
        setSelectedPoint(null);
    };

    const handleCategoryPress = (item: any) => {
        if (focusedCategory?.name === item.name) {
            setFocusedCategory(null);
        } else {
            setFocusedCategory(item);
        }
    };

    const fetchAnalytics = async (forceRefresh = false) => {
        const cacheKey = getMonthKey(currentDate);

        // 1. Check Cache
        if (!forceRefresh && analyticsCache.current[cacheKey]) {
            const cached = analyticsCache.current[cacheKey];
            setTotalSpent(cached.totalSpent);
            setCategoryData(cached.categoryData);
            setTrendData(cached.trendData);
            setTopCategory(cached.topCategory);
            setInsightText(cached.insightText);
            setChartConfig(cached.chartConfig);
            setLoading(false); // Ensure loading off
            return;
        }

        setLoading(true);
        setFocusedCategory(null);

        // Calculate Date Range for chosen Month
        let startDate = '';
        let endDate = '';

        // Start: 1st of month
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        startDate = start.toISOString();

        // End: Last day of month
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        endDate = end.toISOString();

        try {
            const repository = new ExpenseRepository();

            // 1. Category Totals
            const catTotals = await repository.getCategoryTotals(startDate, endDate);

            // Race Check
            if (getMonthKey(currentDate) !== cacheKey) return;

            catTotals.sort((a, b) => b.total - a.total);

            let sum = 0;
            const pieData = catTotals.map((c, index) => {
                sum += c.total;
                return {
                    value: c.total,
                    color: CHART_COLORS[index % CHART_COLORS.length],
                    text: c.name,
                    name: c.name,
                    onPress: () => handleCategoryPress({ name: c.name, value: c.total, color: CHART_COLORS[index % CHART_COLORS.length] }),
                    focused: false,
                };
            });

            const highest = pieData.length > 0 ? pieData[0].name : '';

            // Handle Deep Link Focus
            if (route.params?.focusCategory) {
                const target = pieData.find(p => p.name === route.params.focusCategory);
                if (target) {
                    setFocusedCategory({
                        name: target.name,
                        value: target.value,
                        color: target.color
                    });
                }
            }
            else if (!focusedCategory) {
                setFocusedCategory(null);
            }

            // Handle Deep Link Focus
            if (route.params?.focusCategory) {
                const target = pieData.find(p => p.name === route.params.focusCategory);
                if (target) {
                    setFocusedCategory({
                        name: target.name,
                        value: target.value,
                        color: target.color
                    });
                    // Clear param to avoid re-focusing on swipe back? 
                    // React Navigation params stay unless cleared. 
                    // For now, it's fine as user likely wants to see what they clicked.
                }
            }
            // Only defaults to null if NO param
            else if (!focusedCategory) {
                setFocusedCategory(null);
            }

            // 2. Daily Trends
            const rawDaily = await repository.getDailyTotals(startDate, endDate);

            if (getMonthKey(currentDate) !== cacheKey) return;

            // Fill missing dates with 0
            const daily: { day: string; total: number }[] = [];
            const dStart = new Date(startDate); // Local
            const dEnd = new Date(endDate); // Local

            const current = new Date(dStart);
            current.setHours(12, 0, 0, 0);
            const endCompare = new Date(dEnd);
            endCompare.setHours(12, 0, 0, 0);

            while (current <= endCompare) {
                const y = current.getFullYear();
                const m = String(current.getMonth() + 1).padStart(2, '0');
                const d = String(current.getDate()).padStart(2, '0');
                const dayStr = `${y}-${m}-${d}`;

                const existing = rawDaily.find((rd: any) => rd.day === dayStr);
                daily.push(existing || { day: dayStr, total: 0 });

                current.setDate(current.getDate() + 1);
            }

            // 2. NEW: Batch Breakdown
            let breakdownMap: Record<string, any[]> = {};
            if (daily.length > 0) {
                const days = daily.map(d => d.day).sort();
                const sDate = days[0];
                const eDate = days[days.length - 1];
                breakdownMap = await repository.getDailyBreakdownInRange(sDate, eDate);
                Object.values(breakdownMap).forEach(dayItems => {
                    dayItems.forEach((item: any) => {
                        const existingCat = pieData.find(p => p.name === item.name);
                        item.color = existingCat ? existingCat.color : '#ccc';
                    });
                });
            }

            const lineData = daily.map(d => ({
                value: d.total || 0,
                label: parseInt(d.day.slice(8)).toString(),
                dataPointText: '',
                date: d.day,
                amount: d.total || 0,
                breakdown: breakdownMap[d.day] || [],
                onPress: () => handlePointPress({ label: d.day, value: d.total || 0, date: d.day, breakdown: breakdownMap[d.day] || [] }),
                labelTextStyle: { color: colors.textSecondary, fontSize: 10, width: 30, textAlign: 'center' },
                dataPointRadius: 6,
                dataPointColor: colors.primary,
            }));

            // Y-Axis Scaling
            const dailyValues = lineData.map(d => d.value);
            const dataMin = Math.min(...dailyValues, 0);
            const dataMax = Math.max(...dailyValues, 100);
            const range = dataMax - dataMin;
            const padding = range * 0.1;
            const yMin = Math.max(0, dataMin - padding);
            const yMax = dataMax + padding;
            const magnitude = Math.pow(10, Math.floor(Math.log10(yMax - yMin)));
            const rawStep = (yMax - yMin) / 4;
            let step = Math.ceil(rawStep / (magnitude / 2)) * (magnitude / 2);
            if (step < 1) step = 1;

            const sections = 4;
            const chartMax = yMin + (step * sections);
            const chartMin = yMin;

            const newConfig = {
                maxValue: chartMax,
                stepValue: step,
                yAxisOffset: chartMin
            };

            let newInsightText = "No spending recorded for this period.";
            if (sum > 0) {
                const top = pieData[0];
                const percentage = Math.round((top.value / sum) * 100);
                newInsightText = `Top spending: ${top.name} takes up ${percentage}% of your budget.`;
            }

            setTotalSpent(sum);
            setCategoryData(pieData);
            setTrendData(lineData);
            setTopCategory(highest);
            setInsightText(newInsightText);
            setChartConfig(newConfig);

            analyticsCache.current[cacheKey] = {
                totalSpent: sum,
                categoryData: pieData,
                trendData: lineData,
                topCategory: highest,
                insightText: newInsightText,
                chartConfig: newConfig
            };

        } catch (e) {
            console.error("[Analytics] Error:", e);
        } finally {
            if (getMonthKey(currentDate) === cacheKey) {
                setLoading(false);
            }
        }
    };

    const renderLegend = () => {
        return (
            <View style={styles.legendContainer}>
                {categoryData.slice(0, 6).map((item, idx) => {
                    const isFocused = focusedCategory ? focusedCategory.name === item.name : false;
                    return (
                        <TouchableOpacity
                            key={idx}
                            style={[styles.legendItem, isFocused && { opacity: 1, transform: [{ scale: 1.05 }] }, !isFocused && focusedCategory && { opacity: 0.4 }]}
                            onPress={() => handleCategoryPress(item)}
                        >
                            <View style={[styles.dot, { backgroundColor: item.color }]} />
                            <Text style={[styles.legendText, isFocused && { fontWeight: 'bold', color: colors.text }]}>{item.name}</Text>
                            <Text style={[styles.legendText, { fontWeight: 'bold', marginLeft: 4 }, isFocused && { color: colors.text }]}>
                                {Math.round(item.value / totalSpent * 100)}%
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Analytics"
                subtitle="Financial Insights"
                showNotification={false}
            />

            <View style={{ flex: 1 }}>
                {/* 1. Month Picker (Replaces Tabs) */}
                <MonthPicker date={currentDate} onChange={handleDateChange} />

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 120, paddingTop: 10 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchAnalytics(true)} />}
                >
                    {loading && trendData.length === 0 ? (
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                    ) : (
                        <View>
                            {/* 2. Hero Card */}
                            <View style={styles.heroCard}>
                                <View>
                                    <Text style={styles.heroLabel}>TOTAL SPENT</Text>
                                    <Text style={styles.heroAmount}>Ksh {totalSpent.toLocaleString()}</Text>
                                </View>
                                <View style={styles.trendBadge}>
                                    <TrendingUp size={16} color="white" />
                                    <Text style={styles.trendText}>Monthly View</Text>
                                </View>
                            </View>

                            {/* 3. Donut Chart Card */}
                            <View style={styles.chartCard}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>Breakdown</Text>
                                </View>

                                <View style={{ alignItems: 'center', marginVertical: 10 }}>
                                    {categoryData.length > 0 ? (
                                        <PieChart
                                            data={processedPieData}
                                            donut
                                            sectionAutoFocus
                                            radius={100}
                                            innerRadius={65}
                                            innerCircleColor={colors.surface}
                                            centerLabelComponent={() => {
                                                const activeItem = focusedCategory || (categoryData.length > 0 ? categoryData[0] : null);
                                                const percentage = activeItem ? Math.round((activeItem.value / totalSpent) * 100) : 0;
                                                const amountText = activeItem
                                                    ? (activeItem.value >= 1000
                                                        ? `Ksh ${(activeItem.value / 1000).toFixed(1)}k`
                                                        : `Ksh ${activeItem.value.toLocaleString()}`)
                                                    : '0';

                                                return (
                                                    <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                                                        <Text style={{ fontSize: 28, color: colors.text, fontWeight: '800' }}>
                                                            {percentage}%
                                                        </Text>
                                                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                                                            {amountText}
                                                        </Text>
                                                        <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>
                                                            {activeItem?.name || 'No Data'}
                                                        </Text>
                                                    </View>
                                                );
                                            }}
                                        />
                                    ) : (
                                        <View style={styles.noDataContainer}>
                                            <Text style={styles.noDataText}>No data for this period</Text>
                                        </View>
                                    )}
                                </View>
                                {renderLegend()}
                            </View>

                            {/* 4. Line Chart Card */}
                            <View style={styles.chartCard}>
                                <View style={styles.cardHeader}>
                                    <Text style={styles.cardTitle}>Daily Trend</Text>
                                    {selectedPoint ? (
                                        <Text style={styles.cardSubtitle}>
                                            {selectedPoint.label}: Ksh {selectedPoint.value.toLocaleString()}
                                        </Text>
                                    ) : (
                                        <Text style={[styles.cardSubtitle, { fontSize: 10, fontStyle: 'italic' }]}>
                                            Tap points for details
                                        </Text>
                                    )}
                                </View>

                                <View style={{ paddingVertical: 20, overflow: 'hidden' }}>
                                    {trendData.length > 0 ? (
                                        <LineChart
                                            key={chartKey}
                                            data={trendData}
                                            color={colors.primary}
                                            thickness={3}
                                            startFillColor={colors.primary}
                                            endFillColor={colors.primary}
                                            startOpacity={0.2}
                                            endOpacity={0.05}
                                            initialSpacing={20}
                                            spacing={50}
                                            noOfSections={4}
                                            maxValue={Number(chartConfig.maxValue) || 10000}
                                            stepValue={Number(chartConfig.stepValue) || 2500}
                                            yAxisOffset={Number(chartConfig.yAxisOffset) || 0}
                                            hideYAxisText={false}
                                            yAxisThickness={0}
                                            yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                                            yAxisLabelWidth={35}
                                            formatYLabel={(label: string) => {
                                                const val = Number(label) + (Number(chartConfig.yAxisOffset) || 0);
                                                if (val >= 1000) return (val / 1000).toFixed(val < 10000 ? 1 : 0) + 'k';
                                                return val.toFixed(0);
                                            }}
                                            xAxisColor={'#ddd'}
                                            xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                                            hideRules
                                            width={SCREEN_WIDTH - 80}
                                            // @ts-ignore
                                            scrollable
                                            onScroll={(e: any) => {
                                                scrollOffsetRef.current = e?.nativeEvent?.contentOffset?.x ?? 0;
                                            }}
                                            scrollEventThrottle={16}
                                            curved
                                            curveType={1}
                                            isAnimated={false}
                                            areaChart
                                            onPress={undefined}
                                            focusEnabled={false}
                                            dataPointsRadius={10}
                                            dataPointsColor={colors.primary}
                                        />
                                    ) : (
                                        <View style={styles.noDataContainer}>
                                            <Text style={styles.noDataText}>No trend data yet</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* 5. Insight */}
                            <View style={styles.insightCard}>
                                <Info size={20} color={colors.info} style={{ marginRight: 10 }} />
                                <Text style={styles.insightText}>{insightText}</Text>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </View>

            <DailyBreakdownSheet
                date={selectedDate}
                data={dailyBreakdown}
                onDismiss={handleDismissSheet}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    // Hero
    heroCard: {
        marginHorizontal: 20,
        marginBottom: 20,
        padding: 24,
        backgroundColor: colors.primary,
        borderRadius: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        elevation: 8,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    heroLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 4,
        letterSpacing: 1,
    },
    heroAmount: {
        color: 'white',
        fontSize: 32,
        fontWeight: '800',
    },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    trendText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    // Charts
    chartCard: {
        backgroundColor: colors.surface,
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 24,
        padding: 20,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    cardTitle: {
        ...typography.subHeader,
        fontSize: 16,
        color: colors.text,
    },
    cardSubtitle: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '600',
    },
    noDataContainer: {
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noDataText: {
        color: colors.textSecondary,
        fontStyle: 'italic',
    },
    legendContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 15,
        justifyContent: 'center',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 16,
        marginBottom: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    legendText: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    // Insight
    insightCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E3F2FD',
        marginHorizontal: 20,
        marginBottom: 30,
        padding: 16,
        borderRadius: 16,
        borderLeftWidth: 4,
        borderLeftColor: colors.info
    },
    insightText: {
        flex: 1,
        color: colors.text,
        fontSize: 13,
        lineHeight: 20
    }
});
