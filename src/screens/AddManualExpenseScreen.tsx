import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    StatusBar,
    BackHandler,
    Switch,
    TextInput,
    Keyboard
} from "react-native";
import { SwipeableSheet, SwipeableSheetRef } from "../components/common/SwipeableSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { View as MotiView } from 'moti';
import { Check, ChevronLeft, X, Briefcase, Plus, Layers } from 'lucide-react-native';

import AmountStep from "./AmountStep";
import CategoryStep from "./CategoryStep";
import { getCategoryColor, getCategoryIcon } from "../utils/categoryHelpers";
import NoteStep from "./NoteStep";
import { Category, BudgetBreakdown } from "../services/ledger/Schema";

import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { BudgetRepository } from "../services/ledger/BudgetRepository";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

const AddManualExpenseScreen: React.FC = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const repo = useRef(new ExpenseRepository());
    const budgetRepo = useRef(new BudgetRepository());

    // Form State
    const [step, setStep] = useState<number>(1);
    const [amount, setAmount] = useState<string>("");
    const [dbCategories, setDbCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [note, setNote] = useState<string>("");
    const [isBusiness, setIsBusiness] = useState(false);
    const [availableBreakdowns, setAvailableBreakdowns] = useState<BudgetBreakdown[]>([]);
    const [availableTags, setAvailableTags] = useState<{ id: string, name: string }[]>([]);
    const [selectedBreakdownId, setSelectedBreakdownId] = useState<string | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

    // Split State
    const [isSplit, setIsSplit] = useState(false);
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

    const [saving, setSaving] = useState(false);

    const tagInputRef = useRef<TextInput>(null);
    const tagSheetRef = useRef<SwipeableSheetRef>(null);

    // Auto-focus keyboard when tag sheet opens
    useEffect(() => {
        if (tagModalVisible) {
            tagSheetRef.current?.present();
            const timer = setTimeout(() => {
                tagInputRef.current?.focus();
            }, 300);
            return () => clearTimeout(timer);
        } else {
            tagSheetRef.current?.dismiss();
        }
    }, [tagModalVisible]);

    // --- LOAD DATA ---
    useEffect(() => {
        const loadData = async () => {
            try {
                const cats = await repo.current.getAllCategories();
                setDbCategories(cats);
            } catch (e) {
                console.error("Load Categories Error", e);
            }
        };
        loadData();

        const backAction = () => {
            if (step > 1) {
                setStep(Math.max(1, step - 1));
                return true;
            }
            return false; // let default back happen (exit screen)
        };

        const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => backHandler.remove();
    }, [step]);

    // --- SAVE LOGIC ---
    const saveExpense = async () => {
        if (!amount || !selectedCategory) return;

        const finalAmount = parseFloat(amount);
        if (isNaN(finalAmount) || finalAmount <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid amount.");
            return;
        }

        if (isSplit) {
            const splitTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
            if (Math.abs(splitTotal - finalAmount) > 0.01) {
                Alert.alert("Validation Error", "The total of your splits must equal the total transaction amount.");
                return;
            }
        }

        setSaving(true);
        try {
            const date = new Date().toISOString();

            const allocations = isSplit ? splits.map(s => ({
                categoryId: s.categoryId,
                tagId: s.tagId,
                amount: parseFloat(s.amount) || 0,
                note: s.tagName
            })) : undefined;

            // 1. Create the Parent Transaction with optional allocations
            await repo.current.addExpense({
                amount: finalAmount,
                date: date,
                description: note.trim() || selectedCategory.name,
                categoryId: selectedCategory.id,
                source: 'manual',
                rawText: '',
                recipient: selectedCategory.name,
                type: 'expense',
                isVerified: true,
                isBusiness,
                tags: selectedTagIds,
                excludeFromAnalytics: false
            }, allocations);

            navigation.goBack();
        } catch (e) {
            console.error("Failed to save", e);
            Alert.alert("Error", "Could not save expense.");
        } finally {
            setSaving(false);
        }
    };

    const handleCategorySelect = (item: any) => {
        if (item.type === 'action') {
            if (item.id === 'import') {
                (navigation as any).navigate('SmsReader');
            } else if (item.id === 'add_new') {
                Alert.alert("Coming Soon", "Custom category addition is being implemented.");
            }
        } else {
            setSelectedCategory(item);
            // Intelligent Linker: Fetch breakdowns immediately
            fetchBreakdowns(item.id);
            setStep(prev => prev + 1); // Auto-advance on category select
        }
    };

    const fetchBreakdowns = async (catId: string) => {
        const month = new Date().toISOString().slice(0, 7);
        try {
            // 1. Fetch Planned Breakdowns (for consumption)
            const data = await budgetRepo.current.getBudgetWithBreakdowns(catId, month, false);
            setAvailableBreakdowns(data?.breakdowns || []);

            // 2. Fetch ALL Global Tags for this category (for classification)
            const allTags = await budgetRepo.current.getCategoryTags(catId);
            setAvailableTags(allTags);

            // Auto-select "General" if it exists
            const generalTag = allTags.find(t => t.name.toLowerCase() === 'general');
            if (generalTag) {
                setSelectedTagIds([generalTag.id]);
                // See if it has a breakdown
                const matchingBreakdown = data?.breakdowns.find(b => b.tagId === generalTag.id);
                setSelectedBreakdownId(matchingBreakdown?.id || null);
            } else {
                setSelectedTagIds([]);
                setSelectedBreakdownId(null);
            }

        } catch (e) {
            console.error("Failed to fetch tags/breakdowns", e);
            setAvailableBreakdowns([]);
            setAvailableTags([]);
        }
    };

    const handleAddNewTag = async () => {
        if (!newTagName.trim() || !selectedCategory) return;
        setAddingTag(true);
        try {
            // 1. Create GLOBAL tag (this is permanent and independent of budget)
            const newTag = await budgetRepo.current.getOrCreateTag(selectedCategory.id, newTagName.trim());

            // Refresh list
            await fetchBreakdowns(selectedCategory.id);

            // Select it
            setSelectedTagIds(prev => prev.includes(newTag.id) ? prev : [...prev, newTag.id]);
            // Link to breakdown if it exists (it won't yet unless we promote it, but fetchBreakdowns handles the check)
            const month = new Date().toISOString().slice(0, 7);
            const data = await budgetRepo.current.getBudgetWithBreakdowns(selectedCategory.id, month, false);
            const matchingBreakdown = data?.breakdowns.find(b => b.tagId === newTag.id);
            setSelectedBreakdownId(matchingBreakdown?.id || null);

            // Update UI
            setTagModalVisible(false);
            setNewTagName("");
        } catch (e) {
            console.error("Failed to add tag", e);
            Alert.alert("Error", "Could not add custom tag.");
        } finally {
            setAddingTag(false);
        }
    };

    const prevStep = () => setStep((s) => Math.max(1, s - 1));

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

            {/* 1. Header & Progress Bar */}
            <View style={[styles.header, { paddingTop: 10 }]}>
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                        <X color={colors.text} size={24} />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={styles.headerLabel}>Manual Entry</Text>
                        <Text style={styles.headerTitle}>
                            {step === 1 ? "Select Category" : step === 2 ? "Enter Amount" : "Add Details"}
                        </Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Progress Bar */}
                <View style={styles.progressTrack}>
                    <MotiView
                        animate={{ width: `${(step / 3) * 100}%` }}
                        transition={{ type: 'timing', duration: 500 }}
                        style={styles.progressBar}
                    />
                </View>
            </View>

            {/* 2. Content */}
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={[styles.content]}
            >
                {/* Step 1: Category */}
                {step === 1 && (
                    <MotiView
                        from={{ opacity: 0, translateX: -20 }}
                        animate={{ opacity: 1, translateX: 0 }}
                        transition={{ type: 'timing', duration: 300 }}
                        style={{ flex: 1 }}
                    >
                        <CategoryStep
                            categories={dbCategories}
                            selectedCategory={selectedCategory}
                            onSelect={handleCategorySelect}
                        />
                    </MotiView>
                )}

                {/* Step 2: Amount */}
                {step === 2 && (
                    <MotiView
                        from={{ opacity: 0, translateX: 20 }}
                        animate={{ opacity: 1, translateX: 0 }}
                        transition={{ type: 'timing', duration: 300 }}
                        style={{ flex: 1 }}
                    >
                        {selectedCategory && (
                            <View style={styles.selectionBadge}>
                                <View style={[styles.badgeIcon, { backgroundColor: getCategoryColor(selectedCategory.name) }]}>
                                    {React.createElement(getCategoryIcon(selectedCategory.name), { size: 14, color: '#FFF' })}
                                </View>
                                <Text style={styles.badgeText}>{selectedCategory.name}</Text>
                            </View>
                        )}
                        <AmountStep
                            amount={amount}
                            setAmount={setAmount}
                            onNext={() => setStep(3)}
                        />
                    </MotiView>
                )}

                {/* Step 3: Note & Business Toggle */}
                {step === 3 && (
                    <MotiView
                        from={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'timing', duration: 300 }}
                        style={{ flex: 1 }}
                    >
                        {/* Business Toggle Row */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsBusiness(!isBusiness)}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                backgroundColor: 'white',
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                borderRadius: 16,
                                marginBottom: 16,
                                marginTop: 8,
                                shadowColor: "#000",
                                shadowOpacity: 0.05,
                                shadowRadius: 5,
                                elevation: 1
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{
                                    width: 40, height: 40, borderRadius: 20,
                                    backgroundColor: isBusiness ? '#E0F2FE' : '#F1F5F9',
                                    alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Briefcase size={20} color={isBusiness ? '#0284C7' : colors.textSecondary} />
                                </View>
                                <View>
                                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Business Expense</Text>
                                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                                        {isBusiness ? 'Marked as Business' : 'Marked as Personal'}
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={isBusiness}
                                onValueChange={setIsBusiness}
                                trackColor={{ false: '#E2E8F0', true: '#0EA5E9' }}
                                thumbColor={'white'}
                            />
                        </TouchableOpacity>

                        <NoteStep
                            note={note}
                            setNote={setNote}
                            onEditCategory={() => setStep(1)}
                            onEditAmount={() => setStep(2)}
                            summary={{
                                amount,
                                categoryName: selectedCategory?.name || '',
                                categoryColor: selectedCategory ? getCategoryColor(selectedCategory.name) : colors.primary
                            }}
                            dbCategories={dbCategories}
                            availableTags={availableTags}
                            selectedTagIds={selectedTagIds}
                            onSelectTag={(tagId) => {
                                setSelectedTagIds(prev => {
                                    if (prev.includes(tagId)) return prev.filter(t => t !== tagId);
                                    return [...prev, tagId];
                                });
                                // Map to breakdown if planned
                                const breakdown = availableBreakdowns?.find(b => b.tagId === tagId);
                                if (breakdown) setSelectedBreakdownId(breakdown.id);
                            }}
                            onClearTags={() => {
                                setSelectedTagIds([]);
                                setSelectedBreakdownId(null);
                            }}
                            onAddBreakdown={() => setTagModalVisible(true)}
                            isSplit={isSplit}
                            setIsSplit={setIsSplit}
                            splits={splits}
                            setSplits={setSplits}
                        />
                    </MotiView>
                )}
            </KeyboardAvoidingView>

            {/* Tag Creation Sheet */}
            <SwipeableSheet
                ref={tagSheetRef}
                title="Add Budget Bucket"
                snapPoints={['60%']}
                onDismiss={() => setTagModalVisible(false)}
            >
                <View style={{ paddingBottom: 20 }}>
                    <Text style={styles.modalSubtitle}>
                        Creating a new tag for <Text style={{ fontWeight: 'bold' }}>{selectedCategory?.name}</Text>
                    </Text>

                    <View style={styles.inputWrapper}>
                        <Layers size={20} color={colors.primary} style={styles.inputIcon} />
                        <TextInput
                            ref={tagInputRef}
                            style={styles.textInput}
                            placeholder="Bucket name (e.g. Avocado, Fuel, Wifi)"
                            placeholderTextColor={colors.textSecondary}
                            value={newTagName}
                            onChangeText={setNewTagName}
                            onSubmitEditing={handleAddNewTag}
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
                            style={[styles.createBtn, !newTagName.trim() && styles.disabledBtnSecondary]}
                            onPress={handleAddNewTag}
                            disabled={addingTag || !newTagName.trim()}
                        >
                            {addingTag ? <ActivityIndicator size="small" color="#fff" /> : (
                                <>
                                    <Text style={[styles.createBtnText, !newTagName.trim() && { color: colors.textSecondary }]}>Create Tag</Text>
                                    <Check size={16} color={!newTagName.trim() ? colors.textSecondary : "#0d1b12"} style={{ marginLeft: 4 }} />
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </SwipeableSheet>

            {/* 3. Footer Actions (No Voice) */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>

                {step > 1 && (
                    <TouchableOpacity onPress={prevStep} style={styles.navBtn}>
                        <ChevronLeft size={24} color={colors.text} />
                        <Text style={styles.navBtnText}>Back</Text>
                    </TouchableOpacity>
                )}

                {/* Spacer if Step 1 (Left side empty) */}
                {step === 1 && <View style={{ flex: 1 }} />}

                {/* Right Side Action */}
                {step === 3 ? (
                    <TouchableOpacity
                        onPress={saveExpense}
                        style={[
                            styles.saveBtn,
                            saving ? styles.disabledBtn : null
                        ]}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text style={styles.saveBtnText}>Save Transaction</Text>
                                <Check color="#fff" size={20} style={{ marginLeft: 8 }} />
                            </>
                        )}
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onPress={() => setStep(step + 1)}
                        disabled={(step === 1 && !selectedCategory) || (step === 2 && !amount)}
                        style={[
                            styles.saveBtn,
                            ((step === 1 && !selectedCategory) || (step === 2 && !amount)) ? styles.disabledBtn : null
                        ]}
                    >
                        <Text style={styles.saveBtnText}>Next Step</Text>
                        <ChevronLeft size={20} color="#FFF" style={{ transform: [{ rotate: '180deg' }], marginLeft: 4 }} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        paddingHorizontal: 20,
        backgroundColor: colors.background,
        paddingBottom: 12
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    closeBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#f1f5f9'
    },
    headerLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.text,
    },
    progressTrack: {
        height: 4,
        width: '100%',
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        overflow: 'hidden'
    },
    progressBar: {
        height: '100%',
        backgroundColor: colors.primary,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    selectionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 24,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2
    },
    badgeIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    badgeText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 16,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9'
    },
    navBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12
    },
    navBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        marginLeft: 4
    },
    disabledBtn: {
        backgroundColor: '#CBD5E1',
        elevation: 0,
    },
    saveBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 4,
        shadowColor: colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    saveBtnText: {
        color: '#0d1b12',
        fontWeight: '700',
        fontSize: 16
    },
    disabledBtnSecondary: {
        backgroundColor: '#F1F5F9',
        elevation: 0,
    },
    // Tag Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 5
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
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 20
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 24
    },
    inputIcon: {
        marginRight: 10
    },
    textInput: {
        flex: 1,
        height: 48,
        fontSize: 16,
        color: colors.text
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: '#f1f5f9'
    },
    cancelBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textSecondary
    },
    createBtn: {
        flex: 2,
        backgroundColor: colors.primary,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        flexDirection: 'row'
    },
    createBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0d1b12'
    }
});

export default AddManualExpenseScreen;
