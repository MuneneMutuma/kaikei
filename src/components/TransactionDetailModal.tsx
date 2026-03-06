import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, LayoutAnimation, Switch } from 'react-native';
import { SwipeableSheet, SwipeableSheetRef } from './common/SwipeableSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Expense, Category, BudgetBreakdown } from '../services/ledger/Schema';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { BudgetRepository } from '../services/ledger/BudgetRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Check, Trash2, Calendar, Clock, Tag, Save, AlertTriangle, ChevronRight, ChevronDown, Edit3, Briefcase, User, AlertCircle, Layers, Plus, X, Split, CheckCircle } from 'lucide-react-native';
import { getCategoryIcon, getCategoryColor, formatTagName } from '../utils/categoryHelpers';

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
    const [showTagSheet, setShowTagSheet] = useState(false);
    const [availableBreakdowns, setAvailableBreakdowns] = useState<BudgetBreakdown[]>([]);
    const [availableTags, setAvailableTags] = useState<{ id: string, name: string }[]>([]);
    const [selectedBreakdownId, setSelectedBreakdownId] = useState<string | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [budgetStats, setBudgetStats] = useState<{ limit: number, spent: number } | null>(null);

    // Split State
    const [isSplitMode, setIsSplitMode] = useState(false);
    const [splits, setSplits] = useState<{
        categoryId: string,
        categoryName: string,
        amount: string,
        tagId?: string,
        tagName?: string,
        budgetBreakdownId?: string
    }[]>([]);

    // Dynamic Tag State
    const [tagModalVisible, setTagModalVisible] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [addingTag, setAddingTag] = useState(false);

    // Split UI State
    const [activeSplitIdx, setActiveSplitIdx] = useState<number | null>(null);
    const [showSplitPicker, setShowSplitPicker] = useState(false);

    const bottomSheetRef = useRef<SwipeableSheetRef>(null);
    const categoryPickerRef = useRef<SwipeableSheetRef>(null);
    const tagSheetRef = useRef<SwipeableSheetRef>(null);
    const tagMultiPickerRef = useRef<SwipeableSheetRef>(null);
    const tagInputRef = useRef<TextInput>(null);
    const splitPickerRef = useRef<SwipeableSheetRef>(null);

    // Auto-focus keyboard when tag modal opens
    useEffect(() => {
        if (tagModalVisible) {
            const timer = setTimeout(() => {
                tagInputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [tagModalVisible]);

    useEffect(() => {
        if (visible) {
            bottomSheetRef.current?.present();
        } else {
            bottomSheetRef.current?.dismiss();
        }
    }, [visible]);

    const repo = useRef(new ExpenseRepository());
    const budgetRepo = useRef(new BudgetRepository());

    useEffect(() => {
        if (visible && transaction) {
            setDescription(transaction.description || '');
            setAmount((transaction.amount ?? 0).toString());
            setCategoryId(transaction.categoryId || '');
            setIsBusiness(transaction.isBusiness || false);
            setSelectedTagIds(transaction.tags && transaction.tags.length > 0 ? transaction.tags : (transaction.tagId ? [transaction.tagId] : []));
            setSelectedBreakdownId(transaction.budgetBreakdownId || null);

            (async () => {
                const cats = await repo.current.getAllCategories(true);
                setCategories(cats);

                const allocations = await repo.current.getSplitsForParent(transaction.id);
                if (allocations && allocations.length > 0) {
                    setIsSplitMode(true);
                    setSplits(allocations.map(a => {
                        const cName = cats.find(c => c.id === a.categoryId)?.name || 'Unknown';
                        return {
                            categoryId: a.categoryId,
                            categoryName: cName,
                            amount: a.amount.toString(),
                            tagId: a.tagId,
                            tagName: undefined // Not fully populated from tag query, fine for display
                        };
                    }));
                } else {
                    setIsSplitMode(false);
                    setSplits([]);
                }
            })();
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
            if (transaction?.budgetBreakdownId && (!transaction.tags || transaction.tags.length === 0) && !transaction.tagId) {
                const bb = data?.breakdowns.find((b: any) => b.id === transaction.budgetBreakdownId);
                if (bb && bb.tagId) setSelectedTagIds([bb.tagId]);
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
            setSelectedTagIds(prev => prev.includes(newTag.id) ? prev : [...prev, newTag.id]);
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

        if (isSplitMode) {
            const splitTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
            const finalAmount = parseFloat(amount) || transaction.amount;
            if (splitTotal > finalAmount) {
                Alert.alert("Validation Error", "The total of your splits cannot exceed the transaction amount.");
                return;
            }
        }

        setLoading(true);
        try {
            // 1. Always update the parent transaction metadata
            await repo.current.updateExpense(transaction.id, {
                description,
                amount: parseFloat(amount) || transaction.amount,
                categoryId,
                isVerified: true,
                isBusiness,
                budgetBreakdownId: !isSplitMode ? (selectedBreakdownId || null) : null,
                tagId: !isSplitMode ? (selectedTagIds.length > 0 ? selectedTagIds[0] : null) : null,
                tags: !isSplitMode ? selectedTagIds : []
            });

            // 2. Handle Splits
            if (isSplitMode) {
                // Perform atomic split (this deletes old splits and inserts new ones)
                await repo.current.splitTransaction(transaction.id, splits.map(s => ({
                    amount: parseFloat(s.amount),
                    note: s.tagName ? `Budget Split: ${s.tagName}` : s.categoryName,
                    categoryId: s.categoryId,
                    tagId: s.tagId
                })));
            } else {
                // If splitting was toggled OFF, ensure all leftover allocations are cleared
                await repo.current.deleteSplitsForParent(transaction.id);
            }

            onUpdate();
            onClose();
        } catch (e) {
            console.error("Save Error", e);
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
    const selectedCategory = categories.find(c => c.id === categoryId) || { name: transaction?.categoryName || 'Other', id: transaction?.categoryId || '' };
    const DisplayIcon = getCategoryIcon(selectedCategory.name);
    const displayColor = getCategoryColor(selectedCategory.name);

    // Safety check for styles/colors
    if (!colors) return null;

    const isExpense = transaction.type === 'expense';
    const isEditable = transaction.source === 'voice' || transaction.source === 'manual';

    const dateStr = transaction.date ? new Date(transaction.date).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
    const timeStr = transaction.date ? new Date(transaction.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const isSplit = !!transaction.parentId;

    return (
        <SwipeableSheet
            ref={bottomSheetRef}
            onDismiss={onClose}
            snapPoints={['75%']}
            title="Transaction Details"
        >
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
                {/* Header with Amount */}
                <View style={styles.headerSection}>
                    <View style={styles.mainRow}>
                        <View style={[styles.iconBox, { backgroundColor: `${displayColor}15` }]}>
                            <DisplayIcon size={24} color={displayColor} />
                        </View>
                        <View style={styles.titleContainer}>
                            <TextInput
                                style={styles.titleInput}
                                value={description}
                                onChangeText={setDescription}
                                placeholder="What was this for?"
                                multiline
                            />
                            <View style={styles.metaRow}>
                                <Calendar size={12} color={colors.textSecondary} />
                                <Text style={styles.metaText}>{transaction.date || 'Today'}</Text>
                                <View style={[styles.inlineBadge, transaction.isVerified ? styles.bgSuccess : styles.bgWarning]}>
                                    <Text style={[styles.badgeText, { color: transaction.isVerified ? colors.success : colors.warning }]}>
                                        {transaction.isVerified ? 'Automated' : 'Manual'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TextInput
                                style={[styles.amountInput, { color: isExpense ? colors.error : colors.success }]}
                                value={amount}
                                onChangeText={setAmount}
                                keyboardType="numeric"
                                placeholder="0"
                                editable={isEditable}
                            />
                            {isEditable && <Edit3 size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />}
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {/* Segmented Control for Business/Personal */}
                    <View style={styles.segmentedContainer}>
                        <TouchableOpacity
                            style={[styles.segment, !isBusiness && styles.activeSegment]}
                            onPress={() => setIsBusiness(false)}
                        >
                            <User size={16} color={!isBusiness ? colors.primary : colors.textSecondary} />
                            <Text style={[styles.segmentText, !isBusiness && styles.activeSegmentText]}>Personal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.segment, isBusiness && styles.activeSegment]}
                            onPress={() => setIsBusiness(true)}
                        >
                            <Briefcase size={16} color={isBusiness ? colors.primary : colors.textSecondary} />
                            <Text style={[styles.segmentText, isBusiness && styles.activeSegmentText]}>Business</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.divider} />

                    {/* Action Rows */}
                    <View style={styles.rowsContainer}>
                        {/* Category Row */}
                        <TouchableOpacity style={styles.standardRow} onPress={() => categoryPickerRef.current?.present()}>
                            <View style={styles.rowLabelGroup}>
                                <Tag size={18} color={colors.textSecondary} />
                                <Text style={styles.rowLabelText}>Category</Text>
                            </View>
                            <View style={styles.rowValueGroup}>
                                <View style={[styles.categoryPill, { backgroundColor: `${displayColor}10` }]}>
                                    <Text style={[styles.categoryPillText, { color: displayColor }]}>{selectedCategory.name}</Text>
                                </View>
                                <ChevronRight size={16} color={colors.textSecondary} />
                            </View>
                        </TouchableOpacity>

                        {/* Tag Row */}
                        {!isSplitMode && (
                            <TouchableOpacity style={styles.standardRow} onPress={() => tagSheetRef.current?.present()}>
                                <View style={styles.rowLabelGroup}>
                                    <Layers size={18} color={colors.textSecondary} />
                                    <Text style={styles.rowLabelText}>Tags</Text>
                                </View>
                                <View style={styles.rowValueGroup}>
                                    <Text style={styles.rowValueText} numberOfLines={1}>
                                        {selectedTagIds.length === 0 ? 'None' :
                                            selectedTagIds.map((tid: string) => availableTags.find((t: any) => t.id === tid)?.name).filter(Boolean).map((n: any) => formatTagName(n!)).join(', ')
                                        }
                                    </Text>
                                    <ChevronRight size={16} color={colors.textSecondary} />
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Split Toggle Row */}
                        <View style={styles.standardRow}>
                            <View style={styles.rowLabelGroup}>
                                <Split size={18} color={colors.textSecondary} />
                                <Text style={styles.rowLabelText}>Split Transaction</Text>
                            </View>
                            <Switch
                                value={isSplitMode}
                                onValueChange={(val) => {
                                    setIsSplitMode(val);
                                    if (val && splits.length === 0) {
                                        setSplits([{
                                            categoryId: categoryId,
                                            categoryName: selectedCategory.name,
                                            amount: amount || (transaction.amount ?? 0).toString()
                                        }]);
                                    }
                                }}
                                trackColor={{ false: '#E2E8F0', true: colors.primary + '40' }}
                                thumbColor={isSplitMode ? colors.primary : '#FFF'}
                            />
                        </View>
                    </View>

                    {/* Split Section */}
                    {isSplitMode && (
                        <View style={{ marginTop: 24, paddingBottom: 12 }}>
                            <View style={styles.splitsHeader}>
                                <Text style={styles.splitsTitle}>Transaction Splits</Text>
                                <TouchableOpacity
                                    style={styles.addSplitBtn}
                                    onPress={() => {
                                        setSplits([...splits, { categoryId, categoryName: selectedCategory.name, amount: '0' }]);
                                    }}
                                >
                                    <Plus size={16} color={colors.primary} />
                                    <Text style={styles.addSplitText}>Add Split</Text>
                                </TouchableOpacity>
                            </View>

                            {splits.map((split: any, idx: number) => {
                                const splitCatColor = getCategoryColor(split.categoryName);
                                const SplitIcon = getCategoryIcon(split.categoryName);

                                return (
                                    <View key={idx} style={styles.refinedSplitRow}>
                                        <TouchableOpacity
                                            style={styles.splitCatTrigger}
                                            onPress={() => {
                                                setActiveSplitIdx(idx);
                                                splitPickerRef.current?.present();
                                            }}
                                        >
                                            <View style={[styles.gridIcon, { backgroundColor: splitCatColor + '15', marginBottom: 0, width: 32, height: 32 }]}>
                                                <SplitIcon size={16} color={splitCatColor} />
                                            </View>
                                            <Text style={styles.splitCatText} numberOfLines={1}>{split.categoryName}</Text>
                                            <ChevronDown size={14} color={colors.textSecondary} />
                                        </TouchableOpacity>

                                        <View style={styles.splitInputBox}>
                                            <TextInput
                                                style={styles.splitAmountInput}
                                                value={split.amount}
                                                onChangeText={(val) => {
                                                    const newSplits = [...splits];
                                                    newSplits[idx].amount = val;
                                                    setSplits(newSplits);
                                                }}
                                                keyboardType="numeric"
                                                placeholder="0.00"
                                            />
                                        </View>

                                        <TouchableOpacity
                                            style={styles.removeSplitBtn}
                                            onPress={() => {
                                                const newSplits = splits.filter((_: any, i: number) => i !== idx);
                                                setSplits(newSplits);
                                                if (newSplits.length === 0) setIsSplitMode(false);
                                            }}
                                        >
                                            <X size={14} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}

                            {/* Validation Row */}
                            {(() => {
                                const totalSplit = splits.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);
                                const parentAmount = parseFloat(amount || '0');
                                const diff = parentAmount - totalSplit;

                                if (Math.abs(diff) > 0.1) {
                                    return (
                                        <View style={styles.validationRow}>
                                            <AlertCircle size={14} color={colors.error} />
                                            <Text style={styles.validationText}>
                                                {diff > 0 ? `${diff.toLocaleString()} unallocated` : `${Math.abs(diff).toLocaleString()} over allocated`}
                                            </Text>
                                        </View>
                                    );
                                }
                                return (
                                    <View style={styles.validationRow}>
                                        <CheckCircle size={14} color={colors.success} />
                                        <Text style={[styles.validationText, { color: colors.success }]}>Partitions balanced</Text>
                                    </View>
                                );
                            })()}
                        </View>
                    )}

                    {/* Footer Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.btn, styles.btnDelete]}
                            onPress={() => {
                                Alert.alert("Delete Transaction", "Are you sure you want to delete this manual transaction?", [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                        text: "Delete",
                                        style: "destructive",
                                        onPress: async () => {
                                            setLoading(true);
                                            try {
                                                await repo.current.deleteExpense(transaction.id);
                                                onUpdate();
                                                onClose();
                                            } catch (e) {
                                                console.error(e);
                                                Alert.alert("Error", "Could not delete transaction.");
                                            } finally {
                                                setLoading(false);
                                            }
                                        }
                                    }
                                ]);
                            }}
                        >
                            <Trash2 size={18} color={colors.error} />
                            <Text style={[styles.btnText, { color: colors.error }]}>Delete</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.btn, styles.btnSave, (!description.trim() || !amount.trim()) && styles.btnDisabled]}
                            onPress={handleSave}
                            disabled={loading || !description.trim() || !amount.trim()}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#0d1b12" />
                            ) : (
                                <>
                                    <Save size={18} color="#0d1b12" />
                                    <Text style={[styles.btnText, { color: '#0d1b12' }]}>{transaction.source === 'manual' ? 'Save Changes' : 'Update Details'}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* Category Picker Sheet */}
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
                            <TouchableOpacity
                                key={cat.id}
                                style={[styles.gridItem, categoryId === cat.id && { backgroundColor: color + '10', borderColor: color }]}
                                onPress={() => {
                                    setCategoryId(cat.id);
                                    categoryPickerRef.current?.dismiss();
                                }}
                            >
                                <View style={[styles.gridIcon, { backgroundColor: color + '15' }]}>
                                    <Icon size={24} color={color} />
                                </View>
                                <Text style={[styles.gridText, categoryId === cat.id && { color: color, fontWeight: '700' }]}>{cat.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </SwipeableSheet>

            {/* Tag Picker Sheet */}
            <SwipeableSheet
                ref={tagSheetRef}
                title="Select Buckets"
                snapPoints={['70%']}
            >
                <ScrollView contentContainerStyle={styles.gridContainer}>
                    {availableTags.length === 0 && (
                        <View style={{ width: '100%', padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>No buckets for this category</Text>
                        </View>
                    )}
                    {availableTags.map(tag => {
                        const active = selectedTagIds.includes(tag.id);
                        return (
                            <TouchableOpacity
                                key={tag.id}
                                style={[styles.gridItem, active && { backgroundColor: `${colors.primary}10`, borderColor: colors.primary }]}
                                onPress={() => {
                                    let newDesc = (description || '').trim();
                                    const escapedTagName = tag.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                    const tagRegex = new RegExp(`\\[${escapedTagName}\\]`, 'gi');

                                    if (active) {
                                        setSelectedTagIds(prev => prev.filter(t => t !== tag.id));
                                        newDesc = newDesc.replace(tagRegex, '').trim();
                                        if (availableBreakdowns.find(b => b.tagId === tag.id)?.id === selectedBreakdownId) {
                                            setSelectedBreakdownId(null);
                                        }
                                    } else {
                                        setSelectedTagIds(prev => [...prev, tag.id]);
                                        newDesc = `${newDesc} [${tag.name}]`.trim();
                                        const brk = availableBreakdowns.find(b => b.tagId === tag.id);
                                        if (brk) setSelectedBreakdownId(brk.id);
                                    }
                                    setDescription(newDesc.replace(/\s+/g, ' '));
                                }}
                            >
                                <View style={[styles.gridIcon, { backgroundColor: `${colors.primary}15` }]}>
                                    <Layers size={20} color={colors.primary} />
                                </View>
                                <Text style={[styles.gridText, active && { fontWeight: '700', color: colors.primary }]}>
                                    {formatTagName(tag.name)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    <TouchableOpacity
                        style={[styles.gridItem, { borderStyle: 'dashed' }]}
                        onPress={() => {
                            tagSheetRef.current?.dismiss();
                            setTimeout(() => setTagModalVisible(true), 300);
                        }}
                    >
                        <View style={[styles.gridIcon, { backgroundColor: '#F8FAFC' }]}>
                            <Plus size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.gridText, { color: colors.primary, fontWeight: '700' }]}>New Tag</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SwipeableSheet>

            {/* Split Category Picker Sheet */}
            <SwipeableSheet
                ref={splitPickerRef}
                title="Split Category"
                snapPoints={['70%']}
            >
                <ScrollView contentContainerStyle={styles.gridContainer}>
                    {categories.map(cat => {
                        const Icon = getCategoryIcon(cat.name);
                        const color = getCategoryColor(cat.name);
                        return (
                            <TouchableOpacity
                                key={cat.id}
                                style={styles.gridItem}
                                onPress={() => {
                                    if (activeSplitIdx !== null) {
                                        const newSplits = [...splits];
                                        newSplits[activeSplitIdx] = {
                                            ...newSplits[activeSplitIdx],
                                            categoryId: cat.id,
                                            categoryName: cat.name
                                        };
                                        setSplits(newSplits);
                                    }
                                    splitPickerRef.current?.dismiss();
                                }}
                            >
                                <View style={[styles.gridIcon, { backgroundColor: color + '15' }]}>
                                    <Icon size={20} color={color} />
                                </View>
                                <Text style={styles.gridText}>{cat.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </SwipeableSheet>

            {/* Dynamic Tag Creation Popup - Keeping this as Modal for now but with Backdrop fix in SwipeableSheet */}
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
                            <Text style={styles.modalTitle}>Add Bucket</Text>
                            <TouchableOpacity onPress={() => setTagModalVisible(false)}>
                                <X size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputWrapper}>
                            <TextInput
                                ref={tagInputRef}
                                style={styles.textInput}
                                placeholder="Bucket name"
                                value={newTagName}
                                onChangeText={setNewTagName}
                                autoFocus
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setTagModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.createBtn, !newTagName.trim() && styles.btnDisabled]}
                                onPress={handleAddNewTag}
                                disabled={addingTag || !newTagName.trim()}
                            >
                                <Text style={styles.createBtnText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </SwipeableSheet>
    );
};

const styles = StyleSheet.create({
    headerSection: {
        marginBottom: 8,
    },
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
        marginTop: 24,
        marginBottom: 20,
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
    // Split Styles
    splitToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        marginHorizontal: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    splitIconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center'
    },
    splitToggleText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text
    },
    splitsContainer: {
        paddingHorizontal: 20,
        marginBottom: 20
    },
    splitsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    splitsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    addSplitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    addSplitText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary
    },
    splitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8
    },
    splitCatBox: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    splitCatText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text
    },
    splitAmountBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    currencyPrefix: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textSecondary,
        marginRight: 4
    },
    splitAmountInput: {
        flex: 1,
        paddingVertical: 8,
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'right'
    },
    removeSplitBtn: {
        padding: 8,
        backgroundColor: '#FEF2F2',
        borderRadius: 10
    },
    validationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        paddingHorizontal: 4
    },
    validationText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.error
    },
    splitPickerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
        paddingBottom: 40
    },
    splitPickerItem: {
        width: '33.33%',
        alignItems: 'center',
        marginBottom: 20
    },
    splitPickerIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6
    },
    splitPickerText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.text,
        textAlign: 'center'
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
    // Styles for Harmonization & Grid Panels
    segmentedContainer: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        padding: 4,
        marginVertical: 4,
    },
    segment: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8,
    },
    activeSegment: {
        backgroundColor: 'white',
        // Minimal shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    segmentText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    activeSegmentText: {
        color: colors.primary,
    },
    rowsContainer: {
        gap: 4,
    },
    standardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        // Removed border to feel more integrated
    },
    rowLabelGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rowLabelText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.text,
    },
    rowValueGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowValueText: {
        fontSize: 14,
        color: colors.textSecondary,
        maxWidth: 150,
        textAlign: 'right',
    },
    sheetGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 16,
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
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingVertical: 12,
        paddingBottom: 80,
    },
    refinedSplitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        gap: 12,
    },
    splitCatTrigger: {
        flex: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    splitInputBox: {
        flex: 1,
        backgroundColor: '#F1F5F9',
        borderRadius: 10,
        paddingHorizontal: 8,
    },
    btnText: {
        fontWeight: 'bold',
        fontSize: 16,
    }
});
