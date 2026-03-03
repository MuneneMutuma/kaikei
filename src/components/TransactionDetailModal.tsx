import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, LayoutAnimation, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Expense, Category, BudgetBreakdown } from '../services/ledger/Schema';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Check, Trash2, Calendar, Clock, Tag, Save, AlertTriangle, ChevronRight, ChevronDown, Edit3, Briefcase, User, AlertCircle, Layers, Plus, X } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor } from '../screens/AnalyticsScreen';

interface TransactionDetailModalProps {
    visible: boolean;
    onClose: () => void;
    transaction: Expense | null;
    onUpdate: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ visible, onClose, transaction, onUpdate }) => {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(false);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [isBusiness, setIsBusiness] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [availableBreakdowns, setAvailableBreakdowns] = useState<(BudgetBreakdown & { itemName: string })[]>([]);
    const [availableTags, setAvailableTags] = useState<{ id: string, name: string }[]>([]);
    const [selectedBreakdownId, setSelectedBreakdownId] = useState<string | null>(null);
    const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
    const [budgetStats, setBudgetStats] = useState<{ limit: number, spent: number } | null>(null);

    // Dynamic Tag State
    const [tagModalVisible, setTagModalVisible] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [addingTag, setAddingTag] = useState(false);

    const tagInputRef = useRef<TextInput>(null);

    // Auto-focus keyboard when tag modal opens
    useEffect(() => {
        if (tagModalVisible) {
            const timer = setTimeout(() => {
                tagInputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [tagModalVisible]);

    const repo = useRef(new ExpenseRepository());
    const budgetRepo = useRef(new BudgetRepository());

    useEffect(() => {
        if (visible && transaction) {
            setDescription(transaction.description);
            setAmount(transaction.amount.toString());
            setCategoryId(transaction.categoryId);
            setIsBusiness(transaction.isBusiness || false);
            setSelectedTagId(transaction.tagId || null);
            setSelectedBreakdownId(transaction.budgetBreakdownId || null);
            loadCategories();
        }
    }, [visible, transaction]);

    useEffect(() => {
        if (categoryId) {
            fetchBreakdowns(categoryId);
        }
    }, [categoryId]);

    const fetchBreakdowns = async (catId: string) => {
        const month = transaction?.date ? transaction.date.slice(0, 7) : new Date().toISOString().slice(0, 7);
        try {
            // 1. Fetch Planned Breakdowns
            const data = await budgetRepo.current.getBudgetWithBreakdowns(catId, month, false);
            setBudgetStats(data ? { limit: data.line.limitAmount, spent: data.line.spentAmount || 0 } : null);
            setAvailableBreakdowns(data?.breakdowns || []);

            // 2. Fetch ALL Global Tags
            const allTags = await budgetRepo.current.getCategoryTags(catId);
            setAvailableTags(allTags);

            // Migration Fallback: If transaction has a breakdown but no tagId yet
            if (transaction?.budgetBreakdownId && !transaction.tagId) {
                const bb = data?.breakdowns.find((b: any) => b.id === transaction.budgetBreakdownId);
                if (bb) setSelectedTagId(bb.tagId);
            }
        } catch (e) {
            console.error("fetchBreakdowns failed", e);
            setBudgetStats(null);
            setAvailableBreakdowns([]);
            setAvailableTags([]);
        }
    };

    const loadCategories = async () => {
        const cats = await repo.current.getAllCategories(true); // topLevelOnly = true
        setCategories(cats);
    };

    const handleAddNewTag = async () => {
        if (!newTagName.trim() || !categoryId) return;
        setAddingTag(true);
        try {
            const newTag = await budgetRepo.current.getOrCreateTag(categoryId, newTagName.trim());

            // Refresh lists
            await fetchBreakdowns(categoryId);

            // Select it
            setSelectedTagId(newTag.id);
            // Link to breakdown if it exists
            const month = transaction?.date ? transaction.date.slice(0, 7) : new Date().toISOString().slice(0, 7);
            const data = await budgetRepo.current.getBudgetWithBreakdowns(categoryId, month, false);
            const matchingBreakdown = data?.breakdowns.find((b: any) => b.tagId === newTag.id);
            setSelectedBreakdownId(matchingBreakdown?.id || null);

            // Update description
            const cleanDesc = (description || '').replace(/\[.*\]/, '').trim();
            setDescription(`${cleanDesc} [${newTag.name}]`.trim());

            setTagModalVisible(false);
            setNewTagName("");
        } catch (e) {
            console.error("Failed to add tag", e);
            Alert.alert("Error", "Could not add custom tag.");
        } finally {
            setAddingTag(false);
        }
    };

    const handleSave = async () => {
        if (!transaction) return;
        setLoading(true);
        try {
            await repo.current.updateExpense(transaction.id, {
                description,
                amount: parseFloat(amount) || transaction.amount,
                categoryId,
                isVerified: true,
                isBusiness,
                budgetBreakdownId: selectedBreakdownId || undefined,
                tagId: selectedTagId || undefined
            });
            onUpdate();
            onClose();
        } catch (e) {
            Alert.alert("Error", "Failed to update.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!transaction) return;
        Alert.alert("Delete", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: 'destructive', onPress: async () => {
                    setLoading(true);
                    await repo.current.deleteExpense(transaction.id);
                    onUpdate();
                    onClose();
                }
            }
        ]);
    };

    const togglePicker = () => {
        // LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); // Optional animation
        setShowCategoryPicker(!showCategoryPicker);
    };

    if (!transaction) return null;

    // Helpers
    const selectedCategory = categories.find(c => c.id === categoryId) || { name: transaction.categoryName, id: transaction.categoryId };
    const DisplayIcon = getCategoryIcon(selectedCategory.name);
    const displayColor = getCategoryColor(selectedCategory.name);
    const isExpense = transaction.type === 'expense';
    const isEditable = transaction.source === 'voice' || transaction.source === 'manual';

    const dateObj = new Date(transaction.date);
    const dateStr = dateObj.toLocaleDateString([], { day: 'numeric', month: 'short' });
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSplit = !!transaction.parentId; // Simple check for now

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

                {/* 
                    PADDING BOTTOM LOGIC:
                    We want the container background to extend to the very bottom of the screen.
                    So we apply paddingBottom = insets.bottom + extra space to the container view itself.
                */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) + 10, backgroundColor: colors.surface }]}
                >
                    <View style={styles.handle} />

                    {/* Top Row: Icon | Input | Amount */}
                    <View style={styles.mainRow}>
                        <View style={[styles.iconBox, { backgroundColor: `${displayColor}15` }]}>
                            <DisplayIcon size={24} color={displayColor} />
                        </View>

                        <View style={styles.titleContainer}>
                            {isEditable ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <TextInput
                                        style={styles.titleInput}
                                        value={description}
                                        onChangeText={setDescription}
                                        placeholder="Description"
                                        placeholderTextColor={colors.textSecondary}
                                        multiline
                                    />
                                    <Edit3 size={16} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                                </View>
                            ) : (
                                <Text style={styles.titleText} numberOfLines={2}>
                                    {description.replace(/^(paid to|received from)\s+/i, '').trim()}
                                </Text>
                            )}

                            {/* Meta Row */}
                            <View style={styles.metaRow}>
                                <Text style={styles.metaText}>{dateStr} • {timeStr}</Text>
                                <Text style={styles.metaText}> • {transaction.source.toUpperCase()}</Text>
                            </View>
                        </View>

                        {isEditable ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TextInput
                                    style={[styles.amountInput, { color: isExpense ? colors.error : colors.success }]}
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="numeric"
                                    placeholder="0"
                                />
                                <Edit3 size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
                            </View>
                        ) : (
                            <Text style={[styles.amountText, { color: isExpense ? colors.error : colors.success }]}>
                                {parseFloat(amount || '0').toLocaleString()}
                            </Text>
                        )}
                    </View>

                    <View style={styles.divider} />

                    {/* Category Selector (Row style) */}
                    <TouchableOpacity style={styles.actionRow} onPress={togglePicker} activeOpacity={0.7}>
                        <View style={styles.actionIcon}>
                            <Tag size={20} color={colors.textSecondary} />
                        </View>
                        <Text style={styles.actionLabel}>Category</Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {/* Verified Badge */}
                            <View style={[styles.inlineBadge, transaction.isVerified ? styles.bgSuccess : styles.bgWarning]}>
                                {transaction.isVerified ? <Check size={10} color={colors.success} /> : <AlertTriangle size={10} color="#B45309" />}
                                <Text style={[styles.badgeText, { color: transaction.isVerified ? colors.success : '#B45309' }]}>
                                    {transaction.isVerified ? 'Verified' : 'Review'}
                                </Text>
                            </View>

                            <View style={[styles.categoryPill, { backgroundColor: `${displayColor}15` }]}>
                                <Text style={[styles.categoryPillText, { color: displayColor }]}>{selectedCategory.name || 'Uncategorized'}</Text>
                            </View>
                            {showCategoryPicker ? <ChevronDown size={16} color={colors.textSecondary} /> : <Edit3 size={16} color={colors.textSecondary} />}
                        </View>
                    </TouchableOpacity>

                    {/* Collapsible Category List */}
                    {showCategoryPicker && (
                        <View style={styles.pickerContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
                                {categories.map(cat => {
                                    const active = cat.id === categoryId;
                                    const CIcon = getCategoryIcon(cat.name);
                                    const cColor = getCategoryColor(cat.name);
                                    return (
                                        <TouchableOpacity
                                            key={cat.id}
                                            style={[styles.chip, active && { backgroundColor: `${cColor}20`, borderColor: cColor }]}
                                            onPress={() => {
                                                setCategoryId(cat.id);
                                                setShowCategoryPicker(false);
                                            }}
                                        >
                                            <CIcon size={14} color={active ? cColor : colors.textSecondary} />
                                            <Text style={[styles.chipText, active && { color: cColor, fontWeight: '600' }]}>{cat.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}

                    {/* Global Tagging Section */}
                    {(selectedCategory || categoryId) && (
                        <>
                            <View style={styles.actionRow}>
                                <View style={styles.actionIcon}>
                                    <Layers size={20} color={colors.textSecondary} />
                                </View>
                                <Text style={styles.actionLabel}>Transaction Tag</Text>
                            </View>

                            <View style={styles.pickerContainer}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
                                    {/* "None" Option */}
                                    <TouchableOpacity
                                        style={[styles.chip, !selectedTagId && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]}
                                        onPress={() => {
                                            const newDesc = (description || '').replace(/\[.*\]/, '').trim();
                                            setSelectedTagId(null);
                                            setSelectedBreakdownId(null);
                                            setDescription(newDesc);
                                        }}
                                    >
                                        <Text style={[styles.chipText, !selectedTagId && { color: colors.primary, fontWeight: '600' }]}>
                                            None
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Available Tags */}
                                    {availableTags.map(tag => {
                                        const active = tag.id === selectedTagId;
                                        const isPlanned = availableBreakdowns.some(b => b.tagId === tag.id);
                                        return (
                                            <TouchableOpacity
                                                key={tag.id}
                                                style={[styles.chip, active && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]}
                                                onPress={() => {
                                                    const newDesc = (description || '').replace(/\[.*\]/, '').trim();
                                                    setSelectedTagId(tag.id);
                                                    // Link to breakdown if planned
                                                    const brk = availableBreakdowns.find(b => b.tagId === tag.id);
                                                    setSelectedBreakdownId(brk?.id || null);
                                                    setDescription(`${newDesc} [${tag.name}]`.trim());
                                                }}
                                            >
                                                <Layers size={14} color={active ? colors.primary : colors.textSecondary} />
                                                <Text style={[styles.chipText, active && { color: colors.primary, fontWeight: '600' }]}>
                                                    {tag.name}
                                                    {isPlanned && " •"}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}

                                    {/* Add New Tag */}
                                    <TouchableOpacity
                                        style={[styles.chip, { borderStyle: 'dashed', borderColor: colors.primary }]}
                                        onPress={() => setTagModalVisible(true)}
                                    >
                                        <Plus size={14} color={colors.primary} />
                                        <Text style={[styles.chipText, { color: colors.primary, fontWeight: '700' }]}>
                                            New Tag
                                        </Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                            <View style={styles.divider} />
                        </>
                    )}



                    {/* Footer Actions - Equal Width */}
                    {/* Business/Personal Toggle */}
                    {/* Business/Personal Selector Cards */}
                    <View style={styles.selectorContainer}>
                        <TouchableOpacity
                            style={[styles.selectorCard, !isBusiness && styles.selectedCardPersonal]}
                            onPress={() => setIsBusiness(false)}
                            activeOpacity={0.8}
                        >
                            <User size={24} color={!isBusiness ? '#059669' : '#94A3B8'} />
                            <Text style={[styles.selectorText, !isBusiness && styles.selectedTextPersonal]}>Personal</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.selectorCard, isBusiness && styles.selectedCardBusiness]}
                            onPress={() => setIsBusiness(true)}
                            activeOpacity={0.8}
                        >
                            <Briefcase size={24} color={isBusiness ? '#0284C7' : '#94A3B8'} />
                            <Text style={[styles.selectorText, isBusiness && styles.selectedTextBusiness]}>Business</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.divider} />

                    {/* Footer Actions - Equal Width */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={[styles.btn, styles.btnDelete]} onPress={handleDelete}>
                            <Trash2 size={20} color={colors.error} />
                            <Text style={[styles.btnText, { color: colors.error }]}>Delete</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.btn,
                                styles.btnSave,
                            ]}
                            onPress={handleSave}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                            ) : (
                                (!transaction.isVerified && categoryId === transaction.categoryId) ? (
                                    <Check size={20} color="white" />
                                ) : (
                                    <Save size={20} color="white" />
                                )
                            )}
                            <Text style={[styles.btnText, { color: 'white' }]}>
                                {loading ? 'Saving...' : ((!transaction.isVerified && categoryId === transaction.categoryId) ? 'Verify' : 'Save')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>

            {/* Dynamic Tag Creation Modal */}
            <Modal
                visible={tagModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setTagModalVisible(false)}
            >
                <View style={styles.miniModalOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : undefined}
                        style={styles.miniModalContent}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Budget Bucket</Text>
                            <TouchableOpacity onPress={() => setTagModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <X size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            New tag for <Text style={{ fontWeight: 'bold' }}>{categories.find(c => c.id === categoryId)?.name || 'this category'}</Text>
                        </Text>

                        <View style={styles.inputWrapper}>
                            <Layers size={20} color={colors.primary} style={styles.inputIcon} />
                            <TextInput
                                ref={tagInputRef}
                                style={styles.textInput}
                                placeholder="Bucket name (e.g. Avocado, Fuel)"
                                placeholderTextColor={colors.textSecondary}
                                value={newTagName}
                                onChangeText={setNewTagName}
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => setTagModalVisible(false)}
                            >
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.createBtn, !newTagName.trim() && { backgroundColor: '#F1F5F9' }]}
                                onPress={handleAddNewTag}
                                disabled={addingTag || !newTagName.trim()}
                            >
                                {addingTag ? <ActivityIndicator size="small" color="#fff" /> : (
                                    <>
                                        <Text style={[styles.createBtnText, !newTagName.trim() && { color: colors.textSecondary }]}>Create</Text>
                                        <Check size={16} color={!newTagName.trim() ? colors.textSecondary : "#0d1b12"} style={{ marginLeft: 4 }} />
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    container: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        // paddingBottom handled via inline style
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
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
    titleText: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 4,
        lineHeight: 24,
    },
    titleInput: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 4,
        padding: 0,
        // Removed flex: 1 so it doesn't push the icon to the edge
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    metaText: {
        fontSize: 12, // Small and crisp
        color: colors.textSecondary,
    },
    inlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        gap: 4,
        marginLeft: 4,
    },
    bgSuccess: { backgroundColor: '#DCFCE7' },
    bgWarning: { backgroundColor: '#FEF3C7' },
    badgeText: { fontSize: 10, fontWeight: '700' },

    amountText: {
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    amountInput: {
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 8,
        minWidth: 80,
        textAlign: 'right',
        padding: 0,
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 12,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
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
    pickerContainer: {
        marginTop: 6,
        marginBottom: 6,
    },
    chipList: {
        gap: 8,
        paddingRight: 20,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    chipText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 8,
    },
    btn: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        gap: 8,
    },
    btnDelete: {
        backgroundColor: '#FEE2E2',
    },
    btnSave: {
        backgroundColor: colors.primary,
    },
    btnDisabled: {
        backgroundColor: '#CBD5E1',
    },
    requiredBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginRight: 16
    },
    requiredText: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.danger
    },

    // Selector Cards
    selectorContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    selectorCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0d1b12',
    },
    // Tag Modal Styles
    miniModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    miniModalContent: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        width: '100%',
        maxWidth: 340,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text
    },
    modalSubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        marginBottom: 16
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 10,
        paddingHorizontal: 12,
        marginBottom: 20
    },
    inputIcon: {
        marginRight: 8
    },
    textInput: {
        flex: 1,
        height: 44,
        fontSize: 15,
        color: colors.text
    },
    modalActions: {
        flexDirection: 'row',
        gap: 10
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: '#f1f5f9'
    },
    cancelBtnText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary
    },
    createBtn: {
        flex: 1.5,
        backgroundColor: colors.primary,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        flexDirection: 'row'
    },
    createBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0d1b12'
    },
    selectorText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#94A3B8',
    },
    selectedCardPersonal: {
        backgroundColor: '#ECFDF5',
        borderColor: '#10B981',
    },
    selectedTextPersonal: {
        color: '#059669',
    },
    selectedCardBusiness: {
        backgroundColor: '#E0F2FE',
        borderColor: '#0EA5E9',
    },
    selectedTextBusiness: {
        color: '#0284C7',
    },

    btnText: {
        fontWeight: 'bold',
        fontSize: 16,
    }
});
