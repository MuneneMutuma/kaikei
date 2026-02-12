import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator, Platform, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart, PieChart } from "react-native-gifted-charts";
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ScreenHeader } from '../components/ScreenHeader';
import { Check, ChevronDown, TrendingDown, TrendingUp, Info } from 'lucide-react-native';
import { DailyBreakdownSheet } from '../components/DailyBreakdownSheet';

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

type TimeFrame = 'week' | 'month' | 'last_month';

export default function AnalyticsScreen() {
    const insets = useSafeAreaInsets();
    const [timeFrame, setTimeFrame] = useState<TimeFrame>('month');
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
    const scrollOffsetRef = useRef(0); // Track chart scroll position for tooltip bounds
    // Cache State to prevent creating lag
    const analyticsCache = useRef<Record<TimeFrame, {
        totalSpent: number;
        categoryData: any[];
        trendData: any[];
        topCategory: string;
        insightText: string;
        chartConfig: any;
    } | null>>({ week: null, month: null, last_month: null });

    // Initial Load
    // useEffect removed to prevent double fetch

    // Refetch on focus (with cache check)
    useFocusEffect(
        useCallback(() => {
            fetchAnalytics();
        }, [timeFrame])
    );

    // Memoized Chart Key to prevent unnecessary path recalculation
    const chartKey = useMemo(() => `chart-${timeFrame}`, [timeFrame]);

    // Memoized Pie Data (Transform outside render)
    const processedPieData = useMemo(() => {
        return categoryData.map(c => {
            const isFocused = focusedCategory && focusedCategory.name === c.name;
            const isAnyFocused = !!focusedCategory;
            // Fade others if one is focused
            const color = (!isAnyFocused || isFocused) ? c.color : c.color + '50';
            return {
                ...c,
                color: color,
                focused: isFocused,
                onPress: () => handleCategoryPress(c)
            };
        });
    }, [categoryData, focusedCategory]);

    const handleTimeFrameChange = (t: TimeFrame) => {
        setLoading(true);
        // Allow UI to update (spinner/tab) before mounting heavy chart
        setTimeout(() => {
            setTimeFrame(t);
        }, 50);
    };

    const handlePointPress = async (item: any) => {
        // Use safe date accessor
        const dateToFetch = item.date || item.label;
        if (!dateToFetch) return;

        // 1. Set the date first to trigger the Modal "Visible" prop
        setSelectedDate(dateToFetch);
        setSelectedPoint({ label: dateToFetch, value: item.value });

        console.log(`[Analytics] Point Tapped:`, item);

        // 2. Clear previous breakdown so the sheet doesn't show old data while loading
        setDailyBreakdown(null);

        // 3. Small delay to let the Modal mount before heavy data fetching
        setTimeout(async () => {
            try {
                const repository = new ExpenseRepository();
                const breakdown = await repository.getCategoryBreakdownForDate(dateToFetch);

                // 4. Update the breakdown data with Colors
                const coloredBreakdown = {
                    total: breakdown.total,
                    categories: breakdown.categories.map((cat, index) => {
                        // Try to find existing color from main chart
                        const existing = categoryData.find(c => c.name === cat.name);
                        return {
                            ...cat,
                            color: existing ? existing.color : CHART_COLORS[index % CHART_COLORS.length]
                        };
                    })
                };

                setDailyBreakdown(coloredBreakdown);
            } catch (e) {
                console.error("Failed to fetch daily breakdown", e);
                Alert.alert("Error", "Could not load details for this day.");
                handleDismissSheet();
            }
        }, 200);
    };

    const handleDismissSheet = () => {
        setSelectedDate(null);
        setDailyBreakdown(null);
        setSelectedPoint(null);
    };

    const handleCategoryPress = (item: any) => {
        // Toggle focusing: If already focused, reset to top item (or null to show top)
        if (focusedCategory?.name === item.name) {
            setFocusedCategory(null);
        } else {
            setFocusedCategory(item);
        }
    };

    const fetchAnalytics = async (forceRefresh = false) => {
        const currentRequestTimeFrame = timeFrame; // Capture current timeframe

        // 1. Check Cache
        if (!forceRefresh && analyticsCache.current[timeFrame]) {
            const cached = analyticsCache.current[timeFrame]!;
            if (currentRequestTimeFrame !== timeFrame) return; // Race condition check

            setTotalSpent(cached.totalSpent);
            setCategoryData(cached.categoryData);
            setTrendData(cached.trendData);
            setTopCategory(cached.topCategory);
            setInsightText(cached.insightText);
            setChartConfig(cached.chartConfig);
            return;
        }

        setLoading(true);
        setFocusedCategory(null); // Reset focus on new fetch
        const now = new Date();
        let startDate = '';
        let endDate = '';

        // Calculate Date Ranges
        if (timeFrame === 'week') {
            const start = new Date(now);
            start.setDate(now.getDate() - now.getDay()); // Sunday
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();

            // End at NOW (Today)
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();

        } else if (timeFrame === 'month') {
            // Start: 1st of current month
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();

            // End: NOW (Today)
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();

        } else if (timeFrame === 'last_month') {
            // Start: 1st of previous month
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString();

            // End: Last day of previous month
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString();
        }

        try {
            const repository = new ExpenseRepository();

            // 1. Category Totals (for Donut)
            const catTotals = await repository.getCategoryTotals(startDate, endDate);

            // Check race condition AGAIN after await
            if (currentRequestTimeFrame !== timeFrame) return;

            // Sort by Total Descending
            catTotals.sort((a, b) => b.total - a.total);

            let sum = 0;
            const pieData = catTotals.map((c, index) => {
                sum += c.total;
                return {
                    value: c.total,
                    color: CHART_COLORS[index % CHART_COLORS.length],
                    text: c.name,
                    name: c.name,
                    // Interaction Props
                    onPress: () => handleCategoryPress({ name: c.name, value: c.total, color: CHART_COLORS[index % CHART_COLORS.length] }),
                    focused: false, // Will be handled by render logic or state
                };
            });

            const highest = pieData.length > 0 ? pieData[0].name : '';

            setTotalSpent(sum);
            setCategoryData(pieData);
            setTopCategory(highest);

            // 2. Daily Trends (for Line Chart)
            const rawDaily = await repository.getDailyTotals(startDate, endDate);

            // Check race condition AGAIN after await
            if (currentRequestTimeFrame !== timeFrame) return;

            // Fill missing dates with 0
            const daily: { day: string; total: number }[] = [];
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Timezone-safe iteration: 
            // We iterate day-by-day adding 24hrs, but rely on ISO string slicing 
            // which can be tricky. Better: use the logic we set up for start/end.

            const current = new Date(start);
            // Reset to prevent any time drift issues
            current.setHours(12, 0, 0, 0); // Noon prevents DST shifts affecting date
            const endCompare = new Date(end);
            endCompare.setHours(12, 0, 0, 0);

            while (current <= endCompare) {
                // Manually construct YYYY-MM-DD to match DB
                const y = current.getFullYear();
                const m = String(current.getMonth() + 1).padStart(2, '0');
                const d = String(current.getDate()).padStart(2, '0');
                const dayStr = `${y}-${m}-${d}`;

                const existing = rawDaily.find((rd: any) => rd.day === dayStr);
                daily.push(existing || { day: dayStr, total: 0 });

                current.setDate(current.getDate() + 1);
            }


            // 2. NEW: Fetch Breakdown for Tooltips (Batch)
            let breakdownMap: Record<string, any[]> = {};
            if (daily.length > 0) {
                const days = daily.map(d => d.day).sort();
                const startDate = days[0];
                const endDate = days[days.length - 1];
                // Color Mapping: Match breakdown categories to global chart colors
                breakdownMap = await repository.getDailyBreakdownInRange(startDate, endDate);

                // Post-process to add colors from frontend state or palette
                Object.values(breakdownMap).forEach(dayItems => {
                    dayItems.forEach((item: any) => {
                        // Find matching category in pieData to get its consistent color
                        const existingCat = pieData.find(p => p.name === item.name);
                        item.color = existingCat ? existingCat.color : '#ccc';
                    });
                });
            }

            // Map to gifted-charts format
            const lineData = daily.map(d => ({
                value: d.total || 0, // Ensure no nulls
                label: parseInt(d.day.slice(8)).toString(), // "01" -> "1"
                dataPointText: '',
                // Custom properties for interaction
                date: d.day,
                amount: d.total || 0,
                breakdown: breakdownMap[d.day] || [], // Inject Breakdown Data

                // No onPress here! This keeps scrolling smooth.
                // Interaction handled via Pointer Tooltip.
                onPress: () => handlePointPress({ label: d.day, value: d.total || 0, date: d.day }),

                labelTextStyle: { color: colors.textSecondary, fontSize: 10, width: 30, textAlign: 'center' },
                // Visual Hit-Box
                dataPointRadius: 6,
                dataPointColor: colors.primary
            }));

            console.log(`[Analytics] Line Data Points: ${lineData.length}`, lineData[0], lineData[lineData.length - 1]);

            // Y-Axis Dynamic Scaling (from DAILY data points, not aggregates)
            const dailyValues = lineData.map(d => d.value);
            const dataMin = Math.min(...dailyValues, 0);
            const dataMax = Math.max(...dailyValues, 100); // Ensure non-zero

            // Add 10% padding for visual breathing room
            const range = dataMax - dataMin;
            const padding = range * 0.1;
            const yMin = Math.max(0, dataMin - padding); // Don't go below 0 for expenses
            const yMax = dataMax + padding;

            // Calculate smart step size based on magnitude
            const magnitude = Math.pow(10, Math.floor(Math.log10(yMax - yMin)));
            const rawStep = (yMax - yMin) / 4;
            let step = Math.ceil(rawStep / (magnitude / 2)) * (magnitude / 2);

            // Ensure step is at least 1
            if (step < 1) step = 1;

            // Calculate final chart bounds (exactly 4 sections)
            const sections = 4;
            const chartMax = yMin + (step * sections);
            const chartMin = yMin;

            // Store chart configuration
            const newConfig = {
                maxValue: chartMax,
                stepValue: step,
                yAxisOffset: chartMin // Used to shift baseline
            };

            // 3. Simple Insight Generation
            let newInsightText = "No spending recorded for this period.";
            if (sum > 0) {
                const top = pieData[0];
                const percentage = Math.round((top.value / sum) * 100);
                newInsightText = `Top spending: ${top.name} takes up ${percentage}% of your budget.`;
            }

            // Update State
            setTotalSpent(sum);
            setCategoryData(pieData);
            setTrendData(lineData);
            setTopCategory(highest);
            setInsightText(newInsightText);
            setChartConfig(newConfig);

            // Update Cache
            analyticsCache.current[timeFrame] = {
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
            // Only clear loading if we are still on the active request
            if (currentRequestTimeFrame === timeFrame) {
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

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchAnalytics(true)} />}
            >
                {/* 1. Time Frame Tabs (Segmented Control Style) */}
                <View style={styles.tabWrapper}>
                    <View style={styles.tabContainer}>
                        {(['week', 'month', 'last_month'] as TimeFrame[]).map((t) => (
                            <TouchableOpacity
                                key={t}
                                style={[styles.tab, timeFrame === t && styles.activeTab]}
                                onPress={() => handleTimeFrameChange(t)}
                            >
                                <Text style={[styles.tabText, timeFrame === t && styles.activeTabText]}>
                                    {t === 'last_month' ? 'Last Month' : t.charAt(0).toUpperCase() + t.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {loading && trendData.length === 0 ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                ) : (
                    <View>
                        {/* 2. Hero Card (Gradient or Solid Primary) */}
                        <View style={styles.heroCard}>
                            <View>
                                <Text style={styles.heroLabel}>TOTAL SPENT</Text>
                                <Text style={styles.heroAmount}>Ksh {totalSpent.toLocaleString()}</Text>
                            </View>
                            <View style={styles.trendBadge}>
                                <TrendingUp size={16} color="white" />
                                <Text style={styles.trendText}>Insights Ready</Text>
                            </View>
                        </View>

                        {/* 3. Donut Chart Card */}
                        <View style={styles.chartCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>Category Breakdown</Text>
                            </View>

                            <View style={{ alignItems: 'center', marginVertical: 10 }}>
                                {categoryData.length > 0 ? (
                                    <PieChart
                                        data={processedPieData}
                                        donut
                                        // showGradient // Disabled to prevent url(#grad0) error
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
                                <Text style={styles.cardTitle}>Spending Trend</Text>
                                {selectedPoint ? (
                                    <Text style={styles.cardSubtitle}>
                                        {selectedPoint.label}: Ksh {selectedPoint.value.toLocaleString()}
                                    </Text>
                                ) : (
                                    <Text style={[styles.cardSubtitle, { fontSize: 10, fontStyle: 'italic' }]}>
                                        Tap a point for daily details
                                    </Text>
                                )}
                            </View>

                            <View style={{ paddingVertical: 20, overflow: 'hidden' }}>
                                {trendData.length > 0 ? (
                                    <LineChart
                                        key={chartKey} // ONLY changes when timeframe changes
                                        data={trendData}
                                        color={colors.primary}
                                        thickness={3}
                                        dataPointsColor={colors.primary}
                                        startFillColor={colors.primary}
                                        endFillColor={colors.primary}
                                        startOpacity={0.2}
                                        endOpacity={0.05}
                                        initialSpacing={20}
                                        spacing={50} // Ensure scrollable width > container
                                        // xAxisLabelShift={-20}
                                        noOfSections={4}
                                        maxValue={Number(chartConfig.maxValue) || 10000}
                                        stepValue={Number(chartConfig.stepValue) || 2500}
                                        yAxisOffset={Number(chartConfig.yAxisOffset) || 0} // Shifts baseline for dynamic min
                                        // Y-Axis: Standard Scale
                                        hideYAxisText={false}
                                        yAxisThickness={0}
                                        yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }} // Visible
                                        yAxisLabelWidth={35}
                                        formatYLabel={(label: string) => {
                                            const val = Number(label) + (Number(chartConfig.yAxisOffset) || 0);
                                            // Precision Logic: 1.9k instead of 2k
                                            if (val >= 1000) return (val / 1000).toFixed(val < 10000 ? 1 : 0) + 'k';
                                            return val.toFixed(0);
                                        }}
                                        xAxisColor={'#ddd'}
                                        xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                                        hideRules
                                        // Scroll Logic: Width must be container width
                                        width={SCREEN_WIDTH - 80}
                                        // @ts-ignore
                                        scrollable
                                        onScroll={(e: any) => {
                                            scrollOffsetRef.current = e?.nativeEvent?.contentOffset?.x ?? 0;
                                        }}
                                        scrollEventThrottle={16}
                                        // Dips Fix: Disable curve or set VERY low
                                        curved
                                        curveType={1} // Monotone Cubic - prevents overshoots
                                        isAnimated={false} // Disable animation to stop the "hanging line" logic
                                        areaChart
                                        // Touch Conflict: Handled by individual points
                                        onPress={undefined}
                                        focusEnabled={false} // Allow ScrollView to win touch events
                                        dataPointsRadius={6}
                                        pointerConfig={{
                                            activatePointersOnLongPress: true,
                                            pointerVanishDelay: 10000,
                                            pointerStripWidth: 2,
                                            pointerStripColor: '#e0e0e0',
                                            pointerStripUptoDataPoint: true,
                                            pointerColor: colors.primary,
                                            radius: 5,
                                            pointerLabelWidth: 140,
                                            pointerLabelHeight: 300,
                                            autoAdjustPointerLabelPosition: false,
                                            pointerLabelComponent: (items: any[]) => {
                                                const item = items[0];
                                                const breakdown = item.breakdown || [];

                                                // --- Viewport-Relative Bounds Checking ---
                                                const TOOLTIP_W = 140;
                                                const HALF = TOOLTIP_W / 2; // 70
                                                const INIT_SPACING = 20;
                                                const SPACING = 50;
                                                const PADDING = 15;
                                                const VIEWPORT_W = SCREEN_WIDTH - 80;
                                                const maxVal = Number(chartConfig.maxValue) || 10000;

                                                // Find actual index (pointerIndex is undefined in this library)
                                                const idx = trendData.findIndex(d => d.date === item.date);
                                                const contentX = INIT_SPACING + (idx >= 0 ? idx : 0) * SPACING;

                                                // Viewport X = content position - scroll offset
                                                const viewportX = contentX - scrollOffsetRef.current;

                                                // Default: center tooltip over point
                                                let marginLeft = -HALF; // -70

                                                // Left edge: would tooltip left extend past viewport left?
                                                if (viewportX - HALF < 0) {
                                                    const overshoot = Math.abs(viewportX - HALF);
                                                    marginLeft = -HALF + overshoot + PADDING;
                                                }

                                                // Right edge: would tooltip right extend past viewport right?
                                                if (viewportX + HALF > VIEWPORT_W) {
                                                    const overshoot = (viewportX + HALF) - VIEWPORT_W;
                                                    marginLeft = -HALF - overshoot - PADDING;
                                                }

                                                // Top edge: is the point near the top of the chart?
                                                let marginTop = -50; // Default: above
                                                const valueRatio = item.value / maxVal;
                                                if (valueRatio > 0.70) {
                                                    marginTop = 20; // Flip well below the point
                                                }

                                                return (
                                                    <View style={[styles.pointerContainer, { marginLeft, marginTop }]}>
                                                        <Text style={styles.pointerDate}>{item.date}</Text>
                                                        <View style={styles.pointerBubble}>
                                                            <Text style={styles.pointerTotal}>
                                                                Ksh {item.value.toLocaleString()}
                                                            </Text>
                                                            {breakdown.map((cat: any, index: number) => (
                                                                <View key={index} style={styles.pointerRow}>
                                                                    <View style={[styles.pointerDot, { backgroundColor: cat.color || '#ccc' }]} />
                                                                    <Text style={styles.pointerCatName} numberOfLines={1}>
                                                                        {cat.name}
                                                                    </Text>
                                                                    <Text style={styles.pointerCatAmount}>
                                                                        {cat.amount < 1000 ? cat.amount : (cat.amount / 1000).toFixed(1) + 'k'}
                                                                    </Text>
                                                                </View>
                                                            ))}
                                                            {breakdown.length === 0 && (
                                                                <Text style={styles.pointerHint}>No details</Text>
                                                            )}
                                                        </View>
                                                    </View>
                                                );
                                            },
                                        }}
                                        scrollToEnd
                                    />
                                ) : (
                                    <View style={styles.noDataContainer}>
                                        <Text style={styles.noDataText}>No trend data yet</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* 5. Insight/Summary Text */}
                        <View style={styles.insightCard}>
                            <Info size={20} color={colors.info} style={{ marginRight: 10 }} />
                            <Text style={styles.insightText}>{insightText}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

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
    tabWrapper: {
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#E0E0E0',
        borderRadius: 20,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 16,
    },
    activeTab: {
        backgroundColor: colors.surface,
        elevation: 2,
        shadowColor: 'black',
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    tabText: {
        ...typography.caption,
        fontWeight: '600',
        color: colors.textSecondary
    },
    activeTabText: {
        color: colors.text,
        fontWeight: 'bold'
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
        // Shadow
        shadowColor: colors.primary,
        shadowOpacity: 0.4,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
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
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
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
        // Soft Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
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
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
    },
    // Insight
    insightCard: {
        marginHorizontal: 20,
        marginBottom: 20,
        padding: 16,
        backgroundColor: colors.surface, // or info light color
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderLeftWidth: 4,
        borderLeftColor: colors.info,
    },
    insightText: {
        ...typography.body,
        fontSize: 14,
        color: colors.text,
        flex: 1,
    },
    // Pointer Tooltip
    pointerContainer: {
        height: 120,
        width: 140,
        justifyContent: 'center',
        marginTop: -50,
        marginLeft: -70, // Center (140/2)
    },
    pointerDate: {
        color: colors.textSecondary,
        fontSize: 10,
        textAlign: 'center',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    pointerBubble: {
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(30,30,30, 0.95)', // Dark semi-transparent
        width: 130,
        alignItems: 'stretch',
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    pointerTotal: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.2)',
        paddingBottom: 4,
    },
    pointerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    pointerDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 4,
    },
    pointerCatName: {
        color: '#ccc',
        fontSize: 10,
        flex: 1,
        marginRight: 4,
    },
    pointerCatAmount: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    pointerHint: {
        color: '#888',
        fontSize: 9,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
