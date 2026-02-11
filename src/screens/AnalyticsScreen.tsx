import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart, PieChart } from "react-native-gifted-charts";
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const SCREEN_WIDTH = Dimensions.get('window').width;

const getCategoryColor = (name: string) => {
    switch (name?.toLowerCase()) {
        case 'food': return '#FF9800';
        case 'transport': return '#2196F3';
        case 'shopping': return '#E91E63';
        case 'entertainment': return '#9C27B0';
        case 'bills': return '#F44336';
        case 'health': return '#009688';
        case 'rent': return '#795548';
        case 'fees': return '#607D8B';
        default: return '#9E9E9E';
    }
};

type TimeFrame = 'week' | 'month' | 'last_month';

export default function AnalyticsScreen() {
    const [timeFrame, setTimeFrame] = useState<TimeFrame>('month');
    const [loading, setLoading] = useState(false);

    // Data
    const [totalSpent, setTotalSpent] = useState(0);
    const [categoryData, setCategoryData] = useState<any[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [topCategory, setTopCategory] = useState<string>('');

    const repo = useRef(new ExpenseRepository());

    const fetchAnalytics = async () => {
        setLoading(true);
        const now = new Date();
        let startDate = '';
        let endDate = '';

        // Calculate Date Ranges
        if (timeFrame === 'week') {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
            startDate = firstDay.toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        } else if (timeFrame === 'month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = firstDay.toISOString().split('T')[0];
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endDate = lastDay.toISOString().split('T')[0];
        } else if (timeFrame === 'last_month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            startDate = firstDay.toISOString().split('T')[0];
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            endDate = lastDay.toISOString().split('T')[0];
        }

        try {
            // 1. Category Totals (for Donut)
            const catTotals = await repo.current.getCategoryTotals(startDate, endDate);

            let sum = 0;
            const pieData = catTotals.map(c => {
                sum += c.total;
                return {
                    value: c.total,
                    color: getCategoryColor(c.name),
                    text: c.name, // For legend if needed
                    name: c.name
                };
            });
            setTotalSpent(sum);
            setCategoryData(pieData);
            if (pieData.length > 0) setTopCategory(pieData[0].name);

            // 2. Daily Trends (for Line Chart)
            const daily = await repo.current.getDailyTotals(startDate, endDate);
            // Map to gifted-charts format
            const lineData = daily.map(d => ({
                value: d.total,
                label: d.day.slice(8), // Just the day '24'
                dataPointText: d.total > 0 ? '' : '' // Cleaner
            }));

            // Fill in gaps? (Optional polish: fill missing dates with 0)
            // For MVP, just showing days with spend is okay, but linear graph looks weird with gaps.
            // Let's rely on what we have for now. A truly polished app would fill gaps.

            setTrendData(lineData);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchAnalytics();
        }, [timeFrame])
    );

    const renderLegend = () => {
        return (
            <View style={styles.legendContainer}>
                {categoryData.slice(0, 4).map((item, idx) => (
                    <View key={idx} style={styles.legendItem}>
                        <View style={[styles.dot, { backgroundColor: item.color }]} />
                        <Text style={styles.legendText}>{item.name} ({Math.round(item.value / totalSpent * 100)}%)</Text>
                    </View>
                ))}
            </View>
        );
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header / Tabs */}
            <View style={styles.header}>
                <Text style={styles.title}>Analytics</Text>
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, timeFrame === 'week' && styles.activeTab]}
                        onPress={() => setTimeFrame('week')}
                    >
                        <Text style={[styles.tabText, timeFrame === 'week' && styles.activeTabText]}>Week</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, timeFrame === 'month' && styles.activeTab]}
                        onPress={() => setTimeFrame('month')}
                    >
                        <Text style={[styles.tabText, timeFrame === 'month' && styles.activeTabText]}>Month</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, timeFrame === 'last_month' && styles.activeTab]}
                        onPress={() => setTimeFrame('last_month')}
                    >
                        <Text style={[styles.tabText, timeFrame === 'last_month' && styles.activeTabText]}>Last Month</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
            ) : (
                <View>
                    {/* Hero Card */}
                    <View style={styles.heroCard}>
                        <Text style={styles.heroLabel}>Total Spent</Text>
                        <Text style={styles.heroAmount}>Ksh {totalSpent.toLocaleString()}</Text>
                        <Text style={styles.heroSubText}>
                            Top Category: <Text style={{ fontWeight: 'bold' }}>{topCategory || '-'}</Text>
                        </Text>
                    </View>

                    {/* Donut Chart */}
                    <View style={styles.chartCard}>
                        <Text style={styles.chartTitle}>Category Split</Text>
                        <View style={{ alignItems: 'center' }}>
                            {categoryData.length > 0 ? (
                                <PieChart
                                    data={categoryData}
                                    donut
                                    showGradient
                                    sectionAutoFocus
                                    radius={90}
                                    innerRadius={60}
                                    innerCircleColor={'#fff'}
                                    centerLabelComponent={() => {
                                        return (
                                            <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                                                <Text style={{ fontSize: 22, color: 'black', fontWeight: 'bold' }}>
                                                    {Math.round(categoryData[0]?.value / totalSpent * 100) || 0}%
                                                </Text>
                                                <Text style={{ fontSize: 14, color: 'gray' }}>{topCategory}</Text>
                                            </View>
                                        );
                                    }}
                                />
                            ) : (
                                <Text style={{ color: '#999', margin: 20 }}>No data for this period</Text>
                            )}
                        </View>
                        {renderLegend()}
                    </View>

                    {/* Line Chart */}
                    <View style={styles.chartCard}>
                        <Text style={styles.chartTitle}>Spending Trend</Text>
                        <View style={{ paddingVertical: 20 }}>
                            {trendData.length > 0 ? (
                                <LineChart
                                    data={trendData}
                                    color={colors.primary}
                                    thickness={3}
                                    dataPointsColor={colors.primary}
                                    startFillColor={colors.primary + '4D'} // 30% opacity
                                    endFillColor={colors.primary + '03'}
                                    startOpacity={0.9}
                                    endOpacity={0.2}
                                    initialSpacing={10}
                                    noOfSections={4}
                                    yAxisThickness={0}
                                    xAxisThickness={1}
                                    xAxisColor={'#ddd'}
                                    hideRules
                                    width={SCREEN_WIDTH - 80}
                                    height={180}
                                    curved
                                    isAnimated
                                />
                            ) : (
                                <Text style={{ color: '#999', textAlign: 'center' }}>No trend data yet</Text>
                            )}
                        </View>
                    </View>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        padding: 20,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    title: {
        ...typography.header,
        color: colors.text,
        marginBottom: 15
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: colors.surface,
        elevation: 2,
        shadowColor: 'black',
        shadowOpacity: 0.1,
        shadowRadius: 4
    },
    tabText: {
        ...typography.caption,
        fontWeight: '500',
        color: colors.textSecondary
    },
    activeTabText: {
        color: colors.primary,
        fontWeight: 'bold'
    },
    heroCard: {
        margin: 20,
        padding: 24,
        backgroundColor: colors.primary,
        borderRadius: 24,
        elevation: 8,
        shadowColor: colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 }
    },
    heroLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 5,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    heroAmount: {
        color: 'white',
        fontSize: 36,
        fontWeight: '800', // Heavy bold
        marginBottom: 10,
        fontFamily: typography.mono.fontFamily,
    },
    heroSubText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
    },
    chartCard: {
        backgroundColor: colors.surface,
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 24,
        padding: 20,
        elevation: 2,
        shadowColor: colors.primary,
        shadowOpacity: 0.05,
        shadowRadius: 10
    },
    chartTitle: {
        ...typography.subHeader,
        color: colors.text,
        marginBottom: 20
    },
    legendContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 20,
        justifyContent: 'center'
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 15,
        marginBottom: 10
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 6
    },
    legendText: {
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: '500'
    }
});
