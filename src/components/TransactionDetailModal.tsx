import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, LayoutAnimation, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Expense, Category } from '../services/ledger/Schema';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Check, Trash2, Calendar, Clock, Tag, Save, AlertTriangle, ChevronRight, ChevronDown, Edit3, Briefcase, User } from 'lucide-react-native';
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

    const repo = useRef(new ExpenseRepository());

    useEffect(() => {
        if (visible && transaction) {
            setDescription(transaction.description);
            setAmount(transaction.amount.toString());
            setCategoryId(transaction.categoryId);
            setIsBusiness(transaction.isBusiness || false);
            loadCategories();
        }
    }, [visible, transaction]);

    const loadCategories = async () => {
        const cats = await repo.current.getAllCategories();
        setCategories(cats);
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
                isBusiness
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

                        <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave} disabled={loading}>
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
