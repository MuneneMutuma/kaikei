import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { CategoryTag } from '../services/ledger/Schema';
import { ChevronLeft } from 'lucide-react-native';

type AddBudgetItemScreenRouteProp = RouteProp<RootStackParamList, 'AddBudgetItem'>;
type AddBudgetItemNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddBudgetItem'>;

export const AddBudgetItemScreen: React.FC = () => {
    const navigation = useNavigation<AddBudgetItemNavigationProp>();
    const route = useRoute<AddBudgetItemScreenRouteProp>();
    const { budgetLineId, categoryId, isUnplanned, month } = route.params;

    const [newName, setNewName] = useState('');
    const [newAmount, setNewAmount] = useState(isUnplanned ? '0' : '');
    const [availableTags, setAvailableTags] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);

    const budgetRepo = new BudgetRepository();
    const expenseRepo = new ExpenseRepository();

    useEffect(() => {
        loadTags();
    }, []);

    const loadTags = async () => {
        setLoading(true);
        try {
            const tags = await budgetRepo.getCategoryTags(categoryId);
            setAvailableTags(tags);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!newName.trim() || !newAmount.trim()) return;
        const amount = parseFloat(newAmount);
        if (isNaN(amount)) return;

        setAdding(true);
        try {
            // 1. Ensure Tag exists
            let tag = availableTags.find(t => t.name.toLowerCase() === newName.trim().toLowerCase());
            let tagId = tag?.id;

            if (!tagId) {
                const newTag = await budgetRepo.getOrCreateTag(categoryId, newName.trim());
                tagId = newTag.id;
            }

            if (!tagId) throw new Error("Failed to create tag");

            // 2. Add Breakdown
            await budgetRepo.addBreakdownItem(
                budgetLineId,
                tagId,
                isUnplanned ? 0 : amount,
                isUnplanned ? amount : 0,
                isUnplanned
            );

            navigation.goBack();
        } catch (e) {
            console.error("Failed to add item", e);
            Alert.alert("Error", "Could not add budget item.");
        } finally {
            setAdding(false);
        }
    };

    const formatTagName = (name: string) => {
        return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.container}
        >
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.headerTitle}>{isUnplanned ? 'Log Unplanned' : 'Add Planned Item'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                <Text style={styles.subtitle}>
                    {isUnplanned
                        ? 'Log a purchase that was not in your original budget.'
                        : 'Enter the item name and estimated cost.'}
                </Text>

                {availableTags.length > 0 && (
                    <View style={styles.field}>
                        <Text style={styles.label}>Existing Options</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagPicker}>
                            {availableTags.map((tag) => (
                                <TouchableOpacity
                                    key={tag.id}
                                    style={[styles.tagChip, newName === tag.name && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                                    onPress={() => setNewName(tag.name)}
                                >
                                    <Text style={[styles.tagChipText, newName === tag.name && { color: colors.primary }]}>{formatTagName(tag.name)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={styles.field}>
                    <Text style={styles.label}>Item Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={isUnplanned ? "e.g. Pharmacy, Gift, Emergency" : "e.g. Groceries, Shoes, Bread"}
                        placeholderTextColor="#94A3B8"
                        value={newName}
                        onChangeText={setNewName}
                        autoFocus={!newName}
                        returnKeyType="next"
                    />
                </View>

                <View style={styles.field}>
                    <Text style={styles.label}>{isUnplanned ? 'Amount Spent' : 'Estimated Amount'}</Text>
                    <View style={styles.amountInputRow}>
                        <Text style={styles.currency}>KES</Text>
                        <TextInput
                            style={styles.amountInput}
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={newAmount}
                            onChangeText={setNewAmount}
                            returnKeyType="done"
                            onSubmitEditing={handleSave}
                        />
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={() => navigation.goBack()}
                    style={styles.cancelBtn}
                >
                    <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                    onPress={handleSave}
                    style={[
                        styles.saveBtn,
                        (!newName.trim() || !newAmount.trim()) && { opacity: 0.4 }
                    ]}
                    disabled={!newName.trim() || !newAmount.trim() || adding}
                >
                    {adding ? (
                        <ActivityIndicator size="small" color="#0d1b12" />
                    ) : (
                        <Text style={styles.saveText}>Add Item</Text>
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    body: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 32,
        lineHeight: 20,
    },
    field: {
        marginBottom: 24,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    input: {
        fontSize: 16,
        color: colors.text,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    amountInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
    },
    currency: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
        marginRight: 8,
    },
    amountInput: {
        flex: 1,
        fontSize: 22,
        fontWeight: '700',
        color: colors.text,
        paddingVertical: 14,
    },
    tagPicker: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 4,
    },
    tagChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#F1F5F9',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    tagChipText: {
        fontSize: 13,
        color: colors.text,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    saveBtn: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: colors.primary,
    },
    saveText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0d1b12',
    },
});
