import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Expense } from '../services/ledger/Schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Mic, AlertCircle, Briefcase, User } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor } from '../screens/AnalyticsScreen';

interface TransactionRowProps {
    item: Expense;
    onPress: (item: Expense) => void;
    showDate?: boolean;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({ item, onPress, showDate = false }) => {
    const Icon = getCategoryIcon(item.categoryName);
    const color = getCategoryColor(item.categoryName);

    // Time formatting
    const dateObj = new Date(item.date);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

    const timeLabel = showDate ? `${dateStr}, ${timeStr}` : timeStr;

    // Subtitle composition
    let sourceContext = '';
    if (item.source === 'voice') sourceContext = ' • Voice';
    if (item.account && item.account.toLowerCase() !== 'mpesa') sourceContext += ` • ${item.account}`;

    // Review Status (Unverified)
    const needsReview = !item.isVerified;

    return (
        <TouchableOpacity style={styles.container} onPress={() => onPress(item)} activeOpacity={0.7}>
            {/* Icon Column */}
            <View style={styles.iconCol}>
                <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
                    <Icon size={20} color={color} />
                </View>
                {needsReview && (
                    <View style={styles.reviewDot} />
                )}
                {!!item.isBusiness ? (
                    <View style={styles.businessBadge}>
                        <Briefcase size={8} color="white" />
                    </View>
                ) : (
                    <View style={styles.personalBadge}>
                        <User size={8} color="white" />
                    </View>
                )}
            </View>

            {/* Content Column */}
            <View style={styles.contentCol}>
                <Text style={styles.title} numberOfLines={1}>
                    {item.description.replace(/^(paid to|received from)\s+/i, '').trim()}
                </Text>
                <View style={styles.metaRow}>
                    <Text style={styles.subtitle}>
                        {timeLabel} • {item.categoryName}{sourceContext}
                    </Text>
                </View>
            </View>

            {/* Amount Column */}
            <View style={styles.amountCol}>
                <Text style={[
                    styles.amount,
                    { color: item.type === 'expense' ? colors.error : colors.success }
                ]}>
                    {item.type === 'expense' ? '-' : '+'} {item.amount.toLocaleString()}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.background,
    },
    iconCol: {
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
    reviewDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#F59E0B', // Orange warning
        borderWidth: 1.5,
        borderColor: colors.surface,
    },
    businessBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#0EA5E9', // Sky Blue
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: colors.surface,
    },
    personalBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#10B981', // Emerald Green
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: colors.surface,
    },
    contentCol: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        ...typography.body,
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 3,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    subtitle: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    amountCol: {
        alignItems: 'flex-end',
        marginLeft: 8,
    },
    amount: {
        ...typography.mono,
        fontSize: 15,
        fontWeight: 'bold',
    },
});
