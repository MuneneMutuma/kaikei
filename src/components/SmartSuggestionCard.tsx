import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Lightbulb, ChevronRight, X } from 'lucide-react-native';

interface SmartSuggestionCardProps {
    payeeName: string;
    count: number;
    sampleTx?: any;
    onConfirm: () => void;
    onDismiss: () => void;
    onSelectCategory: () => void;
    selectedCategoryName?: string;
    isUpdating: boolean;
    onOpenDetails: () => void;
}

export const SmartSuggestionCard = memo(({
    payeeName,
    count,
    onDismiss,
    onOpenDetails,
}: SmartSuggestionCardProps) => {

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={onOpenDetails}
        >
            {/* Left: Icon & Highlight Bar */}
            <View style={styles.leftContainer}>
                <View style={styles.iconContainer}>
                    <Lightbulb size={20} color={colors.primary} fill={colors.primary} />
                </View>
                <View>
                    <Text style={styles.title}>Categorize {payeeName}</Text>
                    <Text style={styles.subtitle}>
                        {count} similar transactions found
                    </Text>
                </View>
            </View>

            {/* Right: Action & Close */}
            <View style={styles.rightContainer}>
                <ChevronRight size={20} color={colors.textSecondary} />

                {/* Close Button - Absolute Positioned or just separate? 
                    Let's put it top right absolute to not clutter flow 
                */}
            </View>

            <TouchableOpacity
                style={styles.closeBtn}
                onPress={onDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',

        // Premium Shadow / Glassmorphic feel
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,

        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.15)', // Subtle Brand Green Border
    },
    leftContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(76, 175, 80, 0.1)', // Light Green bg
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    title: {
        ...typography.body,
        fontWeight: 'bold',
        color: colors.text,
        marginBottom: 2,
    },
    subtitle: {
        ...typography.caption,
        color: colors.textSecondary,
    },
    rightContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 10,
    },
    closeBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        opacity: 0.5
    }
});
