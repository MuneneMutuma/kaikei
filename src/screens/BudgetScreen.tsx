import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenHeader } from '../components/ScreenHeader';
import { BudgetCategoryCard } from '../components/BudgetCategoryCard';
import { BudgetSetupModal } from '../components/BudgetSetupModal';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { BudgetLine } from '../services/ledger/Schema';
import { colors } from '../theme/colors';
import { Plus, LayoutList, TrendingUp, BarChart3 } from 'lucide-react-native';

const budgetRepo = new BudgetRepository();

export const BudgetScreen: React.FC = ({ navigation }: any) => {
    const [budgets, setBudgets] = useState<BudgetLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editBudget, setEditBudget] = useState<BudgetLine | null>(null);

    // Derived Totals
    const totalLimit = budgets.reduce((sum, b) => sum + b.limitAmount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + (b.spentAmount || 0), 0);

    // Simplistic current month format "YYYY-MM"
    // Simplistic current month format "YYYY-MM"
    const currentMonth = new Date().toISOString().slice(0, 7);

    const loadBudgets = async () => {
        try {
            setLoading(true);
            const data = await budgetRepo.getMonthlyBudgetDashboard(currentMonth);
            setBudgets(data);
        } catch (error) {
            console.error("Failed to load budgets", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadBudgets();
        }, [])
    );

    const formatMonth = (isoMonth: string) => {
        const date = new Date(`${isoMonth}-01T00:00:00Z`);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const handleCreateBudget = () => {
        setEditBudget(null);
        setModalVisible(true);
    };

    const handleEditBudget = (budgetLine: BudgetLine) => {
        setEditBudget(budgetLine);
        setModalVisible(true);
    };

    const handleBudgetAdded = () => {
        setModalVisible(false);
        setEditBudget(null);
        loadBudgets(); // Refresh list
    };

    const handleModalClose = () => {
        setModalVisible(false);
        setEditBudget(null);
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
                <Pressable style={styles.createButton} onPress={handleCreateBudget}>
                    <Plus color={colors.surface} size={20} style={{ marginRight: 8 }} />
                    <Text style={styles.createButtonText}>Set up your first budget</Text>
                </Pressable>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScreenHeader
                title="Budgets"
                subtitle="Monthly Planning"
                showNotification={false}
            />

            {/* Unified Overview Widget */}
            {budgets.length > 0 && !loading && (
                <View style={styles.overviewWrapper}>
                    <View style={styles.mainOverviewCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.iconCircle}>
                                <TrendingUp size={22} color={colors.primaryDark} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.cardLabel}>Overview</Text>
                                <Text style={styles.monthLabel}>{formatMonth(currentMonth)}</Text>
                            </View>
                        </View>

                        <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Total Budget</Text>
                                <Text style={styles.statValue}>KES {totalLimit.toLocaleString()}</Text>
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

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={budgets}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <BudgetCategoryCard
                            budget={item}
                            onPress={() => handleEditBudget(item)}
                        />
                    )}
                    ListEmptyComponent={renderEmpty}
                />
            )}

            <Pressable style={styles.fab} onPress={handleCreateBudget}>
                <Plus color="#0d1b12" size={32} />
            </Pressable>

            <BudgetSetupModal
                visible={modalVisible}
                onClose={handleModalClose}
                onBudgetAdded={handleBudgetAdded}
                currentMonth={currentMonth}
                initialCategoryId={editBudget?.categoryId}
                initialLimitAmount={editBudget?.limitAmount}
                initialBudgetLineId={editBudget?.id}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    overviewWrapper: {
        paddingHorizontal: 16,
        marginBottom: 16,
        marginTop: 8,
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
    }
});
