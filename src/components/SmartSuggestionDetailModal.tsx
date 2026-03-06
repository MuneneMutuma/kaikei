import React, { useState, useRef, useEffect } from 'react';
import {
    ActivityIndicator, Alert,
    View, Text, TouchableOpacity, StyleSheet, Pressable
} from 'react-native';
import { FlatList } from 'react-native';
import { SwipeableSheet, SwipeableSheetRef } from './common/SwipeableSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Expense, Category } from '../services/ledger/Schema';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Check, X, ChevronDown } from 'lucide-react-native';

interface SmartSuggestionDetailModalProps {
    visible: boolean;
    onClose: () => void;
    recipientName: string;
    transactions: Expense[];
    categories: Category[];
    onConfirmBatch: (categoryId: string, selectedIds: string[]) => Promise<void>;
}

export const SmartSuggestionDetailModal = ({
    visible,
    onClose,
    recipientName,
    transactions,
    categories,
    onConfirmBatch
}: SmartSuggestionDetailModalProps) => {
    const insets = useSafeAreaInsets();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [isCategoryPickerVisible, setIsCategoryPickerVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const sheetRef = useRef<SwipeableSheetRef>(null);
    const catSheetRef = useRef<SwipeableSheetRef>(null);

    React.useEffect(() => {
        if (visible) {
            sheetRef.current?.present();
            setSelectedIds(new Set(transactions.map(t => t.id)));
        } else {
            sheetRef.current?.dismiss();
        }
    }, [visible, transactions]);

    React.useEffect(() => {
        if (isCategoryPickerVisible) {
            catSheetRef.current?.present();
        } else {
            catSheetRef.current?.dismiss();
        }
    }, [isCategoryPickerVisible]);

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleConfirm = async () => {
        if (!selectedCategoryId) {
            Alert.alert("Select Category", "Please pick a category first.");
            return;
        }
        if (selectedIds.size === 0) {
            Alert.alert("Select Transactions", "Please select at least one transaction.");
            return;
        }

        setLoading(true);
        try {
            await onConfirmBatch(selectedCategoryId, Array.from(selectedIds));
            onClose();
        } catch (e) {
            Alert.alert("Error", "Failed to update transactions.");
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: Expense }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                style={[styles.itemCard, isSelected && styles.itemSelected]}
                onPress={() => toggleSelection(item.id)}
                activeOpacity={0.7}
            >
                <View style={[styles.checkbox, isSelected ? styles.checked : styles.unchecked]}>
                    {isSelected && <Check size={12} color="white" />}
                </View>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.amount, { color: item.type === 'income' ? colors.success : colors.text }]}>
                            {item.type === 'income' ? '+' : ''} Ksh {item.amount.toLocaleString()}
                        </Text>
                        <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.participant} numberOfLines={1}>
                        {item.description}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    // Calculate safe bottom padding (min 20)
    const paddingBottom = Math.max(insets.bottom, 20);

    return (
        <>
            <SwipeableSheet
                ref={sheetRef}
                title={`Review: ${recipientName}`}
                snapPoints={['85%', '95%']}
                onDismiss={onClose}
            >
                <View style={{ flex: 1 }}>
                    <Text style={styles.subtitle}>{transactions.length} transactions found</Text>

                    <FlatList
                        data={transactions}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        initialNumToRender={10}
                        style={{ flex: 1 }}
                    />

                    {/* INTERACTION ZONE */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.pickerBtn}
                            onPress={() => setIsCategoryPickerVisible(true)}
                        >
                            <Text style={styles.pickerText}>
                                {categories.find(c => c.id === selectedCategoryId)?.name || "Select Category..."}
                            </Text>
                            <ChevronDown size={20} color={colors.textSecondary} />
                        </TouchableOpacity>

                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={onClose}
                                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.confirmBtn, (!selectedCategoryId || selectedIds.size === 0) && styles.disabledBtn]}
                                onPress={handleConfirm}
                                disabled={loading || !selectedCategoryId || selectedIds.size === 0}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.confirmText}>Categorize ({selectedIds.size})</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </SwipeableSheet>

            {/* Category Picker Sheet */}
            <SwipeableSheet
                ref={catSheetRef}
                title="Select Category"
                snapPoints={['50%', '80%']}
                onDismiss={() => setIsCategoryPickerVisible(false)}
            >
                <FlatList
                    data={categories}
                    keyExtractor={(item: Category) => item.id}
                    renderItem={({ item }: { item: Category }) => (
                        <Pressable
                            style={styles.catItem}
                            onPress={() => {
                                setSelectedCategoryId(item.id);
                                setIsCategoryPickerVisible(false);
                            }}
                        >
                            <View style={[styles.catIcon, { backgroundColor: colors.primary + '20' }]}>
                                <Text style={{ fontSize: 16 }}>🏷️</Text>
                            </View>
                            <Text style={styles.catText}>{item.name}</Text>
                        </Pressable>
                    )}
                    contentContainerStyle={{ paddingBottom: paddingBottom }}
                />
            </SwipeableSheet>
        </>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', overflow: 'hidden' },
    header: { padding: 20, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, alignItems: 'center', zIndex: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    handle: { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, marginBottom: 15 },
    title: { ...typography.header, fontSize: 18, color: colors.text },
    subtitle: { ...typography.caption, marginTop: 4 },

    list: { padding: 20 },
    itemCard: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
        // Subtle shadow
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 1
    },
    itemSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary + '08' // 5% opacity green
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        marginRight: 16,
        alignItems: 'center',
        justifyContent: 'center'
    },
    checked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary
    },
    unchecked: {},
    amount: { ...typography.body, fontWeight: '700', fontSize: 16 },
    date: { ...typography.caption, fontSize: 12 },
    participant: { ...typography.body, color: colors.textSecondary, marginTop: 2, fontSize: 13 },

    footer: {
        padding: 20,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderColor: colors.border,
        zIndex: 99,
        // Shadow for the footer (to separate from list)
        shadowColor: 'black',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 10
    },
    pickerBtn: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        backgroundColor: colors.background,
        marginBottom: 20
    },
    pickerText: { ...typography.body, fontSize: 16, color: colors.text },

    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
    },
    confirmBtn: {
        flex: 1,
        backgroundColor: colors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    },
    disabledBtn: { backgroundColor: '#E0E0E0', shadowOpacity: 0 },
    confirmText: { ...typography.body, color: 'white', fontWeight: 'bold' },
    cancelBtn: { alignItems: 'center', padding: 10 },
    cancelText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },

    // Picker specific
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    pickerContainer: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, maxHeight: '60%', elevation: 5 },
    pickerTitle: { ...typography.header, fontSize: 18, marginBottom: 20, textAlign: 'center' },
    catItem: { padding: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border },
    catIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    catText: { ...typography.body, fontSize: 16 },
    closePickerBtn: { marginTop: 15, alignItems: 'center', padding: 10 }
});
