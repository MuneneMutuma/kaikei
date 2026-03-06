import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput as RNTextInput, Alert, Modal, KeyboardAvoidingView, Platform, Animated, Vibration, TouchableOpacity } from 'react-native';
import { SwipeableSheet, SwipeableSheetRef } from '../components/common/SwipeableSheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { BudgetBreakdown, BudgetLine } from '../services/ledger/Schema';
import { ChevronLeft, Plus, AlertCircle, Pencil, Trash2, Lock, Unlock, X, CheckCircle, Search, ChevronRight, Link2, Link2Off, MoreHorizontal, Sparkles } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor, formatTagName } from '../utils/categoryHelpers';
import { BudgetSetupModal } from '../components/BudgetSetupModal';

const budgetRepo = new BudgetRepository();

export const BudgetDetailScreen: React.FC = () => {
    const route = useRoute();
    const navigation = useNavigation();

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

    const [editingBreakdown, setEditingBreakdown] = useState<BudgetBreakdown | null>(null);
    const [editAmountValue, setEditAmountValue] = useState<string>('');
    const [savingBreakdownId, setSavingBreakdownId] = useState<string | null>(null);

    const [isAddingNew, setIsAddingNew] = useState(false);
    const [isAddingUnplanned, setIsAddingUnplanned] = useState(false);

    useEffect(() => {
        if (isAddingNew) {
            addItemSheetRef.current?.present();
        } else {
            addItemSheetRef.current?.dismiss();
        }
    }, [isAddingNew]);

    useEffect(() => {
        if (editingBreakdown) {
            editActualSheetRef.current?.present();
        } else {
            editActualSheetRef.current?.dismiss();
        }
    }, [editingBreakdown]);

    useEffect(() => {
        if (reviewModalVisible) {
            reviewTransactionsSheetRef.current?.present();
        } else {
            reviewTransactionsSheetRef.current?.dismiss();
        }
    }, [reviewModalVisible]);
    const [newName, setNewName] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [addingBreakdown, setAddingBreakdown] = useState(false);

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [availableTags, setAvailableTags] = useState<{ id: string, name: string }[]>([]);

    const addItemSheetRef = useRef<SwipeableSheetRef>(null);
    const editActualSheetRef = useRef<SwipeableSheetRef>(null);
    const reviewTransactionsSheetRef = useRef<SwipeableSheetRef>(null);

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
                        setEditingBreakdown(null);
                        setEditAmountValue('');
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

    const handleReviewUnaccounted = async (tagId?: string) => {
        if (!budgetLineId) return;
        setTargetTagId(tagId || null);
        setReviewModalVisible(true);
        const transactions = await budgetRepo.getTransactionsForReconciliation(categoryId, month);
        setUnaccountedTransactions(transactions);
    };

    const handleToggleLink = async (tx: any, currentTagId: string) => {
        // Check if already linked to THIS specific tag
        const isLinkedToThis = (tx.directTagId === currentTagId) ||
            (tx.allocationTags?.split(',').includes(currentTagId));

        if (isLinkedToThis) {
            // Unlink
            setClaimingTagId(tx.id);
            try {
                await budgetRepo.removeTransactionLink(tx.id, currentTagId);
                // Vibration.vibrate(50);
                const transactions = await budgetRepo.getTransactionsForReconciliation(categoryId, month);
                setUnaccountedTransactions(transactions);
                loadData();
            } catch (e) {
                console.error("Unlink failed", e);
            } finally {
                setClaimingTagId(null);
            }
        } else {
            // Link (Claim or Allocate)
            const remaining = tx.unallocatedBalance ?? tx.amount;
            if (remaining <= 0) {
                Alert.alert("No Balance", "This transaction has already been fully allocated.");
                return;
            }

            const doLink = async (amount: number) => {
                setClaimingTagId(tx.id);
                try {
                    if (Math.abs(amount - tx.amount) < 0.01 && remaining === tx.amount) {
                        await budgetRepo.claimTransaction(tx.id, currentTagId);
                    } else {
                        await budgetRepo.allocateTransaction(tx.id, categoryId, currentTagId, amount);
                    }
                    // Vibration.vibrate(80);
                    const transactions = await budgetRepo.getTransactionsForReconciliation(categoryId, month);
                    setUnaccountedTransactions(transactions);
                    loadData();
                } catch (e) {
                    console.error("Link failed", e);
                    Alert.alert("Error", "Failed to link transaction.");
                } finally {
                    setClaimingTagId(null);
                }
            };

            // On Android we can't use Prompt, so we default to full remaining amount
            // Users can adjust the breakdown actuals separately as per their workflow
            Alert.alert(
                "Link Transaction",
                `Link ${formatKes(remaining)} to this item?`,
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Link", onPress: () => doLink(remaining) }
                ]
            );
        }
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
                        onPress={() => handleReviewUnaccounted()}
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
                        onPress={() => !isLocked && setEditModalVisible(true)}
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
                                                    setEditingBreakdown(item);
                                                    setEditAmountValue(item.actualAmount ? item.actualAmount.toString() : '');
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
                                if (!isLocked) {
                                    setIsAddingUnplanned(false);
                                    setIsAddingNew(true);
                                    setNewAmount('');
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
                                if (!isLocked) {
                                    setIsAddingUnplanned(true);
                                    setIsAddingNew(true);
                                    setNewAmount('0');
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

            <BudgetSetupModal
                visible={editModalVisible}
                onClose={() => setEditModalVisible(false)}
                onBudgetAdded={() => {
                    setEditModalVisible(false);
                    loadData();
                }}
                currentMonth={month}
                initialCategoryId={categoryId}
                initialLimitAmount={limitAmount}
                initialBudgetLineId={budgetLineId || undefined}
            />

            {/* Add Item Modal */}
            <SwipeableSheet
                ref={addItemSheetRef}
                onDismiss={() => { setIsAddingNew(false); setNewName(''); setNewAmount(''); }}
                title={isAddingUnplanned ? 'Log Unplanned Expense' : 'Add Planned Item'}
                snapPoints={['65%']}
            >
                <ScrollView contentContainerStyle={[styles.modalSheet, { paddingBottom: 60 }]}>
                    <Text style={styles.modalSubtitle}>
                        {isAddingUnplanned
                            ? 'Log a purchase that was not in your original budget.'
                            : 'Enter the item name and estimated cost.'}
                    </Text>

                    {/* Tag Suggestions (Entry Options) */}
                    {availableTags.length > 0 && (
                        <View style={styles.modalField}>
                            <Text style={styles.modalLabel}>Entry Options</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagPicker}>
                                {availableTags.map((tag) => (
                                    <TouchableOpacity
                                        key={tag.id}
                                        style={[styles.tagChip, newName === tag.name && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                                        onPress={() => setNewName(tag.name)}
                                    >
                                        <Text style={[styles.tagChipText, newName === tag.name && { color: colors.primary }]}>{formatTagName(tag.name)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Item Name</Text>
                        <RNTextInput
                            style={styles.modalInput}
                            placeholder={isAddingUnplanned ? "e.g. Pharmacy, Gift, Emergency" : "e.g. Groceries, Shoes, Bread"}
                            placeholderTextColor="#94A3B8"
                            value={newName}
                            onChangeText={setNewName}
                            returnKeyType="next"
                        />
                    </View>

                    <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>{isAddingUnplanned ? 'Amount Spent' : 'Estimated Amount'}</Text>
                        <View style={styles.modalAmountRow}>
                            <Text style={styles.modalCurrency}>KES</Text>
                            <RNTextInput
                                style={styles.modalAmountInput}
                                placeholder="0"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                                value={newAmount}
                                onChangeText={setNewAmount}
                                returnKeyType="done"
                                onSubmitEditing={handleAddNewBreakdown}
                            />
                        </View>
                    </View>

                    <View style={styles.modalActions}>
                        <TouchableOpacity
                            onPress={() => { setIsAddingNew(false); setNewName(''); setNewAmount(''); }}
                            style={styles.modalCancelBtn}
                        >
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleAddNewBreakdown}
                            style={[
                                styles.modalSaveBtn,
                                (!newName.trim() || !newAmount.trim()) && { opacity: 0.4 }
                            ]}
                            disabled={!newName.trim() || !newAmount.trim() || addingBreakdown}
                        >
                            {addingBreakdown ? (
                                <ActivityIndicator size="small" color="#0d1b12" />
                            ) : (
                                <Text style={styles.modalSaveText}>Add Item</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SwipeableSheet>

            {/* Log Actual Amount Modal */}
            <SwipeableSheet
                ref={editActualSheetRef}
                onDismiss={() => { setEditingBreakdown(null); setEditAmountValue(''); }}
                title="Log Actual Amount"
                snapPoints={['60%']}
            >
                <ScrollView contentContainerStyle={[styles.modalSheet, { paddingBottom: 60 }]}>
                    {editingBreakdown && (
                        <View style={styles.actualModalContext}>
                            <Text style={styles.actualModalItemName}>{editingBreakdown?.tagName}</Text>
                            <Text style={styles.actualModalEstimate}>Estimated: {formatKes(editingBreakdown?.plannedAmount || 0)}</Text>
                        </View>
                    )}

                    <View style={styles.modalField}>
                        <Text style={styles.modalLabel}>Actual Amount Spent</Text>
                        <View style={styles.modalAmountRow}>
                            <Text style={styles.modalCurrency}>KES</Text>
                            <RNTextInput
                                style={styles.modalAmountInput}
                                placeholder="0"
                                placeholderTextColor="#94A3B8"
                                keyboardType="numeric"
                                value={editAmountValue}
                                onChangeText={setEditAmountValue}
                                returnKeyType="done"
                                onSubmitEditing={handleSaveActualAmount}
                                selectTextOnFocus
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.verifyBtn}
                        onPress={() => {
                            const tagId = editingBreakdown?.tagId;
                            setEditingBreakdown(null);
                            setTimeout(() => handleReviewUnaccounted(tagId), 300);
                        }}
                    >
                        <Search size={14} color={colors.primary} />
                        <Text style={styles.verifyBtnText}>Verify with M-Pesa</Text>
                    </TouchableOpacity>
                    <View style={styles.modalActions}>
                        <TouchableOpacity
                            onPress={() => { setEditingBreakdown(null); setEditAmountValue(''); }}
                            style={styles.modalCancelBtn}
                        >
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSaveActualAmount}
                            style={styles.modalSaveBtn}
                            disabled={savingBreakdownId !== null}
                        >
                            {savingBreakdownId ? (
                                <ActivityIndicator size="small" color="#0d1b12" />
                            ) : (
                                <Text style={styles.modalSaveText}>Save</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SwipeableSheet>
            {/* Review Unaccounted Modal */}
            <SwipeableSheet
                ref={reviewTransactionsSheetRef}
                onDismiss={() => setReviewModalVisible(false)}
                title="Transaction Verification"
                snapPoints={['75%']}
            >
                <ScrollView contentContainerStyle={styles.reviewContainer}>
                    <Text style={styles.reviewSubtitle}>
                        {targetTagId ? `Verifying: ${formatTagName(breakdowns.find((b: BudgetBreakdown) => b.tagId === targetTagId)?.tagName || '')}` : 'Reviewing all category transactions'}
                    </Text>

                    {unaccountedTransactions.length === 0 ? (
                        <View style={styles.noUnclaimed}>
                            <CheckCircle size={48} color={colors.success} opacity={0.3} />
                            <Text style={styles.noUnclaimedText}>No transactions found for this period.</Text>
                        </View>
                    ) : (
                        unaccountedTransactions.map((tx: any) => {
                            const isLinkedToCurrent = targetTagId && (
                                tx.directTagId === targetTagId ||
                                (tx.allocationTags && tx.allocationTags.split(',').includes(targetTagId)) ||
                                (tx.legacyTags && tx.legacyTags.split(',').includes(targetTagId))
                            );

                            const otherTagNames: string[] = [];
                            if (tx.directTagName && tx.directTagId !== targetTagId) {
                                otherTagNames.push(tx.directTagName);
                            }
                            if (tx.allocationTagNames) {
                                const names = tx.allocationTagNames.split(',');
                                const ids = tx.allocationTags ? tx.allocationTags.split(',') : [];
                                names.forEach((name: string, index: number) => {
                                    if (ids[index] !== targetTagId) {
                                        otherTagNames.push(name);
                                    }
                                });
                            }

                            const dedupedOtherTags = Array.from(new Set(otherTagNames.filter(Boolean)));
                            const hasOtherLinks = dedupedOtherTags.length > 0;
                            const isFullyLinkedElsewhere = tx.unallocatedBalance <= 0.01 && !isLinkedToCurrent;

                            return (
                                <View key={tx.id} style={[
                                    styles.transactionItem,
                                    isLinkedToCurrent && { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
                                    isFullyLinkedElsewhere && { opacity: 0.4 }
                                ]}>
                                    <View style={styles.txMain}>
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.txHeader}>
                                                <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                                <Text style={styles.txAmount}>{formatKes(tx.amount)}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <Text style={styles.txDate}>{new Date(tx.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                                                {tx.unallocatedBalance < tx.amount - 0.01 && (
                                                    <View style={styles.partialBadge}>
                                                        <Text style={styles.partialBadgeText}>
                                                            BAL: {formatKes(tx.unallocatedBalance)}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            {hasOtherLinks && (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                                                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>Also tagged as:</Text>
                                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                                        {dedupedOtherTags.map((name, idx) => (
                                                            <View key={idx} style={{ paddingHorizontal: 4, paddingVertical: 1, backgroundColor: '#F1F5F9', borderRadius: 4 }}>
                                                                <Text style={{ fontSize: 9, color: colors.textSecondary }}>{formatTagName(name)}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                </View>
                                            )}
                                        </View>

                                        {targetTagId && !isFullyLinkedElsewhere && (
                                            <TouchableOpacity
                                                onPress={() => handleToggleLink(tx, targetTagId)}
                                                disabled={claimingTagId === tx.id}
                                                style={styles.toggleLinkBtn}
                                                hitSlop={15}
                                            >
                                                {claimingTagId === tx.id ? (
                                                    <ActivityIndicator size="small" color="#3B82F6" />
                                                ) : (
                                                    isLinkedToCurrent ? (
                                                        <Link2 size={24} color="#3B82F6" />
                                                    ) : (
                                                        <Link2Off size={24} color={colors.textSecondary} />
                                                    )
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {!targetTagId && !isFullyLinkedElsewhere && (
                                        <View style={{ marginTop: 12 }}>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase' }}>Allocate to:</Text>
                                            <View style={styles.tagPicker}>
                                                {breakdowns.map((bb: BudgetBreakdown) => (
                                                    <TouchableOpacity
                                                        key={bb.id}
                                                        style={styles.tagChip}
                                                        onPress={() => handleToggleLink(tx, bb.tagId)}
                                                        disabled={claimingTagId === tx.id}
                                                    >
                                                        <Text style={styles.tagChipText}>{bb.tagName}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </SwipeableSheet>
        </SafeAreaView >
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

    // Actual Modal Context
    actualModalContext: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
        marginTop: 4,
    },
    actualModalItemName: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 4,
    },
    actualModalEstimate: {
        fontSize: 13,
        color: colors.textSecondary,
    },

    // Delete Item (in modal)
    deleteItemBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        gap: 8,
    },
    deleteItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.danger,
    },

    // Empty State
    emptyBreakdown: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    emptySubtext: {
        fontSize: 12,
        color: '#94A3B8',
    },



    addItemBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        marginVertical: 8,
        borderRadius: 10,
        backgroundColor: '#F8FAF9',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        gap: 8,
    },
    addItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primaryDark,
    },

    // Add Item Modal
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalSheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 80,
    },
    modalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#D1D5DB',
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 4,
    },
    modalSubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        marginBottom: 24,
    },
    modalField: {
        marginBottom: 20,
    },
    modalLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    modalInput: {
        fontSize: 15,
        color: colors.text,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    modalAmountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
    },
    modalCurrency: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
        marginRight: 8,
    },
    modalAmountInput: {
        flex: 1,
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
        paddingVertical: 12,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    modalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
    },
    modalCancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    modalSaveBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: colors.primary,
    },
    modalSaveText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0d1b12',
    },

    // Reconciliation
    reconCard: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 18,
    },
    reconRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    reconLabel: {
        fontSize: 14,
        color: '#94A3B8',
    },
    reconValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#E2E8F0',
    },
    reconDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 12,
    },
    reconSubLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
    },
    reconSubValue: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
    },

    // Unaccounted Feature Styles
    unaccountedRow: {
        backgroundColor: '#F0F9FF',
        borderBottomWidth: 0,
        borderRadius: 8,
        marginVertical: 4,
    },
    unaccountedDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.primary,
        marginRight: 8,
    },
    unaccountedText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primary,
    },
    unaccountedValue: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },

    // Review Modal Styles
    reviewContainer: {
        paddingVertical: 20,
        paddingHorizontal: 20,
        paddingBottom: 80,
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    reviewTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    reviewSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    transactionItem: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    txMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    txHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    txDesc: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
        marginRight: 10,
    },
    txAmount: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    txDate: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    toggleLinkBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    partialBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: '#FEF3C7',
        borderRadius: 4,
    },
    partialBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#92400E',
    },
    tagPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#F1F5F9',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    tagChipText: {
        fontSize: 12,
        color: colors.text,
        fontWeight: '600',
    },
    noUnclaimed: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 16,
    },
    noUnclaimedText: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    verifiedText: {
        fontSize: 9,
        fontWeight: '600',
        color: colors.primary,
        marginTop: 1,
    },
    verifyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        marginHorizontal: 40,
        marginBottom: 20,
        borderRadius: 12,
        backgroundColor: colors.primary + '10', // Light primary
        borderWidth: 1,
        borderColor: colors.primary + '30',
    },
    verifyBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
    },
});
