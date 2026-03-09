import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { BudgetBreakdown, BudgetLine } from '../services/ledger/Schema';
import { ChevronLeft, Plus, AlertCircle, Pencil, Trash2, Lock, Unlock, X, CheckCircle, Search, ChevronRight, Link2, Link2Off, MoreHorizontal, Sparkles } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor, formatTagName } from '../utils/categoryHelpers';

const budgetRepo = new BudgetRepository();

export const BudgetDetailScreen: React.FC = () => {
    const route = useRoute();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    const { categoryId, month, spentAmount, itemizedAmount, limitAmount, categoryName } = route.params as {
        categoryId: string;
        month: string;
        spentAmount: number;
        itemizedAmount: number;
        limitAmount: number;
        categoryName: string;
    };

    const [budgetLine, setBudgetLine] = useState<BudgetLine | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [lockProgress] = useState(new Animated.Value(0));

    const [unaccountedTransactions, setUnaccountedTransactions] = useState<any[]>([]);
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [targetTagId, setTargetTagId] = useState<string | null>(null);
    const [claimingTagId, setClaimingTagId] = useState<string | null>(null);

    const [budgetLineId, setBudgetLineId] = useState<string | null>(null);
    const [breakdowns, setBreakdowns] = useState<BudgetBreakdown[]>([]);
    const [loading, setLoading] = useState(true);

    const [savingBreakdownId, setSavingBreakdownId] = useState<string | null>(null);
    const [availableTags, setAvailableTags] = useState<{ id: string; name: string }[]>([]);
    const [editingBreakdown, setEditingBreakdown] = useState<BudgetBreakdown | null>(null);
    const [editAmountValue, setEditAmountValue] = useState('');
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [addingBreakdown, setAddingBreakdown] = useState(false);
    const [isAddingUnplanned, setIsAddingUnplanned] = useState(false);

    // Derived
    const Icon = getCategoryIcon(categoryName);
    const catColor = getCategoryColor(categoryName);
    const safeSpent = Math.max(0, spentAmount);
    const safeLimit = Math.max(1, limitAmount);
    const percentageRaw = (safeSpent / safeLimit) * 100;

    const formatKes = (amount: number | null | undefined) => amount != null ? `KES ${amount.toLocaleString()}` : '—';

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await budgetRepo.getBudgetWithBreakdowns(categoryId, month, false);
            if (data) {
                setBudgetLineId(data.line.id);
                setBreakdowns(data.breakdowns);
                setBudgetLine(data.line);
                setIsLocked(!!data.line.isLocked);
            } else {
                setBudgetLineId(null);
                setBreakdowns([]);
                setBudgetLine(null);
                setIsLocked(false);
            }

            // Fetch available tags for suggestions
            const tags = await budgetRepo.getCategoryTags(categoryId);
            setAvailableTags(tags);
        } catch (error) {
            console.error("Failed to load budget details", error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [categoryId, month])
    );

    const handleSaveActualAmount = async () => {
        if (!editingBreakdown) return;
        setSavingBreakdownId(editingBreakdown.id);
        const amt = editAmountValue.trim() ? parseFloat(editAmountValue) : 0;
        try {
            await budgetRepo.updateBreakdownActualAmount(editingBreakdown.id, amt);
            await loadData();
        } catch (e) {
            console.error("Failed to update actual amount", e);
        } finally {
            setSavingBreakdownId(null);
            setEditingBreakdown(null);
            setEditAmountValue('');
        }
    };

    const handleAddNewBreakdown = async () => {
        if (!newName.trim() || !newAmount.trim() || !budgetLineId) return;

        const amount = parseFloat(newAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid amount");
            return;
        }

        setAddingBreakdown(true);
        try {
            const tag = await budgetRepo.getOrCreateTag(categoryId, newName.trim());

            if (isAddingUnplanned) {
                // For unplanned, amount is actualAmount, plannedAmount is 0
                await budgetRepo.addBreakdownItem(budgetLineId, tag.id, 0, amount, true);
            } else {
                // For planned, amount is plannedAmount, actualAmount is 0
                await budgetRepo.addBreakdownItem(budgetLineId, tag.id, amount, 0, false);
            }

            setIsAddingNew(false);
            setNewName('');
            setNewAmount('');
            await loadData();
        } catch (e) {
            console.error("Failed to add breakdown", e);
            Alert.alert("Error", "Could not add breakdown.");
        } finally {
            setAddingBreakdown(false);
        }
    };

    const handleDeleteBreakdown = async (breakdownId: string) => {
        Alert.alert("Remove Item", "Remove this item from the breakdown?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Remove", style: "destructive", onPress: async () => {
                    try {
                        await budgetRepo.deleteBreakdownItem(breakdownId);
                        await loadData();
                    } catch (e) {
                        console.error("Failed to delete breakdown", e);
                        Alert.alert("Error", "Could not delete item.");
                    }
                }
            }
        ]);
    };

    const handleToggleLock = async () => {
        if (!budgetLine) return;
        const newLocked = !isLocked;

        if (newLocked) {
            // Locking is immediate
            await budgetRepo.toggleBudgetLock(budgetLine.id, true);
            setIsLocked(true);
            // Vibration.vibrate(50);
        } else {
            // Unlocking happens via long press animation handled elsewhere
        }
    };

    const startUnlock = () => {
        if (!isLocked) return;
        setUnlocking(true);
        Animated.timing(lockProgress, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
        }).start(({ finished }) => {
            if (finished) {
                completeUnlock();
            }
        });
    };

    const cancelUnlock = () => {
        setUnlocking(false);
        Animated.timing(lockProgress, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    };

    const completeUnlock = async () => {
        if (!budgetLine) return;
        await budgetRepo.toggleBudgetLock(budgetLine.id, false);
        setIsLocked(false);
        setUnlocking(false);
        lockProgress.setValue(0);
        // Vibration.vibrate([0, 100, 50, 100]);
        Alert.alert("Budget Unlocked", "You can now edit your plan and limits.");
    };

    const budgetTotals = useMemo(() => {
        const planned = breakdowns.filter((b: BudgetBreakdown) => !b.isUnplanned);
        const unplanned = breakdowns.filter((b: BudgetBreakdown) => !!b.isUnplanned);

        const plannedTotal = planned.reduce((sum: number, item: BudgetBreakdown) => sum + (item.plannedAmount || 0), 0);
        const plannedTotalActual = planned.reduce((sum: number, item: BudgetBreakdown) => sum + (item.actualAmount || 0), 0);
        const unplannedTotalActual = unplanned.reduce((sum: number, item: BudgetBreakdown) => sum + (item.actualAmount || 0), 0);

        return {
            plannedTotal,
            plannedTotalActual,
            unplannedTotalActual,
            totalLimit: limitAmount
        };
    }, [breakdowns, limitAmount]);

    const validItems = breakdowns.filter((item: BudgetBreakdown) => item.tagName && item.plannedAmount > 0);
    const unplannedItems = breakdowns.filter((b: BudgetBreakdown) => !!b.isUnplanned);

    const plannedTotalEst = validItems.reduce((sum, item) => sum + item.plannedAmount, 0);
    const plannedTotalActual = validItems.reduce((sum, item) => sum + (item.actualAmount || 0), 0);
    const unplannedTotalActual = unplannedItems.reduce((sum, item) => sum + (item.actualAmount || 0), 0);
    const accountedTotal = plannedTotalActual + unplannedTotalActual;
    const unaccountedAmount = Math.max(0, safeSpent - accountedTotal);
    const unallocated = limitAmount - plannedTotalEst;

    const handleReviewUnaccounted = (tagId: string) => {
        setTargetTagId(tagId);
        setReviewModalVisible(true);
    };

    const handleCleanTags = async () => {
        Alert.alert(
            "Clean Duplicate Tags",
            "This will scan your database and merge any duplicate tags (ignoring case and spaces). Are you sure?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clean",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const result = await budgetRepo.deduplicateAndTrimTags();
                            Alert.alert("Success", `Merged ${result.merged} duplicate tags and deleted ${result.deleted} redundancies.`, [{ text: "OK" }]);
                            loadData(); // refresh the view
                        } catch (e) {
                            Alert.alert("Error", "Failed to clean tags.");
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.navHeader}>
                    <Pressable style={styles.navBtn} onPress={() => navigation.goBack()}>
                        <ChevronLeft size={22} color={colors.text} />
                    </Pressable>
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Navigation */}
            <View style={styles.navHeader}>
                <Pressable hitSlop={10} style={styles.navBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={22} color={colors.text} />
                </Pressable>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.navTitle}>{categoryName}</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                        onPress={handleCleanTags}
                        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
                        hitSlop={8}
                    >
                        <Sparkles size={20} color={colors.primary} />
                    </Pressable>

                    <Pressable
                        onPress={() => navigation.navigate('Reconciliation', { categoryId, month })}
                        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
                        hitSlop={8}
                    >
                        <Search size={20} color={colors.primary} />
                    </Pressable>

                    <Pressable
                        onPressIn={startUnlock}
                        onPressOut={cancelUnlock}
                        onPress={handleToggleLock}
                        hitSlop={10}
                        style={[styles.lockBtn, isLocked && styles.lockBtnActive]}
                    >
                        {isLocked ? (
                            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                <Lock size={18} color={unlocking ? colors.primary : colors.danger} />
                                {unlocking && (
                                    <Animated.View
                                        style={[
                                            styles.lockProgress,
                                            {
                                                width: lockProgress.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: ['0%', '100%']
                                                })
                                            }
                                        ]}
                                    />
                                )}
                            </View>
                        ) : (
                            <Unlock size={18} color={colors.textSecondary} />
                        )}
                    </Pressable>

                    <Pressable
                        onPress={() => {
                            if (!isLocked) {
                                navigation.navigate('BudgetSetup', {
                                    currentMonth: month,
                                    initialCategoryId: categoryId,
                                    initialLimitAmount: limitAmount,
                                    initialBudgetLineId: budgetLineId || undefined
                                });
                            }
                        }}
                        style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }, isLocked && { opacity: 0.3 }]}
                        disabled={isLocked}
                        hitSlop={8}
                    >
                        <MoreHorizontal size={20} color={colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Budget Summary Card */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <View style={[styles.summaryIconBox, { backgroundColor: `${catColor}15` }]}>
                            <Icon size={24} color={catColor} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                            <Text style={styles.summaryCategory}>{categoryName}</Text>
                            <View style={styles.summaryAmountRow}>
                                <Text style={styles.summarySpent}>
                                    {formatKes(safeSpent)}
                                </Text>
                                <Text style={styles.summaryOf}>of {formatKes(limitAmount)}</Text>
                            </View>
                        </View>
                        <View style={styles.percentBadge}>
                            <Text style={[
                                styles.percentText,
                                { color: percentageRaw >= 100 ? colors.danger : percentageRaw >= 80 ? colors.warning : colors.success }
                            ]}>
                                {percentageRaw >= 100 ? 'Over Budget' : `${Math.round(percentageRaw)}%`}
                            </Text>
                        </View>
                    </View>

                    {/* Progress bar */}
                    <View style={styles.progressTrack}>
                        <View style={[
                            styles.progressFill,
                            {
                                width: `${Math.min(100, Math.max(0, percentageRaw))}%`,
                                backgroundColor: percentageRaw >= 100 ? colors.danger : percentageRaw >= 80 ? colors.warning : catColor
                            }
                        ]} />
                    </View>

                    <View style={styles.summaryFooterRow}>
                        <Text style={styles.footerLabel}>
                            {safeSpent > limitAmount
                                ? `Over by ${formatKes(safeSpent - limitAmount)}`
                                : `${formatKes(limitAmount - safeSpent)} remaining`
                            }
                        </Text>
                    </View>
                </View>


                {/* Budget Breakdown Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Budget Breakdown</Text>
                    <Text style={styles.sectionSubtitle}>Plan individual items and see your progress.</Text>

                    <View style={styles.card}>
                        {/* Column Headers */}
                        <View style={styles.tableHeader}>
                            <Text style={[styles.colHeader, { flex: 1.2 }]}>Item</Text>
                            <Text style={[styles.colHeader, { flex: 0.7, textAlign: 'right' }]}>Est.</Text>
                            <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right' }]}>Act.</Text>
                            <Text style={[styles.colHeader, { flex: 0.7, textAlign: 'right' }]}>Diff</Text>
                            <Text style={[styles.colHeader, { flex: 0.7, textAlign: 'center' }]}>Status</Text>
                            <View style={{ width: 28 }} />
                        </View>

                        {/* Planned Rows */}
                        {validItems.length === 0 && (
                            <View style={styles.emptyBreakdown}>
                                <Text style={styles.emptyText}>No planned items yet.</Text>
                            </View>
                        )}

                        {validItems.map((item: BudgetBreakdown) => {
                            const diff = item.plannedAmount - (item.actualAmount || 0);
                            return (
                                <View key={item.id} style={styles.row}>
                                    <View style={[styles.rowLabel, { flex: 1.2 }]}>
                                        <Text style={styles.rowLabelText} numberOfLines={1}>{item.tagName || 'Unknown'}</Text>
                                    </View>
                                    <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                        <Text style={styles.rowValue}>{item.plannedAmount.toLocaleString()}</Text>
                                    </View>
                                    <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                                        <Pressable
                                            onPress={() => {
                                                if (!isLocked) {
                                                    navigation.navigate('EditActualAmount', {
                                                        breakdownId: item.id,
                                                        tagName: item.tagName || 'Unknown',
                                                        currentAmount: item.actualAmount || 0,
                                                        plannedAmount: item.plannedAmount
                                                    });
                                                }
                                            }}
                                            style={styles.actualEntryBtn}
                                            disabled={isLocked}
                                        >
                                            {savingBreakdownId === item.id ? (
                                                <ActivityIndicator size="small" color={catColor} />
                                            ) : (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={[styles.actualEntryText, { color: item.actualAmount ? colors.text : colors.primary, opacity: item.actualAmount ? 1 : 0.6 }]}>
                                                        {item.actualAmount != null && item.actualAmount !== 0 ? item.actualAmount.toLocaleString() : '+'}
                                                    </Text>
                                                    <Pencil size={8} color={item.actualAmount ? colors.textSecondary : colors.primary} opacity={isLocked ? 0.1 : 0.4} />
                                                </View>
                                            )}
                                        </Pressable>
                                    </View>
                                    <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                        <Text style={[styles.rowValue, { color: diff < 0 ? colors.danger : colors.success }]}>
                                            {diff === 0 ? '—' : (diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString())}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 0.7, alignItems: 'center' }}>
                                        <Pressable
                                            onPress={() => !isLocked && navigation.navigate('Reconciliation', { categoryId, month })}
                                            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, alignItems: 'center' }, isLocked && { opacity: 0.1 }]}
                                            disabled={isLocked}
                                        >
                                            {item.linkedAmount && item.linkedAmount > 0 ? (
                                                <View style={{ alignItems: 'center' }}>
                                                    <Link2 size={16} color="#3B82F6" strokeWidth={2.5} />
                                                    <Text style={[styles.verifiedText, { color: "#3B82F6", fontWeight: '800' }]}>{item.linkedAmount.toLocaleString()}</Text>
                                                </View>
                                            ) : (
                                                <Link2Off size={16} color={colors.textSecondary} />
                                            )}
                                        </Pressable>
                                    </View>
                                    <Pressable hitSlop={10} style={{ width: 28, alignItems: 'flex-end' }} onPress={() => !isLocked && handleDeleteBreakdown(item.id)} disabled={isLocked}>
                                        <Trash2 size={13} color={colors.textSecondary} opacity={isLocked ? 0.1 : 0.5} />
                                    </Pressable>
                                </View>
                            );
                        })}

                        {/* Planned Subtotal */}
                        {validItems.length > 0 && (
                            <View style={styles.subtotalRow}>
                                <View style={{ flex: 1.2 }}>
                                    <Text style={styles.subtotalLabel}>Planned Total</Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={styles.subtotalValue}>{plannedTotalEst.toLocaleString()}</Text>
                                </View>
                                <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                                    <Text style={styles.subtotalValue}>{plannedTotalActual.toLocaleString()}</Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={[
                                        styles.subtotalValue,
                                        { color: (plannedTotalEst - plannedTotalActual) < 0 ? colors.danger : colors.success }
                                    ]}>
                                        {(plannedTotalEst - plannedTotalActual).toLocaleString()}
                                    </Text>
                                </View>
                                <View style={{ flex: 0.7 }} />
                                <View style={{ width: 28 }} />
                            </View>
                        )}

                        {unallocated > 0 && (
                            <View style={[styles.row, { opacity: 0.5, borderBottomWidth: 0, paddingVertical: 10 }]}>
                                <View style={[styles.rowLabel, { flex: 1.2 }]}>
                                    <AlertCircle size={10} color={colors.textSecondary} style={{ marginRight: 6 }} />
                                    <Text style={[styles.rowLabelText, { fontStyle: 'italic', fontSize: 13 }]}>Remaining Surplus</Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={[styles.rowValue, { fontSize: 12 }]}>{unallocated.toLocaleString()}</Text>
                                </View>
                                <View style={{ flex: 0.8 }} />
                                <View style={{ flex: 0.7 }} />
                                <View style={{ flex: 0.7 }} />
                                <View style={{ width: 28 }} />
                            </View>
                        )}

                        <Pressable
                            onPress={() => {
                                if (!isLocked && budgetLineId) {
                                    navigation.navigate('AddBudgetItem', {
                                        budgetLineId,
                                        categoryId,
                                        isUnplanned: false,
                                        month
                                    });
                                }
                            }}
                            style={[styles.addItemBtn, isLocked && { opacity: 0.3 }]}
                            disabled={isLocked}
                        >
                            <Plus size={14} color={colors.primaryDark} />
                            <Text style={styles.addItemText}>Add to Planned</Text>
                        </Pressable>
                    </View>
                </View>


                {/* Unplanned Spending Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Unplanned Spending</Text>
                    <Text style={styles.sectionSubtitle}>Items you spent on that weren't in your original plan.</Text>

                    <View style={styles.card}>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.colHeader, { flex: 1.2 }]}>Item</Text>
                            <Text style={[styles.colHeader, { flex: 0.7, textAlign: 'right' }]}>Est.</Text>
                            <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right' }]}>Act.</Text>
                            <Text style={[styles.colHeader, { flex: 0.7, textAlign: 'right' }]}>Diff</Text>
                            <Text style={[styles.colHeader, { flex: 0.7, textAlign: 'center' }]}>Status</Text>
                            <View style={{ width: 28 }} />
                        </View>

                        {unplannedItems.length === 0 && (
                            <View style={styles.emptyBreakdown}>
                                <Text style={styles.emptyText}>No unplanned spending logged.</Text>
                            </View>
                        )}

                        {unplannedItems.map((item: BudgetBreakdown) => (
                            <View key={item.id} style={styles.row}>
                                <View style={[styles.rowLabel, { flex: 1.2 }]}>
                                    <Text style={styles.rowLabelText} numberOfLines={1}>{item.tagName}</Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={[styles.rowValue, { opacity: 0.3 }]}>—</Text>
                                </View>
                                <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                                    <Pressable
                                        onPress={() => {
                                            if (!isLocked) {
                                                setEditingBreakdown(item);
                                                setEditAmountValue(item.actualAmount ? item.actualAmount.toString() : '');
                                            }
                                        }}
                                        style={styles.actualEntryBtn}
                                        disabled={isLocked}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Text style={styles.actualEntryText}>{item.actualAmount?.toLocaleString() || '0'}</Text>
                                            <Pencil size={8} color={colors.textSecondary} opacity={isLocked ? 0.1 : 0.4} />
                                        </View>
                                    </Pressable>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={[styles.rowValue, { color: colors.danger }]}>
                                        -{(item.actualAmount || 0).toLocaleString()}
                                    </Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'center' }}>
                                    <Pressable
                                        onPress={() => !isLocked && handleReviewUnaccounted(item.tagId)}
                                        style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, alignItems: 'center' }, isLocked && { opacity: 0.1 }]}
                                        disabled={isLocked}
                                    >
                                        {item.linkedAmount && item.linkedAmount > 0 ? (
                                            <View style={{ alignItems: 'center' }}>
                                                <Link2 size={16} color="#3B82F6" strokeWidth={2.5} />
                                                <Text style={[styles.verifiedText, { color: "#3B82F6", fontWeight: '800' }]}>{item.linkedAmount.toLocaleString()}</Text>
                                            </View>
                                        ) : (
                                            <Link2Off size={16} color={colors.textSecondary} />
                                        )}
                                    </Pressable>
                                </View>
                                <Pressable hitSlop={10} style={{ width: 28, alignItems: 'flex-end' }} onPress={() => !isLocked && handleDeleteBreakdown(item.id)} disabled={isLocked}>
                                    <Trash2 size={13} color={colors.textSecondary} opacity={isLocked ? 0.1 : 0.5} />
                                </Pressable>
                            </View>
                        ))}

                        {unplannedItems.length > 0 && (
                            <View style={styles.subtotalRow}>
                                <View style={{ flex: 1.2 }}>
                                    <Text style={styles.subtotalLabel}>Unplanned Total</Text>
                                </View>
                                <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                                    <Text style={[styles.subtotalValue, { opacity: 0.3 }]}>—</Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={styles.subtotalValue}>{unplannedTotalActual.toLocaleString()}</Text>
                                </View>
                                <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                                    <Text style={[styles.subtotalValue, { color: colors.danger }]}>-{unplannedTotalActual.toLocaleString()}</Text>
                                </View>
                                <View style={{ flex: 0.7 }} />
                                <View style={{ width: 28 }} />
                            </View>
                        )}


                        <Pressable
                            onPress={() => {
                                if (!isLocked && budgetLineId) {
                                    navigation.navigate('AddBudgetItem', {
                                        budgetLineId,
                                        categoryId,
                                        isUnplanned: true,
                                        month
                                    });
                                }
                            }}
                            style={[styles.addItemBtn, isLocked && { opacity: 0.3 }]}
                            disabled={isLocked}
                        >
                            <Plus size={14} color={colors.primaryDark} />
                            <Text style={styles.addItemText}>Log Unplanned Item</Text>
                        </Pressable>
                    </View>
                </View>


                {/* Reconciliation */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Reconciliation</Text>
                    <Text style={styles.sectionSubtitle}>Ensure every M-Pesa transaction is accounted for.</Text>

                    <View style={styles.reconCard}>
                        <View style={styles.reconRow}>
                            <Text style={styles.reconLabel}>M-Pesa Ledger Total:</Text>
                            <Text style={styles.reconValue}>{formatKes(safeSpent)}</Text>
                        </View>
                        <View style={styles.reconDivider} />

                        <View style={styles.reconRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginRight: 8 }} />
                                <Text style={styles.reconSubLabel}>Planned Actuals:</Text>
                            </View>
                            <Text style={styles.reconSubValue}>{formatKes(plannedTotalActual)}</Text>
                        </View>

                        <View style={styles.reconRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning, marginRight: 8 }} />
                                <Text style={styles.reconSubLabel}>Unplanned Actuals:</Text>
                            </View>
                            <Text style={styles.reconSubValue}>{formatKes(unplannedTotalActual)}</Text>
                        </View>

                        <View style={styles.reconDivider} />

                        <View style={styles.reconRow}>
                            <Text style={[styles.reconLabel, { color: '#FFF', fontWeight: '700' }]}>Difference:</Text>
                            <Text style={[
                                styles.reconValue,
                                {
                                    color: Math.abs(safeSpent - (plannedTotalActual + unplannedTotalActual)) > 0.01 ? '#F87171' : '#4ADE80',
                                    fontWeight: '700',
                                    fontSize: 18
                                }
                            ]}>
                                {formatKes(safeSpent - (plannedTotalActual + unplannedTotalActual))}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },

    // Navigation
    navHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    navBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    lockBtnActive: {
        backgroundColor: '#FEF2F2',
    },
    lockProgress: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 3,
        backgroundColor: colors.primary,
    },
    navTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.text,
    },

    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },

    // Summary Card
    headerBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAF9',
    },
    summaryCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    summaryIconBox: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    summaryCategory: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 2,
    },
    summaryAmountRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
    },
    summarySpent: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    summaryOf: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    percentBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: '#F8FAF9',
    },
    percentText: {
        fontSize: 13,
        fontWeight: '700',
    },
    progressTrack: {
        width: '100%',
        height: 5,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 14,
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    summaryFooterRow: {
        marginTop: 8,
    },
    footerLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },

    // Sections
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        marginBottom: 12,
    },

    // Card
    card: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 4,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: "#000",
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
    },
    tableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    colHeader: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },

    // Rows
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAF9',
    },
    rowLabel: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowLabelText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
        flex: 1,
    },
    rowValue: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.text,
        textAlign: 'right',
    },

    // Actual Amount Editing
    // Actual Amount Entry
    actualEntryBtn: {
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 6,
        minWidth: 60,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    actualEntryText: {
        fontSize: 13,
        fontWeight: '500',
    },

    // Subtotal Row
    subtotalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderTopWidth: 2,
        borderTopColor: '#F1F5F9',
        backgroundColor: '#FCFDFF',
        marginHorizontal: -16,
        paddingHorizontal: 16,
    },
    subtotalLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    subtotalValue: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'right',
    },

    verifyBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
    },
    emptyBreakdown: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: colors.textSecondary,
        fontStyle: 'italic',
    },
    verifiedText: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 2,
    },
    addItemBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 6,
    },
    addItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primaryDark,
    },
    reconCard: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 20,
        marginTop: 8,
    },
    reconRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 4,
    },
    reconLabel: {
        fontSize: 14,
        color: '#94A3B8',
    },
    reconValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#F8FAFC',
    },
    reconDivider: {
        height: 1,
        backgroundColor: '#334155',
        marginVertical: 12,
    },
    reconSubLabel: {
        fontSize: 13,
        color: '#94A3B8',
    },
    reconSubValue: {
        fontSize: 14,
        color: '#CBD5E1',
    },
});
