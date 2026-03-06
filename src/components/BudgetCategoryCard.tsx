import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { BudgetLine } from '../services/ledger/Schema';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryHelpers';

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
    const { categoryName, limitAmount, spentAmount = 0, itemizedAmount = 0, isUnplanned } = budget;
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

    useEffect(() => {
        progressWidth.value = withSpring(percentageVisual, { damping: 20, stiffness: 90 });
    }, [percentageVisual, progressWidth]);

    const animatedProgressStyle = useAnimatedStyle(() => {
        return {
            width: `${progressWidth.value}%`,
            backgroundColor: statusColor
        };
    });

    const formatKes = (amount: number | null | undefined) => amount != null ? `KES ${amount.toLocaleString()}` : '';

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
                            {!isUnplanned ? (
                                <>
                                    <Text style={styles.limitText}>of {formatKes(limitAmount)}</Text>
                                    <Text style={[styles.statusText, percentageRaw >= 100 && { color: colors.danger, fontWeight: 'bold' }]}>
                                        • {percentageRaw >= 100 ? 'Over' : `${Math.round(percentageRaw)}%`}
                                    </Text>
                                </>
                            ) : (
                                <View style={styles.unplannedBadge}>
                                    <Text style={styles.unplannedBadgeText}>UNPLANNED ACTIVITY</Text>
                                </View>
                            )}
                        </View>

                        {/* Integrated Progress bar - Only for planned */}
                        {!isUnplanned && (
                            <View style={[styles.progressBarContainer, { marginTop: 6, height: 3 }]}>
                                <Animated.View style={[styles.progressBarFill, animatedProgressStyle]} />
                            </View>
                        )}
                    </View>
                </Pressable>
            </View>
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
    unplannedBadge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 4,
    },
    unplannedBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: colors.textSecondary,
        letterSpacing: 0.5,
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
});
