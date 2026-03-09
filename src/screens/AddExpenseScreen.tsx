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
  PermissionsAndroid,
  NativeModules,
  NativeEventEmitter,
  BackHandler
} from "react-native";
import { v4 as uuidv4 } from 'uuid';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { View as MotiView, AnimatePresence } from 'moti';
import { Mic, Check, ChevronLeft, Download, Plus } from 'lucide-react-native';

// --- NATIVE VOICE ENGINE ---
// NativeEventEmitter translates events sent from Android/Java (OnnxModule/VoiceModule) 
// into JavaScript events we can listen to here.
const { VoiceModule } = NativeModules;
const voiceEmitter = new NativeEventEmitter(VoiceModule);

import AmountStep from "./AmountStep";
import CategoryStep from "./CategoryStep";
import { getCategoryColor, getCategoryIcon } from "../utils/categoryHelpers";
import NoteStep from "./NoteStep";
import { Category, BudgetBreakdown } from "../services/ledger/Schema";

import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { BudgetRepository } from "../services/ledger/BudgetRepository";
import { NaturalLanguageParser } from "../services/parser/NaturalLanguageParser";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

const AddExpenseScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const repo = useRef(new ExpenseRepository());
  const parser = useRef(new NaturalLanguageParser());

  // Form State
  const [step, setStep] = useState<number>(1);
  const [amount, setAmount] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const categoriesRef = useRef<Category[]>([]);
  const [note, setNote] = useState<string>("");

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);

  // UI State
  const [saving, setSaving] = useState(false);

  // Transaction Splitting State
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<{ categoryId: string, categoryName: string, amount: string, budgetBreakdownId?: string, tagId?: string }[]>([]);

  // Budget Bucket State
  const [availableBreakdowns, setAvailableBreakdowns] = useState<BudgetBreakdown[]>([]);
  const [selectedBreakdownId, setSelectedBreakdownId] = useState<string | null>(null);

  // --- LOAD DATA ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const cats = await repo.current.getAllCategories();
        setDbCategories(cats);
        categoriesRef.current = cats;
      } catch (e) {
        console.error("Load Categories Error", e);
      }
    };
    loadData();

    const onSpeechStart = () => setIsListening(true);
    const onSpeechResults = (e: any) => {
      if (e.value && e.value[0]) {
        handleVoiceInput(e.value[0]);
      }
    };
    const onSpeechError = (e: any) => {
      console.log("Voice Error:", e);
      setIsListening(false);
      // Error code 7 usually means network/offline pack missing
      if (e.code === 7 || e.code === 13) {
        Alert.alert("Voice Ready", "Offline speech engine is starting or needs its language pack.");
      }
    };

    const startListener = voiceEmitter.addListener('onSpeechStart', onSpeechStart);
    const resultListener = voiceEmitter.addListener('onSpeechResults', onSpeechResults);
    const errorListener = voiceEmitter.addListener('onSpeechError', onSpeechError);

    const backAction = () => {
      if (step > 1) {
        setStep(Math.max(1, step - 1));
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => {
      startListener.remove();
      resultListener.remove();
      errorListener.remove();
      backHandler.remove();
    };
  }, [step]);

  useEffect(() => {
    const loadBreakdowns = async () => {
      if (selectedCategory) {
        const budgetRepo = new BudgetRepository();
        const currentMonthIso = new Date().toISOString().slice(0, 7);
        try {
          const dashboard = await budgetRepo.getMonthlyBudgetDashboard(currentMonthIso);
          const line = dashboard.find(b => b.categoryId === selectedCategory.id);
          if (line) {
            const brks = await budgetRepo.getBudgetBreakdowns(line.id);
            setAvailableBreakdowns(brks);
          } else {
            setAvailableBreakdowns([]);
            setSelectedBreakdownId(null);
          }
        } catch (e) {
          console.error("Failed to load breakdowns", e);
        }
      }
    };
    loadBreakdowns();
  }, [selectedCategory]);

  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone Permission",
            message: "Kaikei needs access to your microphone so you can add expenses with your voice.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true; // iOS handles this via its own internal dialog on first Voice call
  };

  const handleVoiceInput = async (text: string) => {
    setIsListening(false);
    setVoiceProcessing(true);
    try {
      const result = await parser.current.parse(text);
      if (result && result.amount > 0) {
        // Log to user (Development/check)
        if (result.method) {
          console.log(`[Voice] Method: ${result.method.toUpperCase()}`);
          // Optional: Show a quick toast or alert if requested, but console is safer for "logs"
          // Alert.alert("Categorized Via", result.method.toUpperCase()); 
        }

        setAmount(String(result.amount));
        const currentCats = categoriesRef.current;
        const cat = currentCats.find(c => c.name.toLowerCase() === result.categoryName?.toLowerCase())
          || currentCats.find(c => c.id === result.categoryId)
          || currentCats.find(c => c.name.toLowerCase() === 'other');

        if (cat) setSelectedCategory(cat);
        if (result.description) setNote(result.description);

        if (result.amount > 0 && cat) setStep(3);
        else if (result.amount > 0) setStep(2);
      } else {
        Alert.alert("Not sure I got that", `Try saying something like "Food 200"`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVoiceProcessing(false);
    }
  };

  const toggleVoice = async () => {
    // Check if VoiceModule is available
    if (!VoiceModule) {
      Alert.alert("Voice Error", "Native voice module not found. Check native linking.");
      return;
    }

    if (isListening) {
      try {
        await VoiceModule.stopListening();
        setIsListening(false);
      } catch (e) {
        console.error("Voice Stop Error", e);
      }
    } else {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert("Permission Denied", "Microphone access is required for voice input.");
        return;
      }

      try {
        // Use empty locale to fall back to system default (Swahili/English)
        await VoiceModule.startListening({
          locale: '',
          preferOffline: true
        });
      } catch (e) {
        console.error("Voice Start Error", e);
        Alert.alert("Speech Input Error", "Could not start recording.");
      }
    }
  };

  // --- SAVE LOGIC ---
  const saveExpense = async () => {
    if (!amount || !selectedCategory) return;
    setSaving(false); // Initialize but don't set true until checks pass

    try {
      const finalAmount = parseFloat(amount);
      const date = new Date().toISOString();
      const currentMonth = date.slice(0, 7);

      // --- Budget Threshold Check ---
      const budgetRepo = new BudgetRepository();
      const dashboard = await budgetRepo.getMonthlyBudgetDashboard(currentMonth);
      const budgetLine = dashboard.find(b => b.categoryId === selectedCategory.id);

      if (budgetLine && budgetLine.limitAmount > 0) {
        const currentSpent = budgetLine.spentAmount || 0;
        const totalAfterThis = currentSpent + finalAmount;

        if (totalAfterThis > budgetLine.limitAmount) {
          const overBy = totalAfterThis - budgetLine.limitAmount;
          const confirmSave = await new Promise((resolve) => {
            Alert.alert(
              "Budget Exceeded",
              `This expense will put you over your ${selectedCategory.name} budget by KES ${overBy.toLocaleString()}.\n\nDo you still want to save it?`,
              [
                { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
                { text: "Save Anyway", onPress: () => resolve(true), style: "destructive" }
              ]
            );
          });

          if (!confirmSave) return;
        }
      }

      setSaving(true);

      if (isSplit && splits.length > 0) {
        // Handle Atomic Split (Parent-Child)
        const allocations = splits.map(s => ({
          categoryId: s.categoryId,
          tagId: s.tagId,
          amount: parseFloat(s.amount) || 0,
          note: note.trim() || s.categoryName
        }));

        await repo.current.addExpense({
          amount: finalAmount,
          date: date,
          description: note.trim() || 'Split Expense',
          categoryId: selectedCategory.id,
          source: 'manual',
          rawText: '',
          type: 'expense',
          isBusiness: false
        }, allocations);
      } else {
        // Handle Single Entry
        const tagId = selectedBreakdownId ? availableBreakdowns.find(b => b.id === selectedBreakdownId)?.tagId : undefined;
        await repo.current.addExpense({
          amount: finalAmount,
          date: date,
          description: note.trim() || selectedCategory.id,
          categoryId: selectedCategory.id,
          source: 'manual',
          rawText: '',
          type: 'expense',
          isBusiness: false,
          tags: tagId ? [tagId] : []
        });
      }
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
    }
  };

  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* 1. Immersive Header & Progress Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBar}>
          <View style={styles.headerLeft}>
            {step > 1 ? (
              <TouchableOpacity onPress={prevStep} style={styles.headerBackBtn}>
                <ChevronLeft color={colors.text} size={28} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
                <ChevronLeft color={colors.text} size={28} />
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.headerLabel}>Quick Entry</Text>
              <Text style={styles.headerTitle}>Add Expense</Text>
            </View>
          </View>
        </View>
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
        style={[styles.content, { backgroundColor: colors.background }]}
      >
        {/* Selection Badge (Persistent Context) - Only on Step 2 */}
        {step === 2 && selectedCategory && (
          <View style={[styles.selectionBadge, { marginTop: 24 }]}>
            <View style={[styles.badgeIcon, { backgroundColor: getCategoryColor(selectedCategory.name) }]}>
              {React.createElement(getCategoryIcon(selectedCategory.name), { size: 14, color: '#FFF' })}
            </View>
            <Text style={styles.badgeText}>{selectedCategory.name}</Text>
          </View>
        )}
        {step === 1 && (
          <MotiView
            animate={{ opacity: 1 }}
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

        {step === 2 && (
          <MotiView
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 300 }}
            style={{ flex: 1 }}
          >
            <AmountStep
              amount={amount}
              setAmount={setAmount}
              onNext={() => setStep(3)}
            />
            {/* Split Toggle at Step 2 */}
            <TouchableOpacity
              style={[styles.splitEntryBtn, isSplit && styles.splitEntryBtnActive]}
              onPress={() => setIsSplit(!isSplit)}
            >
              <Plus size={16} color={isSplit ? '#fff' : colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.splitEntryText, isSplit && { color: '#fff' }]}>
                {isSplit ? "Splitting Enabled" : "Split this transaction"}
              </Text>
            </TouchableOpacity>
          </MotiView>
        )}

        {step === 3 && (
          <MotiView
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 300 }}
            style={{ flex: 1 }}
          >
            <NoteStep
              note={note}
              setNote={setNote}
              onEditAmount={() => setStep(2)}
              summary={{
                amount,
                categoryName: selectedCategory?.name || '',
                categoryColor: selectedCategory ? getCategoryColor(selectedCategory.name) : colors.primary
              }}
              isSplit={isSplit}
              splits={splits}
              setSplits={setSplits}
              dbCategories={dbCategories}
              availableBreakdowns={availableBreakdowns}
              selectedBreakdownId={selectedBreakdownId}
              onSelectBreakdown={setSelectedBreakdownId}
            />
          </MotiView>
        )}
      </KeyboardAvoidingView>

      {/* 3. Footer with Integrated Ambient Mic */}
      <MotiView
        animate={{
          height: isListening ? 140 : 100,
          backgroundColor: isListening ? 'rgba(33, 150, 243, 0.05)' : colors.background
        }}
        transition={{ type: 'timing', duration: 300 }}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}
      >
        {/* Left Slot: Empty (Back moved to top) */}
        <View style={styles.footerSlot} />

        {/* Center Slot: Stationary Mic with Ambient Glow */}
        <View style={styles.voiceOrbSlot}>
          <AnimatePresence>
            {isListening && (
              <MotiView
                from={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 2.2, opacity: 0.15 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{
                  type: 'timing',
                  duration: 1500,
                  loop: true,
                }}
                style={[styles.pulse, { backgroundColor: colors.danger }]}
              />
            )}
          </AnimatePresence>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleVoice}
            style={[
              styles.voiceBtn,
              isListening
                ? { backgroundColor: colors.danger, elevation: 0 }
                : { backgroundColor: colors.primary, elevation: 4 }
            ]}
          >
            {voiceProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Mic size={28} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Right Slot: Save or Next Button */}
        <View style={styles.footerSlot}>
          {!isListening && (
            <>
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
                      <Text style={styles.saveBtnText}>Save</Text>
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
                  <Text style={styles.saveBtnText}>Next</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </MotiView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackBtn: {
    padding: 8,
    marginLeft: -12,
    marginRight: 4,
  },
  headerLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  headerTitle: {
    ...typography.header,
    fontSize: 24,
    color: colors.text,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600'
  },
  progressTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
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
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    justifyContent: 'center',
    paddingHorizontal: 20,
    height: 100,
  },
  footerSlot: {
    flex: 1,
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    alignSelf: 'flex-start'
  },
  backBtnText: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontWeight: '600'
  },
  voiceOrbSlot: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBtn: {
    backgroundColor: colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  pulse: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  disabledBtn: {
    backgroundColor: colors.border,
    elevation: 0,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    alignSelf: 'flex-end'
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16
  },
  splitEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#f0fdf4'
  },
  splitEntryBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  splitEntryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary
  }
});

export default AddExpenseScreen;
