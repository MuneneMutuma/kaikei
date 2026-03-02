import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { BudgetLine, BudgetBreakdown } from '../services/ledger/Schema';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

// Common visual mappings
const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return colors.danger;
    if (percentage >= 80) return colors.warning;
    return colors.success;
};

interface BudgetCategoryCardProps {
    budget: BudgetLine;
    onPress?: () => void;
}

export const BudgetCategoryCard: React.FC<BudgetCategoryCardProps> = ({ budget, onPress }) => {
    const { categoryName, limitAmount, spentAmount = 0 } = budget;
    const progressWidth = useSharedValue(0);

    const safeSpent = Math.max(0, spentAmount);
    const safeLimit = Math.max(1, limitAmount); // avoid div by 0

    const percentageRaw = (safeSpent / safeLimit) * 100;
    // Cap visual progress at 100% so bar doesn't overflow container
    const percentageVisual = Math.min(100, Math.max(0, percentageRaw));

    const remaining = Math.max(0, limitAmount - safeSpent);

    // Icon and Color
    const Icon = getCategoryIcon(categoryName);
    const catColor = getCategoryColor(categoryName);
    const statusColor = getStatusColor(percentageRaw);

    const [isExpanded, setIsExpanded] = useState(false);
    const [breakdowns, setBreakdowns] = useState<BudgetBreakdown[]>([]);
    const [loadingBreakdown, setLoadingBreakdown] = useState(false);

    const budgetRepo = new BudgetRepository();

    useEffect(() => {
        progressWidth.value = withSpring(percentageVisual, { damping: 20, stiffness: 90 });
    }, [percentageVisual, progressWidth]);

    useEffect(() => {
        if (isExpanded && breakdowns.length === 0) {
            loadBreakdowns();
        }
    }, [isExpanded]);

    const loadBreakdowns = async () => {
        setLoadingBreakdown(true);
        try {
            const data = await budgetRepo.getBudgetBreakdowns(budget.id);
            setBreakdowns(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingBreakdown(false);
        }
    };

    const toggleExpand = (e: any) => {
        // Prevent trigger parent onPress (edit modal)
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    const animatedProgressStyle = useAnimatedStyle(() => {
        return {
            width: `${progressWidth.value}%`,
            backgroundColor: statusColor
        };
    });

    const formatKes = (amount: number) => `KES ${amount.toLocaleString()}`;

    return (
        <View style={styles.card}>
            <View style={styles.mainContainer}>
                {/* Primary Touch Area (Edit Modal) */}
                <Pressable onPress={onPress} style={styles.clickableArea}>
                    {/* Icon Column */}
                    <View style={styles.leftCol}>
                        <View style={[styles.iconCircle, { backgroundColor: `${catColor}15` }]}>
                            <Icon size={20} color={catColor} />
                        </View>
                    </View>

                    {/* Content Column */}
                    <View style={styles.rightCol}>
                        <View style={styles.headerRow}>
                            <Text style={styles.categoryName} numberOfLines={1}>{categoryName || 'Unknown'}</Text>
                        </View>

                        <View style={styles.amountsRow}>
                            <Text style={styles.spentText}>{formatKes(safeSpent)}</Text>
                            <Text style={styles.limitText}>of {formatKes(limitAmount)}</Text>
                            <Text style={[styles.statusText, percentageRaw >= 100 && { color: colors.danger, fontWeight: 'bold' }]}>
                                • {percentageRaw >= 100 ? 'Over' : `${Math.round(percentageRaw)}%`}
                            </Text>
                        </View>

                        {/* Integrated Progress bar */}
                        <View style={[styles.progressBarContainer, { marginTop: 6, height: 3 }]}>
                            <Animated.View style={[styles.progressBarFill, animatedProgressStyle]} />
                        </View>
                    </View>
                </Pressable>

                {/* Secondary Touch Area (Expand Breakdown) */}
                <Pressable
                    onPress={toggleExpand}
                    style={styles.expandHitArea}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <View style={styles.chevronBox}>
                        {isExpanded ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
                    </View>
                </Pressable>
            </View>

            {isExpanded && (
                <Pressable
                    onPress={onPress}
                    style={[
                        styles.breakdownWrapper,
                        { borderLeftColor: catColor }
                    ]}
                >
                    <View style={[
                        styles.breakdownContainer,
                        { backgroundColor: `${catColor}08` }
                    ]}>
                        {loadingBreakdown ? (
                            <ActivityIndicator size="small" color={catColor} style={{ padding: 10 }} />
                        ) : (() => {
                            const totalPlanned = breakdowns.reduce((sum, item) => sum + item.plannedAmount, 0);
                            const unallocated = limitAmount - totalPlanned;
                            const hasBreakdowns = breakdowns.length > 0;

                            return (
                                <>
                                    {breakdowns.map((item, index) => (
                                        <View
                                            key={item.id}
                                            style={[
                                                styles.breakdownRow,
                                                (unallocated <= 0 && index === breakdowns.length - 1) && { borderBottomWidth: 0 }
                                            ]}
                                        >
                                            <View style={styles.breakdownLabelGroup}>
                                                <Text style={styles.breakdownLabel}>{item.categoryName}</Text>
                                            </View>
                                            <Text style={styles.breakdownValue}>{formatKes(item.plannedAmount)}</Text>
                                        </View>
                                    ))}
                                    {unallocated > 0 && (
                                        <View style={[styles.breakdownRow, { borderBottomWidth: 0, opacity: 0.7 }]}>
                                            <View style={styles.breakdownLabelGroup}>
                                                <AlertCircle size={12} color={colors.textSecondary} />
                                                <Text style={[styles.breakdownLabel, { fontStyle: 'italic' }]}>Unallocated</Text>
                                            </View>
                                            <Text style={styles.breakdownValue}>{formatKes(unallocated)}</Text>
                                        </View>
                                    )}
                                    {!hasBreakdowns && unallocated <= 0 && (
                                        <Text style={styles.breakdownItemText}>No detailed plan added for this category.</Text>
                                    )}
                                </>
                            );
                        })()}
                    </View>
                </Pressable>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.background,
    },
    mainContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    clickableArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    expandHitArea: {
        paddingLeft: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chevronBox: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F8FAF9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    leftCol: {
        position: 'relative',
        marginRight: 14,
    },
    iconCircle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rightCol: {
        flex: 1,
        justifyContent: 'center',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
    },
    categoryName: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
        flex: 1,
    },
    statusText: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    amountsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    spentText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    limitText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    progressBarContainer: {
        flex: 1,
        height: 4,
        backgroundColor: '#f1f5f9',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    breakdownWrapper: {
        marginLeft: 72, // Align with the start of the text (42 icon + 14 margin + some offset)
        marginRight: 16,
        marginBottom: 16,
        borderLeftWidth: 2,
    },
    breakdownContainer: {
        padding: 12,
        borderRadius: 12,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.03)',
    },
    breakdownLabelGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    bullet: {
        width: 4,
        height: 4,
        borderRadius: 2,
        opacity: 0.5,
    },
    breakdownLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    breakdownValue: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
    },
    breakdownItemText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
        fontStyle: 'italic',
    }
});
