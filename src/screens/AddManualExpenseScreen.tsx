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
    BackHandler
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { View as MotiView } from 'moti';
import { Check, ChevronLeft, X } from 'lucide-react-native';

import AmountStep from "./AmountStep";
import CategoryStep, { getCategoryColor, getCategoryIcon } from "./CategoryStep";
import NoteStep from "./NoteStep";
import { Category } from "../services/ledger/Schema";

import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

const AddManualExpenseScreen: React.FC = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const repo = useRef(new ExpenseRepository());

    // Form State
    const [step, setStep] = useState<number>(1);
    const [amount, setAmount] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [dbCategories, setDbCategories] = useState<Category[]>([]);
    const [note, setNote] = useState<string>("");

    // UI State
    const [saving, setSaving] = useState(false);

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
        setSaving(true);
        try {
            const finalAmount = parseFloat(amount);
            const date = new Date().toISOString();
            await repo.current.addExpense({
                amount: finalAmount,
                date: date,
                description: note.trim() || selectedCategory.name,
                categoryId: selectedCategory.id,
                source: 'manual',
                rawText: '',
                type: 'expense',
                isVerified: true
            });
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
            setStep(prev => prev + 1); // Auto-advance on category select
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

                {/* Step 3: Note */}
                {step === 3 && (
                    <MotiView
                        from={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'timing', duration: 300 }}
                        style={{ flex: 1 }}
                    >
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
                        />
                    </MotiView>
                )}
            </KeyboardAvoidingView>

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
                        style={styles.saveBtn}
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
    }
});

export default AddManualExpenseScreen;
