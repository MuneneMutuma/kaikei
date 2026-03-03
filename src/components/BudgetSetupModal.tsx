import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { Category } from '../services/ledger/Schema';
import { X, Plus, Search, Check, AlertCircle, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

interface BudgetSetupModalProps {
    visible: boolean;
    onClose: () => void;
    onBudgetAdded: () => void;
    currentMonth: string; // "YYYY-MM"
    initialCategoryId?: string;
    initialLimitAmount?: number;
    initialBudgetLineId?: string; // Add this to know which budget line we are editing
}

export const BudgetSetupModal: React.FC<BudgetSetupModalProps> = ({
    visible, onClose, onBudgetAdded, currentMonth, initialCategoryId, initialLimitAmount, initialBudgetLineId
}) => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [limitAmount, setLimitAmount] = useState<string>('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // New Category State
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Breakdown State
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [breakdowns, setBreakdowns] = useState<{ id: string, name: string, amount: string }[]>([]);

    // Budget Cycle State
    const [cycleType, setCycleType] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

    const expenseRepo = new ExpenseRepository();
    const budgetRepo = new BudgetRepository();

    useEffect(() => {
        if (visible) {
            loadData();
            if (initialCategoryId) setSelectedCategory(initialCategoryId);
            if (initialLimitAmount) setLimitAmount(initialLimitAmount.toString());

            // Load existing breakdowns if editing
            if (initialBudgetLineId) {
                loadExistingBreakdowns(initialBudgetLineId);
            }
        } else {
            // Reset
            setSelectedCategory(null);
            setLimitAmount('');
            setIsCreatingCategory(false);
            setNewCategoryName('');
            setShowBreakdown(false);
            setBreakdowns([]);
        }
    }, [visible, initialCategoryId, initialLimitAmount, initialBudgetLineId]);

    const loadExistingBreakdowns = async (lineId: string) => {
        try {
            const existing = await budgetRepo.getBudgetBreakdowns(lineId);
            if (existing && existing.length > 0) {
                setShowBreakdown(true);
                setBreakdowns(existing.map(b => ({
                    id: b.id,
                    name: b.itemName,
                    amount: b.plannedAmount.toString()
                })));
            }
        } catch (e) {
            console.error("Failed to load breakdowns", e);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const allCats = await expenseRepo.getAllCategories();
            setCategories(allCats.filter(c => c.name !== 'Other')); // Ignore 'Other'

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
                            onBudgetAdded();
                            onClose();
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
            // Handle new category creation
            if (isCreatingCategory && newCategoryName.trim() !== '') {
                const newCat = await expenseRepo.addCategory(newCategoryName.trim());
                if (newCat && newCat.id) {
                    finalCategoryId = newCat.id;
                }
            }

            if (!finalCategoryId) return; // Still no category selected or created

            // For now, month navigation is tied to monthly budgets. 
            // Weekly/Daily budgets will still be grouped under the "Month" bucket for the MVP dashboard.
            const budget = await budgetRepo.getOrCreateBudget(currentMonth, cycleType);
            const budgetLine = await budgetRepo.upsertBudgetLine(budget.id, finalCategoryId, amount);

            // Save Breakdowns
            if (showBreakdown && breakdowns.length > 0) {
                const breakdownItems = [];
                for (const b of breakdowns) {
                    if (b.name.trim() !== '' && !isNaN(parseFloat(b.amount)) && parseFloat(b.amount) > 0) {
                        const tag = await budgetRepo.getOrCreateTag(finalCategoryId, b.name.trim());
                        breakdownItems.push({
                            tagId: tag.id,
                            plannedAmount: parseFloat(b.amount)
                        });
                    }
                }
                await budgetRepo.saveBudgetBreakdowns(budgetLine.id, breakdownItems);
            } else if (!showBreakdown && initialBudgetLineId) {
                // If they unchecked it, clear existing ones
                await budgetRepo.saveBudgetBreakdowns(initialBudgetLineId, []);
            }

            onBudgetAdded();
            onClose();
        } catch (e) {
            console.error("Failed to save budget loop", e);
        }
    };

    const handleSuggestionTap = (catId: string, amount: number) => {
        setIsCreatingCategory(false);
        setSelectedCategory(catId);
        setLimitAmount(amount.toString());
    };

    const handleSelectCategory = (catId: string) => {
        setIsCreatingCategory(false);
        setSelectedCategory(catId);
    };

    const handleSelectAddNew = () => {
        setSelectedCategory(null);
        setIsCreatingCategory(true);
    };

    const getSelectedName = () => {
        return categories.find(c => c.id === selectedCategory)?.name || 'Select Category';
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalOverlay}
            >
                <View style={[styles.modalContent, { paddingHorizontal: 0 }]}>
                    <View style={styles.handle} />

                    <View style={[styles.header, { paddingHorizontal: 20 }]}>
                        <Text style={styles.headerTitle}>
                            {initialCategoryId ? 'Edit Budget' : 'Set Budget'}
                        </Text>
                        <Pressable onPress={onClose} style={styles.closeBtn}>
                            <X color={colors.textSecondary} size={20} />
                        </Pressable>
                    </View>

                    {loading ? (
                        <ActivityIndicator style={{ padding: 40 }} size="small" color={colors.primary} />
                    ) : (
                        <ScrollView style={[styles.scrollBody, { paddingHorizontal: 20 }]} keyboardShouldPersistTaps="handled">

                            {/* Main Setup Row (Icon + Amount) */}
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

                            {/* Cycle Selection */}
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

                            {/* Autopilot Suggestions - Simplified to pure numbers */}
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

                            {/* Category Selection Action Row */}
                            <Pressable
                                style={styles.actionRow}
                                onPress={() => {
                                    if (isCreatingCategory) setIsCreatingCategory(false);
                                }}
                            >
                                <Text style={styles.actionLabel}>Category</Text>
                                <Pressable
                                    style={styles.inlineActionBtn}
                                    onPress={() => { setIsCreatingCategory(true); setSelectedCategory(null); }}
                                >
                                    <Plus size={14} color={colors.primaryDark} />
                                    <Text style={styles.inlineActionText}>New</Text>
                                </Pressable>
                            </Pressable>

                            {isCreatingCategory ? (
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
                            ) : (
                                <View style={styles.pickerContainer}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
                                        {categories
                                            .map(cat => {
                                                const isActive = selectedCategory === cat.id;
                                                const CIcon = getCategoryIcon(cat.name);
                                                const cColor = getCategoryColor(cat.name);
                                                return (
                                                    <Pressable
                                                        key={cat.id}
                                                        style={[styles.catChip, isActive && { backgroundColor: `${cColor}20`, borderColor: cColor }]}
                                                        onPress={() => setSelectedCategory(cat.id)}
                                                    >
                                                        <CIcon size={14} color={isActive ? cColor : colors.textSecondary} />
                                                        <Text style={[styles.catChipText, isActive && { color: cColor, fontWeight: '600' }]}>{cat.name}</Text>
                                                    </Pressable>
                                                );
                                            })}
                                    </ScrollView>
                                </View>
                            )}

                            <View style={styles.divider} />

                            {/* Breakdown Setup - Row Style Toggler */}
                            <View style={styles.actionRow}>
                                <Text style={styles.actionLabel}>Itemized Details</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {breakdowns.length > 0 && (
                                        <View style={[styles.inlineBadge, styles.bgSuccess]}>
                                            <Check size={10} color={colors.success} />
                                            <Text style={[styles.badgeText, { color: colors.success }]}>
                                                {breakdowns.length} Items
                                            </Text>
                                        </View>
                                    )}
                                    <Pressable
                                        onPress={() => setShowBreakdown(!showBreakdown)}
                                        style={styles.togglePressable}
                                        hitSlop={12}
                                    >
                                        {showBreakdown ? (
                                            <ChevronUp size={20} color={colors.textSecondary} />
                                        ) : (
                                            <Plus size={20} color={colors.textSecondary} />
                                        )}
                                    </Pressable>
                                </View>
                            </View>

                            {showBreakdown && (
                                <View style={styles.breakdownList}>
                                    {breakdowns.map((item, index) => (
                                        <View key={item.id} style={styles.breakdownItemRow}>
                                            <View style={styles.breakdownInputs}>
                                                <TextInput
                                                    style={styles.breakdownNameInput}
                                                    placeholder="Detail (e.g. Bread)"
                                                    placeholderTextColor="#94A3B8"
                                                    value={item.name}
                                                    onChangeText={(text) => {
                                                        const updated = [...breakdowns];
                                                        updated[index].name = text;
                                                        setBreakdowns(updated);
                                                    }}
                                                />
                                                <TextInput
                                                    style={styles.breakdownAmountInput}
                                                    placeholder="Amount"
                                                    placeholderTextColor="#94A3B8"
                                                    keyboardType="numeric"
                                                    value={item.amount}
                                                    onChangeText={(text) => {
                                                        const updated = [...breakdowns];
                                                        updated[index].amount = text;
                                                        setBreakdowns(updated);
                                                    }}
                                                />
                                            </View>
                                            <Pressable onPress={() => {
                                                setBreakdowns(breakdowns.filter(b => b.id !== item.id));
                                            }} style={styles.breakdownDeleteBtn}>
                                                <X size={16} color={colors.textSecondary} />
                                            </Pressable>
                                        </View>
                                    ))}

                                    {(() => {
                                        const brkTotal = breakdowns.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
                                        const mainTotal = parseFloat(limitAmount) || 0;
                                        const isFullyAllocated = brkTotal >= mainTotal && mainTotal > 0;

                                        return (
                                            <Pressable
                                                onPress={() => setBreakdowns([...breakdowns, { id: Date.now().toString(), name: '', amount: '' }])}
                                                style={[styles.addAnotherBtn, isFullyAllocated && { opacity: 0.5 }]}
                                                disabled={isFullyAllocated}
                                            >
                                                <Plus size={14} color={isFullyAllocated ? colors.textSecondary : colors.primaryDark} />
                                                <Text style={[styles.addAnotherText, isFullyAllocated && { color: colors.textSecondary }]}>
                                                    {isFullyAllocated ? 'Fully Allocated' : 'Add another item'}
                                                </Text>
                                            </Pressable>
                                        );
                                    })()}

                                    {/* Validation Logic Check */}
                                    {(() => {
                                        const brkTotal = breakdowns.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
                                        const mainTotal = parseFloat(limitAmount) || 0;
                                        if (brkTotal > mainTotal && mainTotal > 0) {
                                            return <View style={styles.validationNotice}>
                                                <AlertCircle size={14} color={colors.danger} style={{ marginRight: 6 }} />
                                                <Text style={[styles.validationText, { color: colors.danger }]}>
                                                    Over limit by {(brkTotal - mainTotal).toLocaleString()}
                                                </Text>
                                            </View>;
                                        }
                                        if (brkTotal > 0 && mainTotal > 0) {
                                            const remaining = mainTotal - brkTotal;
                                            return <View style={styles.validationNotice}>
                                                <Check size={14} color={colors.success} style={{ marginRight: 6 }} />
                                                <Text style={[styles.validationText, { color: colors.success }]}>
                                                    {brkTotal.toLocaleString()} planned. {remaining > 0 ? `${remaining.toLocaleString()} unallocated.` : 'Fully allocated.'}
                                                </Text>
                                            </View>;
                                        }
                                        return null;
                                    })()}
                                </View>
                            )}

                        </ScrollView>
                    )}

                    <View style={[styles.footer, { paddingHorizontal: 20 }]}>
                        {initialBudgetLineId ? (
                            <Pressable style={[styles.btn, styles.btnDelete]} onPress={handleDelete}>
                                <Text style={styles.btnDeleteText}>Delete</Text>
                            </Pressable>
                        ) : (
                            <Pressable style={[styles.btn, styles.btnCancel]} onPress={onClose}>
                                <Text style={styles.btnCancelText}>Cancel</Text>
                            </Pressable>
                        )}

                        {(() => {
                            const brkTotal = breakdowns.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
                            const mainTotal = parseFloat(limitAmount) || 0;
                            const isOverLimit = showBreakdown && brkTotal > mainTotal && mainTotal > 0;
                            const isMissingBase = (!selectedCategory && !isCreatingCategory) || (isCreatingCategory && !newCategoryName.trim()) || !limitAmount;
                            const isDisabled = isMissingBase || isOverLimit;

                            return (
                                <Pressable
                                    style={[
                                        styles.btn,
                                        styles.btnSave,
                                        isDisabled && styles.btnDisabled
                                    ]}
                                    onPress={handleSave}
                                    disabled={!!isDisabled}
                                >
                                    <Text style={styles.btnSaveText}>{initialBudgetLineId ? 'Update Budget' : 'Save Budget'}</Text>
                                </Pressable>
                            );
                        })()}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        maxHeight: '90%',
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollBody: {
        marginBottom: 10,
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
    actionIcon: {
        width: 32,
        alignItems: 'center',
        marginRight: 8,
    },
    actionLabel: {
        fontSize: 16,
        color: colors.text,
        flex: 1,
        fontWeight: '600',
    },
    inlineActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: `${colors.primary}15`,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    inlineActionText: {
        color: colors.primaryDark,
        fontWeight: '700',
        fontSize: 12,
        marginLeft: 4,
    },
    inlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        gap: 4,
    },
    bgSuccess: { backgroundColor: '#DCFCE7' },
    badgeText: { fontSize: 10, fontWeight: '700' },
    togglePressable: {
        padding: 4,
    },
    pickerContainer: {
        marginVertical: 4,
    },
    chipList: {
        gap: 8,
        paddingRight: 20,
    },
    catChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    catChipText: {
        fontSize: 13,
        color: colors.textSecondary,
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
    breakdownList: {
        marginBottom: 20,
    },
    breakdownItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 10,
    },
    breakdownInputs: {
        flex: 1,
        flexDirection: 'row',
        gap: 8,
    },
    breakdownNameInput: {
        flex: 2,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    breakdownAmountInput: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        textAlign: 'right',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    breakdownDeleteBtn: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#FEE2E2',
    },
    addAnotherBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
    },
    addAnotherText: {
        color: colors.primaryDark,
        fontWeight: '700',
        fontSize: 13,
        marginLeft: 6,
    },
    validationNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    validationText: {
        fontSize: 12,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 16,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
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
