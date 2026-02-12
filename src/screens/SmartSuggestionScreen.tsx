import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, Alert, StatusBar, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { SmartOnboardingService } from '../services/intelligence/SmartOnboardingService';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { Expense, Category } from '../services/ledger/Schema';
import { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Check, ChevronLeft, Calendar, Plus, X } from 'lucide-react-native';

type SmartSuggestionScreenRouteProp = RouteProp<RootStackParamList, 'SmartSuggestion'>;

export const SmartSuggestionScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<SmartSuggestionScreenRouteProp>();
    const insets = useSafeAreaInsets();
    const { name } = route.params;

    const [transactions, setTransactions] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

    // Add Category State
    const [addCatModalVisible, setAddCatModalVisible] = useState(false);
    const [newCatName, setNewCatName] = useState("");
    const [isAddingCat, setIsAddingCat] = useState(false);

    const onboardingService = useMemo(() => new SmartOnboardingService(), []);
    const repo = useMemo(() => new ExpenseRepository(), []);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const txs = await onboardingService.getTransactionsForRecipient(name);
            console.log("[SmartSuggestionScreen] Transactions:", txs);
            setTransactions(txs);
            setSelectedIds(new Set(txs.map(t => t.id))); // Select all by default

            const cats = await repo.getAllCategories();
            setCategories(cats);
        } catch (e) {
            Alert.alert("Error", "Failed to load transactions.");
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!selectedCategoryId) {
            Alert.alert("Choose Category", "Please select a category to continue.");
            return;
        }

        setSubmitting(true);
        try {
            const count = await onboardingService.labelPayee(name, selectedCategoryId);
            Alert.alert("Success", `Categorized ${count} transactions.`);
            navigation.navigate('MainTabs');
        } catch (e) {
            Alert.alert("Error", "Failed to categorize.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddCategory = async () => {
        if (!newCatName.trim()) return;
        setIsAddingCat(true);
        try {
            const newCat = await repo.addCategory(newCatName.trim(), true);
            setCategories(prev => [...prev, newCat]); // Optimistic update
            setSelectedCategoryId(newCat.id);
            setAddCatModalVisible(false);
            setNewCatName("");
        } catch (e) {
            Alert.alert("Error", "Could not add category.");
        } finally {
            setIsAddingCat(false);
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    // Calculate Totals
    const totalAmount = useMemo(() => {
        return transactions.reduce((sum, t) => sum + t.amount, 0);
    }, [transactions]);

    // Grouping for SectionList
    const sections = useMemo(() => {
        const grouped = transactions.reduce((acc, expense) => {
            const dateKey = new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push(expense);
            return acc;
        }, {} as Record<string, Expense[]>);

        return Object.keys(grouped)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
            .map(date => ({ title: date, data: grouped[date] }));
    }, [transactions]);

    const getCategoryIcon = (catName: string) => {
        const map: { [key: string]: string } = {
            'Fuel': '⛽', 'Stock': '📦', 'Food': '🍔', 'Transport': '🚌',
            'Airtime': '📱', 'Rent': '🏠', 'Utilities': '💡', 'Labor': '👷',
            'Loans': '🏦', 'Other': '📝'
        };
        return map[catName] || '🏷️';
    };

    const renderItem = ({ item }: { item: Expense }) => {
        const isSelected = selectedIds.has(item.id);

        // Parse time carefully
        let timeDisplay = "";
        try {
            timeDisplay = new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { timeDisplay = "--:--"; }

        return (
            <TouchableOpacity
                style={[styles.itemRow, isSelected && styles.itemSelected]}
                onPress={() => toggleSelection(item.id)}
                activeOpacity={0.7}
            >
                <View style={[styles.checkbox, isSelected ? styles.checked : styles.unchecked]}>
                    {isSelected && <Check size={12} color="white" />}
                </View>
                <View style={styles.itemContent}>
                    <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.itemDate}>{timeDisplay}</Text>
                </View>
                <Text style={styles.itemAmount}>
                    Ksh {item.amount.toLocaleString()}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => (
        <View style={styles.sectionHeader}>
            <Calendar size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
    );

    const ListHeader = () => (
        <View style={styles.listHeaderContainer}>
            <Text style={styles.listHeaderLabel}>TRANSACTIONS ({transactions.length})</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* 1. Command Header (Gradient) */}
            <LinearGradient
                colors={['#00695C', '#2E7D32']} // Deep Teal -> Safaricom Green
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.headerGradient, { paddingTop: insets.top }]}
            >
                {/* Back Button */}
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <ChevronLeft size={28} color="white" />
                </TouchableOpacity>

                <View style={styles.headerContent}>
                    <Text style={styles.headerPayeeLabel}>Reviewing Payee</Text>
                    <Text style={styles.headerPayeeName}>{name}</Text>

                    <View style={styles.totalBadge}>
                        <Text style={styles.totalLabel}>TOTAL FOUND</Text>
                        <Text style={styles.totalAmount}>Ksh {totalAmount.toLocaleString()}</Text>
                    </View>
                </View>
            </LinearGradient>

            {/* 2. Main Content */}
            <View style={styles.contentContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
                ) : (
                    <SectionList
                        sections={sections}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        renderSectionHeader={renderSectionHeader}
                        ListHeaderComponent={ListHeader}
                        contentContainerStyle={{ paddingBottom: 220 }} // Correct space for footer
                        showsVerticalScrollIndicator={false}
                        stickySectionHeadersEnabled={false}
                    />
                )}
            </View>

            {/* 3. Sticky Glass Footer */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                <View style={styles.categoryRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.footerLabel}>Categorize as:</Text>
                        {/* Hint for scrolling */}
                        <Text style={{ fontSize: 10, color: colors.textSecondary, fontStyle: 'italic' }}>Scroll for more</Text>
                    </View>

                    <SectionList
                        horizontal
                        sections={[{ title: 'Categories', data: categories }]}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.catChip, selectedCategoryId === item.id && styles.catChipSelected]}
                                onPress={() => setSelectedCategoryId(item.id)}
                            >
                                <Text style={[styles.catText, selectedCategoryId === item.id && styles.catTextSelected]}>
                                    {getCategoryIcon(item.name)} {item.name}
                                </Text>
                            </TouchableOpacity>
                        )}
                        // Add "Plus" item at the end
                        ListFooterComponent={
                            <TouchableOpacity
                                style={[styles.catChip, styles.addCatChip]}
                                onPress={() => setAddCatModalVisible(true)}
                            >
                                <Plus size={16} color="white" />
                                <Text style={[styles.catText, { color: 'white', marginLeft: 4, fontWeight: 'bold' }]}>Add</Text>
                            </TouchableOpacity>
                        }
                        keyExtractor={item => item.id}
                        showsHorizontalScrollIndicator={false}
                        style={{ flexGrow: 0 }}
                        contentContainerStyle={{ paddingRight: 20 }}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.confirmBtn, (!selectedCategoryId || selectedIds.size === 0) && styles.disabledBtn]}
                    onPress={handleConfirm}
                    disabled={submitting || !selectedCategoryId || selectedIds.size === 0}
                    activeOpacity={0.8}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.confirmText}>Confirm {selectedIds.size} Transactions</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Add Category Modal */}
            <Modal
                transparent
                visible={addCatModalVisible}
                animationType="fade"
                onRequestClose={() => setAddCatModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>New Category</Text>
                            <TouchableOpacity onPress={() => setAddCatModalVisible(false)}>
                                <X size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Subscriptions, Gym, Donations"
                            placeholderTextColor="#999"
                            value={newCatName}
                            onChangeText={setNewCatName}
                            autoFocus
                        />

                        <TouchableOpacity
                            style={[styles.modalBtn, !newCatName.trim() && styles.disabledBtn]}
                            onPress={handleAddCategory}
                            disabled={!newCatName.trim() || isAddingCat}
                        >
                            {isAddingCat ? <ActivityIndicator color="white" /> : <Text style={styles.confirmText}>Create Category</Text>}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA' },

    // Header
    headerGradient: {
        paddingHorizontal: 24,
        paddingBottom: 32,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        shadowColor: "#004D40",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
        zIndex: 10,
    },
    backButton: {
        marginTop: 12,
        marginBottom: 16,
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        padding: 6
    },
    headerContent: {
        alignItems: 'flex-start',
    },
    headerPayeeLabel: {
        ...typography.caption,
        color: 'rgba(255,255,255,0.8)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4
    },
    headerPayeeName: {
        ...typography.display,
        color: 'white',
        fontSize: 28,
        marginBottom: 20,
    },
    totalBadge: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    totalLabel: {
        ...typography.caption,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: 'bold',
    },
    totalAmount: {
        ...typography.header,
        color: 'white',
        fontSize: 22,
    },

    // Content
    contentContainer: {
        flex: 1,
        marginTop: -20, // Overlap effect
        paddingHorizontal: 16,
        zIndex: 1,
    },
    listHeaderContainer: {
        marginTop: 32,
        marginBottom: 12,
        paddingHorizontal: 8
    },
    listHeaderLabel: {
        ...typography.caption,
        fontWeight: 'bold',
        color: colors.textSecondary,
        letterSpacing: 0.5
    },

    // List Items
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        backgroundColor: '#F5F7FA' // Sticky header bg match
    },
    sectionTitle: {
        ...typography.caption,
        fontWeight: 'bold',
        color: colors.textSecondary,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 16,
        marginBottom: 8,
        // Flat styling for clean list
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.03)',
    },
    itemSelected: {
        backgroundColor: '#E8F5E9', // Light Green
        borderColor: colors.primary,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#CFD8DC',
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center'
    },
    checked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary
    },
    unchecked: {},
    itemContent: { flex: 1 },
    itemDesc: {
        ...typography.body,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 2
    },
    itemDate: {
        ...typography.caption,
        fontSize: 11
    },
    itemAmount: {
        ...typography.body,
        fontWeight: 'bold',
        color: colors.text
    },

    // Sticky Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingHorizontal: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 25,
        zIndex: 100,
        borderTopWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    categoryRow: {
        marginBottom: 16,
    },
    footerLabel: {
        ...typography.caption,
        color: colors.textSecondary,
        fontWeight: 'bold'
    },
    catChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: '#F5F5F5',
        marginRight: 8,
    },
    addCatChip: {
        backgroundColor: colors.textSecondary, // Darker for contrast
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14
    },
    catChipSelected: {
        backgroundColor: '#E8F5E9',
        borderWidth: 1,
        borderColor: colors.primary
    },
    catText: { ...typography.body, fontSize: 13, color: colors.textSecondary },
    catTextSelected: { color: colors.primary, fontWeight: '700' },

    confirmBtn: {
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8
    },
    disabledBtn: {
        backgroundColor: '#CFD8DC',
        shadowOpacity: 0,
        elevation: 0
    },
    confirmText: {
        ...typography.header,
        fontSize: 16,
        color: 'white',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 24
    },
    modalCard: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    modalTitle: {
        ...typography.header,
        fontSize: 20
    },
    input: {
        backgroundColor: colors.background,
        padding: 16,
        borderRadius: 12,
        fontSize: 16,
        color: colors.text,
        marginBottom: 24
    },
    modalBtn: {
        backgroundColor: colors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center'
    }
});
