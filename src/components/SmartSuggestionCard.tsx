import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Pressable } from 'react-native';

interface SmartSuggestionCardProps {
    payeeName: string;
    count: number;
    sampleTx?: any; // MpesaTransaction object
    onConfirm: () => void;
    onDismiss: () => void;
    onSelectCategory: () => void;
    selectedCategoryName?: string;
    isUpdating: boolean;
}

export const SmartSuggestionCard = memo(({
    payeeName,
    count,
    sampleTx,
    onConfirm,
    onDismiss,
    onSelectCategory,
    onOpenDetails, // New Prop
    selectedCategoryName,
    isUpdating
}: SmartSuggestionCardProps & { onOpenDetails: () => void }) => {

    // Helper to safe format currency
    const fmt = (n: any) => typeof n === 'number' ? n.toLocaleString() : n;

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.9}
            onPress={onOpenDetails} // Click whole card to open details
        >
            <View style={styles.headerRow}>
                <Text style={styles.icon}>💡</Text>
                <View style={styles.textContainer}>
                    <Text style={styles.title}>Frequent Payment Detected</Text>
                    <Text style={styles.subtitle}>
                        You have <Text style={styles.bold}>{count}</Text> transactions for <Text style={styles.bold}>{payeeName}</Text>.
                    </Text>
                </View>
                <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
            </View>

            {/* Example Box - IMPROVED FORMATTING */}
            <View style={styles.exampleBox}>
                <Text style={styles.exampleLabel}>LATEST TRANSACTION:</Text>
                {sampleTx ? (
                    <Text style={styles.exampleText}>
                        <Text style={styles.bold}>Ksh {fmt(sampleTx.amount)}</Text>
                        <Text style={{ color: '#555' }}> on </Text>
                        <Text style={styles.bold}>{new Date(sampleTx.date).toLocaleDateString()}</Text>
                        <Text style={{ color: '#555' }}> at </Text>
                        <Text style={styles.bold}>{sampleTx.time}</Text>
                        {"\n"}
                        <Text style={{ fontSize: 12, color: '#777', fontStyle: 'italic' }} numberOfLines={1}>
                            "{sampleTx.rawText}"
                        </Text>
                    </Text>
                ) : (
                    <Text style={styles.exampleText}>
                        Payee: <Text style={styles.bold}>{payeeName}</Text>
                    </Text>
                )}
            </View>

            <View style={styles.actionRow}>
                <Text style={styles.hintText}>Tap to review & categorize...</Text>
                {/* 
                   We hide the direct "Fix All" button here to encourage reviewing via the modal 
                   OR we can keep it as a shortcut. User asked for "popup of all transactions", 
                   implying they want to review. Let's keep the card simple and push them to the modal.
                   But for speed, maybe a quick "Categorize All" is good? 
                   Let's keep the Quick Action but make the Card Clickable.
                */}
            </View>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#E3F2FD', // Light Blue
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#BBDEFB',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    icon: {
        fontSize: 20,
        marginRight: 10,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#1565C0',
        marginBottom: 1,
    },
    subtitle: {
        fontSize: 12,
        color: '#333',
    },
    bold: {
        fontWeight: 'bold',
        color: '#000',
    },
    exampleBox: {
        backgroundColor: '#FFF',
        padding: 8,
        borderRadius: 6,
        marginBottom: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#2196F3',
    },
    exampleLabel: {
        fontSize: 9,
        color: '#999',
        fontWeight: 'bold',
        marginBottom: 2,
    },
    exampleText: {
        fontSize: 12,
        color: '#333',
        marginBottom: 2,
    },
    exampleDate: {
        fontSize: 11,
        color: '#777',
        marginTop: 4,
    },
    closeBtn: {
        padding: 4,
    },
    closeText: {
        fontSize: 16,
        color: '#999',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        height: 36,
    },
    pickerBtn: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#BBDEFB',
        paddingHorizontal: 10,
    },
    pickerText: {
        fontSize: 13,
        color: '#333',
    },
    chevron: {
        fontSize: 10,
        color: '#999',
    },
    confirmBtn: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 20,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    disabledBtn: {
        backgroundColor: '#90CAF9',
    },
    confirmText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13,
    },
    hintText: {
        fontSize: 11,
        color: '#666',
        fontStyle: 'italic',
        marginTop: 4
    }
});
