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
    selectedCategoryName,
    isUpdating
}: SmartSuggestionCardProps) => {
    
    // Helper to safe format currency
    const fmt = (n: any) => typeof n === 'number' ? n.toLocaleString() : n;

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.icon}>💡</Text>
                <View style={styles.textContainer}>
                    <Text style={styles.title}>Frequent Payment Detected</Text>
                    <Text style={styles.subtitle}>
                        You have <Text style={styles.bold}>{count}</Text> similar transactions.
                    </Text>
                </View>
                <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
            </View>

            {/* Example Box */}
            <View style={styles.exampleBox}>
                <Text style={styles.exampleLabel}>EXAMPLE:</Text>
                {sampleTx ? (
                    <Text style={styles.exampleText}>
                        <Text style={styles.bold}>{sampleTx.action || 'PAYMENT'}</Text>{" "}
                        <Text style={styles.bold}>Ksh {fmt(sampleTx.amount)}</Text>{" "}
                        <Text style={styles.bold}>{sampleTx.sender || 'You'}</Text> to{" "}
                        <Text style={styles.bold}>{payeeName}</Text> on{" "}
                        <Text style={styles.bold}>{sampleTx.date}</Text>{" "}
                        <Text style={styles.bold}>{sampleTx.time}</Text>
                    </Text>
                ) : (
                    <Text style={styles.exampleText}>
                        Payee: <Text style={styles.bold}>{payeeName}</Text>
                        {"\n"}(Multiple matches found)
                    </Text>
                )}
            </View>

            <View style={styles.actionRow}>
                <Pressable
                    style={({ pressed }) => [
                        styles.pickerBtn, 
                        pressed && { backgroundColor: '#F5F5F5' }
                    ]} 
                    onPress={onSelectCategory}
                    disabled={isUpdating}
                >
                    <Text style={styles.pickerText}>
                        {selectedCategoryName || "Select Category..."}
                    </Text>
                    <Text style={styles.chevron}>▼</Text>
                </Pressable>

                {selectedCategoryName && (
                    <Pressable 
                        style={({ pressed }) => [
                            styles.confirmBtn, 
                            isUpdating && styles.disabledBtn,
                            pressed && { opacity: 0.8 }
                        ]} 
                        onPress={onConfirm}
                        disabled={isUpdating}
                    >
                        {isUpdating ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.confirmText}>Fix All</Text>
                        )}
                    </Pressable>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#E3F2FD', // Light Blue
        marginHorizontal: 20,
        marginBottom: 16,
        padding: 16,
        borderRadius: 16,
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
        marginBottom: 8,
    },
    icon: {
        fontSize: 24,
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1565C0',
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 14,
        color: '#333',
    },
    bold: {
        fontWeight: 'bold',
        color: '#000',
    },
    exampleBox: {
        backgroundColor: '#FFF',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#2196F3',
    },
    exampleLabel: {
        fontSize: 10,
        color: '#999',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    exampleText: {
        fontSize: 13,
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
        fontSize: 18,
        color: '#999',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        height: 48, // Fixed height for touch consistency
    },
    pickerBtn: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#BBDEFB',
        paddingHorizontal: 12,
    },
    pickerText: {
        fontSize: 14,
        color: '#333',
    },
    chevron: {
        fontSize: 12,
        color: '#999',
    },
    confirmBtn: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 24,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    disabledBtn: {
        backgroundColor: '#90CAF9',
    },
    confirmText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
