import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type SummaryCardProps = {
    month: string;
    totalSpent: number;
    totalIncome: number;
    topCategory?: { name: string; amount: number; percent: number };
};

const SummaryCard: React.FC<SummaryCardProps> = ({ month, totalSpent, totalIncome, topCategory }) => {
    const net = totalIncome - totalSpent;

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.label}>Cash Flow ({month})</Text>
                <Text style={styles.currencyIcon}>🇰🇪</Text>
            </View>

            <View style={styles.balanceRow}>
                <View>
                    <Text style={styles.subLabel}>Income</Text>
                    <Text style={[styles.amount, { color: '#4CAF50' }]}>
                        +{totalIncome.toLocaleString()}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.subLabel}>Spent</Text>
                    <Text style={styles.amount}>
                        -{totalSpent.toLocaleString()}
                    </Text>
                </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.statsRow}>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>Net Balance</Text>
                    <Text style={[styles.statValue, { color: net >= 0 ? '#E8F5E9' : '#FFEBEE' }]}>
                        {net >= 0 ? '+' : ''} {net.toLocaleString()}
                    </Text>
                </View>
                {topCategory && (
                    <View style={[styles.stat, { alignItems: 'flex-end' }]}>
                        <Text style={styles.statLabel}>Top Expense</Text>
                        <Text style={styles.statValue}>
                            {topCategory.name} ({topCategory.percent}%)
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#2196F3',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        elevation: 5,
        shadowColor: '#2196F3',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    label: {
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    currencyIcon: {
        fontSize: 20,
    },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    subLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        marginBottom: 2
    },
    amount: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginVertical: 10
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    stat: {
        flex: 1,
    },
    statLabel: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 12,
        marginBottom: 2,
    },
    statValue: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
});

export default SummaryCard;
