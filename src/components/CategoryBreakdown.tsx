import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type CategoryStat = {
    name: string;
    amount: number;
    percent: number;
    color: string;
    icon: string;
};

type Props = {
    data: CategoryStat[];
    total: number;
};

const CategoryBreakdown: React.FC<Props> = ({ data, total }) => {
    if (total === 0) return null;

    // Sort by percent desc
    const sorted = [...data].sort((a, b) => b.percent - a.percent);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Spending Breakdown</Text>

            {sorted.map((item, index) => (
                <View key={item.name} style={styles.row}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.icon}>{item.icon}</Text>
                    </View>

                    <View style={styles.barContainer}>
                        <View style={styles.labelRow}>
                            <Text style={styles.categoryName}>{item.name}</Text>
                            <Text style={styles.amount}>
                                {item.percent}% <Text style={styles.amountSub}>(Ksh {item.amount.toLocaleString()})</Text>
                            </Text>
                        </View>

                        <View style={styles.trough}>
                            <View
                                style={[
                                    styles.fill,
                                    { width: `${Math.max(item.percent, 2)}%`, backgroundColor: item.color }
                                ]}
                            />
                        </View>
                    </View>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 15,
    },
    row: {
        flexDirection: 'row',
        marginBottom: 15,
        alignItems: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F5F7FA',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    icon: {
        fontSize: 18,
    },
    barContainer: {
        flex: 1,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    categoryName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#444',
    },
    amount: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    amountSub: {
        fontSize: 12,
        fontWeight: '400',
        color: '#888',
    },
    trough: {
        height: 8,
        backgroundColor: '#F0F0F0',
        borderRadius: 4,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 4,
    },
});

export default CategoryBreakdown;
