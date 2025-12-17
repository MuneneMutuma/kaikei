import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type SummaryCardProps = {
    month: string;
    totalSpent: number;
    topCategory?: { name: string; amount: number; percent: number };
};

const SummaryCard: React.FC<SummaryCardProps> = ({ month, totalSpent, topCategory }) => {
    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.label}>Total Spent ({month})</Text>
                <Text style={styles.currencyIcon}>🇰🇪</Text>
            </View>

            <Text style={styles.amount}>
                Ksh {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Text>

            {topCategory && (
                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <Text style={styles.statLabel}>Top Category</Text>
                        <Text style={styles.statValue}>
                            {topCategory.name} ({topCategory.percent}%)
                        </Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statLabel}>Remaining</Text>
                        <Text style={styles.statValue}>--</Text>
                    </View>
                </View>
            )}
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
        marginBottom: 5,
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
    amount: {
        color: '#fff',
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 12,
        padding: 15,
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
