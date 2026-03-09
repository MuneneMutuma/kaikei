import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { Category } from '../services/ledger/Schema';
import { X, Plus, ChevronLeft } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryHelpers';
import { SwipeableSheet, SwipeableSheetRef } from '../components/common/SwipeableSheet';

type BudgetSetupScreenRouteProp = RouteProp<RootStackParamList, 'BudgetSetup'>;
type BudgetSetupNavigationProp = NativeStackNavigationProp<RootStackParamList, 'BudgetSetup'>;

export const BudgetSetupScreen: React.FC = () => {
    const navigation = useNavigation<BudgetSetupNavigationProp>();
    const route = useRoute<BudgetSetupScreenRouteProp>();
    const { currentMonth, initialCategoryId, initialLimitAmount, initialBudgetLineId } = route.params;

    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategoryId || null);
    const [limitAmount, setLimitAmount] = useState<string>(initialLimitAmount?.toString() || '');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [cycleType, setCycleType] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

    const expenseRepo = new ExpenseRepository();
    const budgetRepo = new BudgetRepository();
    const categoryPickerRef = useRef<SwipeableSheetRef>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const allCats = await expenseRepo.getAllCategories();
            setCategories(allCats.filter(c => c.name !== 'Other'));

            const suggested = await budgetRepo.suggestBudgetLimits(currentMonth);
            setSuggestions(suggested);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!initialBudgetLineId) return;

        Alert.alert(
            "Delete Budget",
            "Are you sure? This will remove the budget limit and all itemized breakdowns.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await budgetRepo.deleteBudgetLine(initialBudgetLineId);
                            navigation.goBack();
                        } catch (e) {
                            console.error("Failed to delete budget", e);
                            Alert.alert("Error", "Could not delete budget entry.");
                        }
                    }
                }
            ]
        );
    };

    const handleSave = async () => {
        if (!limitAmount) return;
        const amount = parseFloat(limitAmount);
        if (isNaN(amount) || amount <= 0) return;

        let finalCategoryId = selectedCategory;

        try {
            if (isCreatingCategory && newCategoryName.trim() !== '') {
                const newCat = await expenseRepo.addCategory(newCategoryName.trim());
                if (newCat && newCat.id) {
                    finalCategoryId = newCat.id;
                }
            }

            if (!finalCategoryId) return;

            const budget = await budgetRepo.getOrCreateBudget(currentMonth, cycleType);
            await budgetRepo.upsertBudgetLine(budget.id, finalCategoryId, amount);

            navigation.goBack();
        } catch (e) {
            console.error("Failed to save budget", e);
            Alert.alert("Error", "Could not save budget.");
        }
    };

    const getSelectedName = () => {
        return categories.find(c => c.id === selectedCategory)?.name || 'Select Category';
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
                <Text style={styles.headerTitle}>{initialBudgetLineId ? 'Edit Budget' : 'Set Budget'}</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
                    <View style={styles.mainRow}>
                        <View style={[styles.iconBox, { backgroundColor: getCategoryColor(getSelectedName()) + '15' }]}>
                            {(() => {
                                const IconComp = getCategoryIcon(getSelectedName());
                                return <IconComp size={24} color={getCategoryColor(getSelectedName())} />;
                            })()}
                        </View>
                        <View style={styles.titleContainer}>
                            <Text style={styles.labelSmall}>Budget Limit</Text>
                            <Text style={styles.categoryNameSub}>{getSelectedName()}</Text>
                        </View>
                        <View style={styles.amountInputContainer}>
                            <Text style={styles.currencyLabelSmall}>KES</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={limitAmount}
                                onChangeText={setLimitAmount}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#94A3B8"
                                autoFocus={!initialCategoryId}
                            />
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.cycleContainer}>
                        <Text style={styles.label}>Budget Cycle</Text>
                        <View style={styles.chipRow}>
                            {(['daily', 'weekly', 'monthly'] as const).map((type) => (
                                <Pressable
                                    key={type}
                                    style={[styles.cycleChip, cycleType === type && styles.cycleChipActive]}
                                    onPress={() => setCycleType(type)}
                                >
                                    <Text style={[styles.cycleChipText, cycleType === type && styles.cycleChipTextActive]}>
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {suggestions.length > 0 && (
                        <View style={styles.suggestionsContainer}>
                            <Text style={styles.label}>Suggested Limits</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionScroll}>
                                {suggestions.map(sug => (
                                    <Pressable
                                        key={`sug-${sug.categoryId}`}
                                        style={[styles.suggestionChip, limitAmount === sug.suggestedLimit.toString() && styles.suggestionChipActive]}
                                        onPress={() => setLimitAmount(sug.suggestedLimit.toString())}
                                    >
                                        <Text style={[styles.suggestionText, limitAmount === sug.suggestedLimit.toString() && styles.suggestionTextActive]}>
                                            {sug.suggestedLimit.toLocaleString()}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    <Pressable
                        style={styles.categoryTrigger}
                        onPress={() => categoryPickerRef.current?.present()}
                    >
                        <View style={styles.actionRow}>
                            <Text style={styles.actionLabel}>Category</Text>
                            <View style={styles.rowValueGroup}>
                                <View style={[styles.categoryPill, { backgroundColor: getCategoryColor(getSelectedName()) + '10' }]}>
                                    <Text style={[styles.categoryPillText, { color: getCategoryColor(getSelectedName()) }]}>{getSelectedName()}</Text>
                                </View>
                                <Plus size={16} color={colors.textSecondary} />
                            </View>
                        </View>
                    </Pressable>

                    {isCreatingCategory && (
                        <View style={styles.newCategoryCard}>
                            <View style={styles.newCategoryHeader}>
                                <Text style={styles.newCategoryTitle}>New Category Name</Text>
                                <Pressable onPress={() => setIsCreatingCategory(false)} hitSlop={10}>
                                    <X size={18} color={colors.textSecondary} />
                                </Pressable>
                            </View>
                            <TextInput
                                style={styles.searchInput}
                                value={newCategoryName}
                                onChangeText={setNewCategoryName}
                                placeholder="e.g. Subscriptions"
                                placeholderTextColor="#94A3B8"
                                autoFocus
                            />
                        </View>
                    )}
                </ScrollView>
            )}

            <View style={styles.footer}>
                {initialBudgetLineId ? (
                    <Pressable style={[styles.btn, styles.btnDelete]} onPress={handleDelete}>
                        <Text style={styles.btnDeleteText}>Delete</Text>
                    </Pressable>
                ) : (
                    <Pressable style={[styles.btn, styles.btnCancel]} onPress={() => navigation.goBack()}>
                        <Text style={styles.btnCancelText}>Cancel</Text>
                    </Pressable>
                )}

                <Pressable
                    style={[
                        styles.btn,
                        styles.btnSave,
                        ((!selectedCategory && !isCreatingCategory) || (isCreatingCategory && !newCategoryName.trim()) || !limitAmount) && styles.btnDisabled
                    ]}
                    onPress={handleSave}
                    disabled={(!selectedCategory && !isCreatingCategory) || (isCreatingCategory && !newCategoryName.trim()) || !limitAmount}
                >
                    <Text style={styles.btnSaveText}>{initialBudgetLineId ? 'Update Budget' : 'Save Budget'}</Text>
                </Pressable>
            </View>

            <SwipeableSheet
                ref={categoryPickerRef}
                title="Choose Category"
                snapPoints={['70%']}
            >
                <ScrollView contentContainerStyle={styles.gridContainer}>
                    {categories.map(cat => {
                        const Icon = getCategoryIcon(cat.name);
                        const color = getCategoryColor(cat.name);
                        return (
                            <Pressable
                                key={cat.id}
                                style={[styles.gridItem, selectedCategory === cat.id && { backgroundColor: color + '10', borderColor: color }]}
                                onPress={() => {
                                    setIsCreatingCategory(false);
                                    setSelectedCategory(cat.id);
                                    categoryPickerRef.current?.dismiss();
                                }}
                            >
                                <View style={[styles.gridIcon, { backgroundColor: color + '15' }]}>
                                    <Icon size={24} color={color} />
                                </View>
                                <Text style={[styles.gridText, selectedCategory === cat.id && { color: color, fontWeight: '700' }]}>{cat.name}</Text>
                            </Pressable>
                        );
                    })}

                    <Pressable
                        style={[styles.gridItem, { borderStyle: 'dashed' }]}
                        onPress={() => {
                            setSelectedCategory(null);
                            setIsCreatingCategory(true);
                            categoryPickerRef.current?.dismiss();
                        }}
                    >
                        <View style={[styles.gridIcon, { backgroundColor: '#F8FAFC' }]}>
                            <Plus size={24} color={colors.primary} />
                        </View>
                        <Text style={[styles.gridText, { color: colors.primary, fontWeight: '700' }]}>New Category</Text>
                    </Pressable>
                </ScrollView>
            </SwipeableSheet>
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
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    body: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    titleContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    labelSmall: {
        fontSize: 11,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    categoryNameSub: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    amountInputContainer: {
        alignItems: 'flex-end',
    },
    currencyLabelSmall: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    amountInput: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.text,
        textAlign: 'right',
        minWidth: 80,
        padding: 0,
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 12,
    },
    label: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '700',
        marginBottom: 8,
    },
    cycleContainer: {
        marginBottom: 8,
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
    },
    cycleChip: {
        flex: 1,
        paddingVertical: 10,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    cycleChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    cycleChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    cycleChipTextActive: {
        color: '#0d1b12',
    },
    suggestionsContainer: {
        marginBottom: 8,
        paddingBottom: 20,
    },
    suggestionScroll: {
        flexDirection: 'row',
    },
    suggestionChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    suggestionChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    suggestionText: {
        color: colors.text,
        fontWeight: '600',
        fontSize: 13,
    },
    suggestionTextActive: {
        color: '#0d1b12',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    actionLabel: {
        fontSize: 16,
        color: colors.text,
        flex: 1,
        fontWeight: '600',
    },
    categoryTrigger: {
        marginTop: 8,
    },
    rowValueGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    categoryPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    categoryPillText: {
        fontSize: 14,
        fontWeight: '600',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingVertical: 12,
        paddingBottom: 40,
    },
    gridItem: {
        width: '33.33%',
        alignItems: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    gridIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    gridText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
        textAlign: 'center',
    },
    newCategoryCard: {
        marginVertical: 12,
        backgroundColor: '#F8FAFC',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    newCategoryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    newCategoryTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    searchInput: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        height: 48,
        paddingHorizontal: 16,
        fontSize: 15,
        color: colors.text,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        backgroundColor: colors.surface,
    },
    btn: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 16,
    },
    btnCancel: {
        backgroundColor: '#F1F5F9',
    },
    btnCancelText: {
        color: colors.textSecondary,
        fontWeight: '700',
        fontSize: 15,
    },
    btnSave: {
        backgroundColor: colors.primary,
    },
    btnSaveText: {
        color: '#0d1b12',
        fontWeight: 'bold',
        fontSize: 16,
    },
    btnDelete: {
        backgroundColor: '#FEE2E2',
    },
    btnDeleteText: {
        color: colors.danger,
        fontWeight: '700',
        fontSize: 15,
    },
    btnDisabled: {
        opacity: 0.5,
        backgroundColor: '#E2E8F0',
    }
});
