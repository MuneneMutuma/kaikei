import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../components/ScreenHeader';
import { BudgetCategoryCard } from '../components/BudgetCategoryCard';
import { BudgetSetupModal } from '../components/BudgetSetupModal';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { BudgetLine } from '../services/ledger/Schema';
import { colors } from '../theme/colors';
import { Plus, LayoutList, TrendingUp, BarChart3 } from 'lucide-react-native';
import { MonthPicker } from '../components/MonthPicker';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

const budgetRepo = new BudgetRepository();

export const BudgetScreen: React.FC<{ navigation: NativeStackNavigationProp<RootStackParamList, 'MainTabs'> }> = ({ navigation }) => {
    const [plannedBudgets, setPlannedBudgets] = useState<BudgetLine[]>([]);
    const [unplannedBudgets, setUnplannedBudgets] = useState<BudgetLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editBudget, setEditBudget] = useState<BudgetLine | null>(null);
    const [activeTab, setActiveTab] = useState<'planned' | 'unplanned'>('planned');

    // Derived Totals
    const totalLimit = plannedBudgets.reduce((sum, b) => sum + b.limitAmount, 0);
    const plannedSpent = plannedBudgets.reduce((sum, b) => sum + (b.spentAmount || 0), 0);
    const unplannedSpent = unplannedBudgets.reduce((sum, b) => sum + (b.spentAmount || 0), 0);
    const totalSpent = plannedSpent + unplannedSpent;

    // Month Management
    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

    // Stats Calculations
    const getDaysInMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-').map(Number);
        return new Date(year, month, 0).getDate();
    };

    const getEfficiencyStats = () => {
        const now = new Date();
        const thisMonthIso = now.toISOString().slice(0, 7);
        const totalDays = getDaysInMonth(currentMonth);

        if (currentMonth < thisMonthIso) {
            return { daysRemaining: 0, dailyAllowance: 0, utilization: (totalSpent / Math.max(1, totalLimit)) * 100 };
        }

        if (currentMonth > thisMonthIso) {
            return { daysRemaining: totalDays, dailyAllowance: totalLimit / totalDays, utilization: 0 };
        }

        // Current Month
        const dayOfMonth = now.getDate();
        const daysRemaining = Math.max(1, totalDays - dayOfMonth + 1);
        const remainingBudget = Math.max(0, totalLimit - totalSpent);
        const dailyAllowance = remainingBudget / daysRemaining;
        const utilization = (totalSpent / Math.max(1, totalLimit)) * 100;

        return { daysRemaining, dailyAllowance, utilization };
    };

    const stats = getEfficiencyStats();

    const loadBudgets = async () => {
        try {
            setLoading(true);
            const data = await budgetRepo.getMonthlyBudgetDashboard(currentMonth);
            setPlannedBudgets(data.filter(b => !b.isUnplanned));
            setUnplannedBudgets(data.filter(b => b.isUnplanned));
        } catch (error) {
            console.error("Failed to load budgets", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadBudgets();
        }, [currentMonth])
    );

    const todayIso = new Date().toISOString().slice(0, 7);
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 2);
    const maxIso = maxDate.toISOString().slice(0, 7);

    const handleCreateBudget = () => {
        const today = new Date();
        const todayIso = today.toISOString().slice(0, 7);
        const maxDate = new Date(today.getFullYear(), today.getMonth() + 2, 1);
        const maxIso = maxDate.toISOString().slice(0, 7);

        if (currentMonth < todayIso) {
            Alert.alert("Action Locked", "You cannot set up a budget for a past month.");
            return;
        }
        if (currentMonth > maxIso) {
            Alert.alert("Too Early", "You can only plan budgets up to 2 months in advance.");
            return;
        }
        
        navigation.navigate('BudgetSetup', { 
            currentMonth 
        });
    };

    const handleEditBudget = (budgetLine: BudgetLine) => {
        const today = new Date().toISOString().slice(0, 7);
        if (currentMonth < today) {
            Alert.alert("View Only", "Budgets for past months cannot be modified.");
            return;
        }
        
        navigation.navigate('BudgetSetup', {
            currentMonth,
            initialCategoryId: budgetLine.categoryId,
            initialLimitAmount: budgetLine.limitAmount,
            initialBudgetLineId: budgetLine.id
        });
    };

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View style={styles.emptyContainer}>
                <View style={styles.emptyIconContainer}>
                    <BarChart3 color={colors.primary} size={48} />
                </View>
                <Text style={styles.emptyTitle}>No Budgets Set</Text>
                <Text style={styles.emptySubtitle}>
                    Control your spending by setting limits on categories like Fuel, Food, or Transport.
                </Text>
                {currentMonth >= new Date().toISOString().slice(0, 7) && (
                    <Pressable style={styles.createButton} onPress={handleCreateBudget}>
                        <Plus color={colors.surface} size={20} style={{ marginRight: 8 }} />
                        <Text style={styles.createButtonText}>Set up your budget</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    const formatMonth = (isoMonth: string) => {
        const date = new Date(`${isoMonth}-01T00:00:00Z`);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Budgets"
                subtitle="Monthly Planning"
                showNotification={false}
            />

            <MonthPicker
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                maxMonth={maxIso}
            />

            {/* Unified Overview Widget */}
            {(plannedBudgets.length > 0 || unplannedBudgets.length > 0) && !loading && (
                <View style={styles.overviewWrapper}>
                    <View style={styles.mainOverviewCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.iconCircle}>
                                <TrendingUp size={22} color={colors.primaryDark} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={styles.cardLabel}>Overview</Text>
                                    <Text style={[styles.utilizationText, { color: stats.utilization > 90 ? colors.danger : colors.textSecondary }]}>
                                        {Math.round(stats.utilization)}% spent
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Total Budget</Text>
                                <Text style={styles.statValue}>KES {totalLimit.toLocaleString()}</Text>
                            </View>
                            <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: '#f1f5f9' }]}>
                                <Text style={styles.statLabel}>Daily Max</Text>
                                <Text style={[styles.statValue, { color: stats.dailyAllowance < 500 && totalLimit > 0 ? colors.danger : colors.text }]}>
                                    KES {Math.round(stats.dailyAllowance).toLocaleString()}
                                </Text>
                            </View>
                            <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: '#f1f5f9' }]}>
                                <Text style={styles.statLabel}>Total Spent</Text>
                                <Text style={[styles.statValue, { color: totalSpent > totalLimit ? colors.danger : colors.text }]}>
                                    KES {totalSpent.toLocaleString()}
                                </Text>
                            </View>
                        </View>

                        {/* Total Progress bar */}
                        <View style={styles.progressContainer}>
                            <View style={[
                                styles.progressFill,
                                {
                                    width: `${Math.min(100, (totalSpent / Math.max(1, totalLimit)) * 100)}%`,
                                    backgroundColor: totalSpent > totalLimit ? colors.danger : colors.primary
                                }
                            ]} />
                        </View>
                    </View>
                </View>
            )}

            {/* Segmented Tab Control */}
            <View style={styles.tabContainer}>
                <Pressable
                    onPress={() => setActiveTab('planned')}
                    style={[styles.tab, activeTab === 'planned' && styles.activeTab]}
                >
                    <Text style={[styles.tabText, activeTab === 'planned' && styles.activeTabText]}>
                        Planned {plannedBudgets.length > 0 ? `(${plannedBudgets.length})` : ''}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={() => setActiveTab('unplanned')}
                    style={[styles.tab, activeTab === 'unplanned' && styles.activeTab]}
                >
                    <View style={styles.tabWithIndicator}>
                        <Text style={[styles.tabText, activeTab === 'unplanned' && styles.activeTabText]}>
                            Unplanned {unplannedBudgets.length > 0 ? `(${unplannedBudgets.length})` : ''}
                        </Text>
                        {unplannedBudgets.length > 0 && <View style={styles.redDot} />}
                    </View>
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                    {activeTab === 'planned' ? (
                        <>
                            {plannedBudgets.length > 0 ? plannedBudgets.map(b => (
                                <BudgetCategoryCard
                                    key={b.id}
                                    budget={b}
                                    onPress={() => navigation.navigate('BudgetDetail', { categoryId: b.categoryId, month: currentMonth, spentAmount: b.spentAmount || 0, itemizedAmount: b.itemizedAmount || 0, limitAmount: b.limitAmount, categoryName: b.categoryName || 'Unknown' })}
                                />
                            )) : renderEmpty()}
                        </>
                    ) : (
                        <>
                            {unplannedBudgets.length > 0 ? unplannedBudgets.map(item => (
                                <BudgetCategoryCard
                                    key={item.categoryId}
                                    budget={item}
                                    onPress={() => navigation.navigate('BudgetDetail', { categoryId: item.categoryId, month: currentMonth, spentAmount: item.spentAmount || 0, itemizedAmount: item.itemizedAmount || 0, limitAmount: item.limitAmount, categoryName: item.categoryName || 'Unknown' })}
                                />
                            )) : (
                                <View style={styles.centeredEmpty}>
                                    <TrendingUp size={48} color="#E2E8F0" />
                                    <Text style={styles.emptyTitle}>All caught up!</Text>
                                    <Text style={styles.emptySubtitle}>No unplanned spending detected in {formatMonth(currentMonth)}.</Text>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            )}

            {currentMonth >= new Date().toISOString().slice(0, 7) && (
                <Pressable style={styles.fab} onPress={handleCreateBudget}>
                    <Plus color="#0d1b12" size={32} />
                </Pressable>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.background,
        gap: 8,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textSecondary,
        letterSpacing: 1,
    },
    overviewWrapper: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    monthHeaderText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primaryDark,
    },
    mainOverviewCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconCircle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#f0fdf4',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    monthLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    statsGrid: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    statItem: {
        flex: 1,
        paddingHorizontal: 12,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text,
    },
    progressContainer: {
        height: 6,
        backgroundColor: '#f1f5f9',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    listContent: {
        paddingBottom: 100,
        flexGrow: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        marginTop: 40,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#f0fdf4',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: colors.primary,
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 4,
    },
    createButtonText: {
        color: '#0d1b12',
        fontSize: 16,
        fontWeight: '700',
    },
    fab: {
        position: 'absolute',
        bottom: 20,
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
        borderColor: '#FFF',
    },
    utilizationText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 8,
        gap: 12,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    activeTab: {
        backgroundColor: `${colors.primary}15`,
        borderColor: colors.primary,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    activeTabText: {
        color: colors.primaryDark,
    },
    tabWithIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    redDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.danger,
        marginLeft: 6,
    },
    centeredEmpty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        marginTop: 40,
    },
});
