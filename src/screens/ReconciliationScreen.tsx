import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { BudgetBreakdown } from '../services/ledger/Schema';
import { ChevronLeft, CheckCircle, Link2, Link2Off } from 'lucide-react-native';

type ReconciliationScreenRouteProp = RouteProp<RootStackParamList, 'Reconciliation'>;
type ReconciliationNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reconciliation'>;

export const ReconciliationScreen: React.FC = () => {
    const navigation = useNavigation<ReconciliationNavigationProp>();
    const route = useRoute<ReconciliationScreenRouteProp>();
    const { categoryId, month, tagId: initialTagId } = route.params;

    const [transactions, setTransactions] = useState<any[]>([]);
    const [breakdowns, setBreakdowns] = useState<BudgetBreakdown[]>([]);
    const [loading, setLoading] = useState(true);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [targetTagId, setTargetTagId] = useState<string | null>(initialTagId || null);

    const budgetRepo = new BudgetRepository();

    useEffect(() => {
        loadData();
    }, [categoryId, month]);

    const loadData = async () => {
        setLoading(true);
        try {
            const txs = await budgetRepo.getTransactionsForReconciliation(categoryId, month);
            setTransactions(txs);

            const budgetData = await budgetRepo.getBudgetWithBreakdowns(categoryId, month, true);
            if (budgetData) {
                setBreakdowns(budgetData.breakdowns);
            }
        } catch (e) {
            console.error("Failed to load reconciliation data", e);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleLink = async (tx: any, tagId: string) => {
        setClaimingId(tx.id);
        try {
            const currentTagIds = tx.currentTagIds ? tx.currentTagIds.split(',') : [];
            const isDirectlyLinked = currentTagIds.includes(tagId);
            const isAllocated = tx.allocationTags && tx.allocationTags.split(',').includes(tagId);

            if (isDirectlyLinked || isAllocated) {
                await budgetRepo.removeTransactionLink(tx.id, tagId);
            } else {
                // If it's the first link and it's full, use direct claim
                if (tx.unallocatedBalance >= tx.amount - 0.01) {
                    await budgetRepo.claimTransaction(tx.id, tagId);
                } else {
                    // Otherwise split it
                    await budgetRepo.allocateTransaction(tx.id, categoryId, tagId, tx.unallocatedBalance);
                }
            }
            await loadData();
        } catch (e) {
            console.error("Failed to toggle link", e);
            Alert.alert("Error", "Could not update link.");
        } finally {
            setClaimingId(null);
        }
    };

    const formatKes = (amount: number) => {
        return `KES ${amount.toLocaleString()}`;
    };

    const formatTagName = (name: string) => {
        return name || 'Unknown';
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                <View style={styles.titleContainer}>
                    <Text style={styles.headerTitle}>Verification</Text>
                    {targetTagId && (
                        <Text style={styles.subtitle}>
                            Target: {formatTagName(breakdowns.find(b => b.tagId === targetTagId)?.tagName || '')}
                        </Text>
                    )}
                </View>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {transactions.length === 0 ? (
                        <View style={styles.noTransactions}>
                            <CheckCircle size={64} color={colors.success} opacity={0.2} />
                            <Text style={styles.noTransactionsText}>No transactions found for this period.</Text>
                        </View>
                    ) : (
                        transactions.map((tx: any) => {
                            const currentTagIds = tx.currentTagIds ? tx.currentTagIds.split(',') : [];
                            const currentTagNames = tx.currentTagNames ? tx.currentTagNames.split(',') : [];
                            
                            const isLinkedToTarget = targetTagId && currentTagIds.includes(targetTagId);

                            const otherTagNames: string[] = [];
                            currentTagNames.forEach((name: string, index: number) => {
                                if (currentTagIds[index] !== targetTagId) {
                                    otherTagNames.push(name);
                                }
                            });

                            const allocationTagNames = tx.allocationTagNames ? tx.allocationTagNames.split(',') : [];
                            const allocationIds = tx.allocationTags ? tx.allocationTags.split(',') : [];
                            allocationTagNames.forEach((name: string, index: number) => {
                                if (allocationIds[index] !== targetTagId) {
                                    otherTagNames.push(name);
                                }
                            });

                            const dedupedOtherTags = Array.from(new Set(otherTagNames.filter(Boolean)));
                            const hasOtherLinks = dedupedOtherTags.length > 0;
                            const isFullyLinkedElsewhere = tx.unallocatedBalance <= 0.01 && !isLinkedToTarget;

                            return (
                                <View key={tx.id} style={[
                                    styles.transactionCard,
                                    isLinkedToTarget && styles.linkedCard,
                                    isFullyLinkedElsewhere && styles.dimmedCard
                                ]}>
                                    <View style={styles.txMain}>
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.txHeaderRow}>
                                                <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                                <Text style={styles.txAmount}>{formatKes(tx.amount)}</Text>
                                            </View>
                                            <View style={styles.txMetaRow}>
                                                <Text style={styles.txDate}>{new Date(tx.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text>
                                                {tx.unallocatedBalance < tx.amount - 0.01 && tx.unallocatedBalance > 0 && (
                                                    <View style={styles.partialBadge}>
                                                        <Text style={styles.partialBadgeText}>
                                                            BAL: {formatKes(tx.unallocatedBalance)}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            {hasOtherLinks && (
                                                <View style={styles.otherLinksRow}>
                                                    <Text style={styles.otherLinksLabel}>Tagged as:</Text>
                                                    <View style={styles.tagChipsRow}>
                                                        {dedupedOtherTags.map((name, idx) => (
                                                            <View key={idx} style={styles.miniTag}>
                                                                <Text style={styles.miniTagText}>{name}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                </View>
                                            )}
                                        </View>

                                        {targetTagId && !isFullyLinkedElsewhere && (
                                            <TouchableOpacity
                                                onPress={() => handleToggleLink(tx, targetTagId)}
                                                disabled={claimingId === tx.id}
                                                style={styles.linkBtn}
                                            >
                                                {claimingId === tx.id ? (
                                                    <ActivityIndicator size="small" color="#3B82F6" />
                                                ) : isLinkedToTarget ? (
                                                    <Link2 size={24} color="#3B82F6" />
                                                ) : (
                                                    <Link2Off size={24} color={colors.textSecondary} />
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {!targetTagId && !isFullyLinkedElsewhere && (
                                        <View style={styles.allocationSection}>
                                            <Text style={styles.allocateLabel}>Allocate to:</Text>
                                            <View style={styles.tagPicker}>
                                                {breakdowns.map((bb: BudgetBreakdown) => {
                                                    const currentTagIds = tx.currentTagIds ? tx.currentTagIds.split(',') : [];
                                                    const isLinked = currentTagIds.includes(bb.tagId) || (tx.allocationTags && tx.allocationTags.split(',').includes(bb.tagId));
                                                    return (
                                                        <TouchableOpacity
                                                            key={bb.id}
                                                            style={[styles.tagChip, isLinked && styles.tagChipLinked]}
                                                            onPress={() => handleToggleLink(tx, bb.tagId)}
                                                            disabled={claimingId === tx.id}
                                                        >
                                                            <Text style={[styles.tagChipText, isLinked && styles.tagChipTextLinked]}>{bb.tagName}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    titleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    subtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    noTransactions: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    noTransactionsText: {
        marginTop: 16,
        fontSize: 15,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    transactionCard: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: "#000",
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
    },
    linkedCard: {
        borderColor: '#3B82F6',
        backgroundColor: '#F0F7FF',
    },
    dimmedCard: {
        opacity: 0.5,
    },
    txMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    txHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    txDesc: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
        marginRight: 10,
    },
    txAmount: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
    },
    txMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    txDate: {
        fontSize: 12,
        color: colors.textSecondary,
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
    otherLinksRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 8,
    },
    otherLinksLabel: {
        fontSize: 10,
        color: colors.textSecondary,
    },
    tagChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    miniTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: '#F1F5F9',
        borderRadius: 4,
    },
    miniTagText: {
        fontSize: 9,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    linkBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 24,
    },
    allocationSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    allocateLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
        marginBottom: 10,
        textTransform: 'uppercase',
    },
    tagPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    tagChipLinked: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    tagChipText: {
        fontSize: 12,
        color: colors.text,
        fontWeight: '600',
    },
    tagChipTextLinked: {
        color: '#FFF',
    },
});
