import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { X } from 'lucide-react-native';

interface DailyBreakdownSheetProps {
    date: string | null;
    data: { total: number; categories: any[] } | null;
    onDismiss: () => void;
}

export const DailyBreakdownSheet = ({ date, data, onDismiss }: DailyBreakdownSheetProps) => {
    // If we have a date, we show the modal.
    if (!date) return null;

    const formattedDate = new Date(date).toLocaleDateString('en-KE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    const categories = data?.categories || [];
    const total = data?.total || 0;

    return (
        <Modal
            animationType="fade" // Changed to fade for the backdrop, sheet can animate if needed or just appear
            transparent={true}
            visible={!!date}
            onRequestClose={onDismiss}
        >
            <View style={styles.centeredView}>
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={onDismiss}
                />
                <View style={[styles.sheetContainer, { backgroundColor: colors.surface || 'white' }]}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>{formattedDate}</Text>
                            <Text style={styles.subtitle}>Daily Spending Breakdown</Text>
                        </View>
                        <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
                            <X size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {data === null ? (
                        <View style={styles.loaderContainer}>
                            <Text style={styles.loadingText}>Loading details...</Text>
                        </View>
                    ) : categories.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No expenses recorded for this day.</Text>
                        </View>
                    ) : (
                        <View style={{ maxHeight: 400 }}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Total</Text>
                                <Text style={styles.totalAmount}>Ksh {total.toLocaleString()}</Text>
                            </View>
                            <FlatList
                                data={categories}
                                keyExtractor={(item) => item.name}
                                renderItem={({ item }) => (
                                    <View style={styles.row}>
                                        <View style={styles.categoryInfo}>
                                            <View style={[styles.dot, { backgroundColor: item.color || colors.primary }]} />
                                            <Text style={styles.categoryName}>{item.name}</Text>
                                        </View>
                                        <Text style={styles.amount}>Ksh {item.total.toLocaleString()}</Text>
                                    </View>
                                )}
                                ItemSeparatorComponent={() => <View style={styles.separator} />}
                                contentContainerStyle={styles.listContent}
                            />
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)', // Backdrop color moved here for full coverage
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        // backgroundColor is handled by centeredView to ensure seamless dimming
    },
    sheetContainer: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 30, // Safe area padding
        width: '100%',

        // Shadow for the sheet itself
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000',
    },
    subtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    closeButton: {
        padding: 8,
        backgroundColor: '#F5F5F5',
        borderRadius: 20,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    categoryInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12,
    },
    categoryName: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
    amount: {
        fontSize: 14,
        fontWeight: '700',
        color: '#000',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fafafa',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    totalAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.primary,
    },
    separator: {
        height: 1,
        backgroundColor: '#F0F0F0',
    },
    loaderContainer: { padding: 40, alignItems: 'center' },
    loadingText: { color: colors.textSecondary, fontStyle: 'italic' },
    emptyContainer: { padding: 40, alignItems: 'center' },
    emptyText: { color: colors.textSecondary }
});
