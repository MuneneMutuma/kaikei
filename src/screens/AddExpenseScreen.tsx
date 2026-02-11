import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNavigation, useRoute } from "@react-navigation/native";


import AmountStep from "./AmountStep";
import CategoryStep from "./CategoryStep";
import NoteStep from "./NoteStep";
import VoiceInput from "./VoiceInput";

type Category = { id: string; name: string; color: string };
type Expense = { id: string; amount: number; category: string; note?: string; date: string };

import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

const AddExpenseScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>(); // Get route
  const insets = useSafeAreaInsets();

  // Repo instance (ref for stability across renders if needed, but simple constant also works in RN functional component if defined outside or via useRef)
  // safe to use lazy init
  const [repo] = useState(() => new ExpenseRepository());

  const [mode, setMode] = useState<"voice" | "form">(route.params?.initialMode || "form");
  const [step, setStep] = useState<number>(1);
  const [amount, setAmount] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [note, setNote] = useState<string>("");

  const [hint, setHint] = useState<string | null>(null);

  const resetForm = () => {
    setAmount("");
    setSelectedCategory(null);
    setNote("");
    setStep(1);
  };

  const saveExpense = async (payload?: Partial<Expense>) => {
    try {
      const finalAmount = payload?.amount ?? parseFloat(amount || "0");
      const finalCategory = payload?.category ?? selectedCategory?.name ?? "Other";
      const finalNote = payload?.note ?? note.trim();
      const date = new Date().toISOString();

      // Get Category ID if possible (Assuming name matching or default 'other')
      const catObj = repo.getCategoryByName(finalCategory);
      const catId = catObj ? catObj.id : 'other'; // Simplified fallback

      await repo.addExpense({
        amount: finalAmount,
        date: date, // Fix: Pass the date!

        // Wait, ExpenseRepository.addExpense expects { amount, date, description, categoryId, source, rawText }
        // My previous view of ExpenseRepository showed it takes Omit<Expense, 'id'...> 
        // and Schema Expense has categoryId. 
        // Verify ExpenseRepository signature from memory/view.
        // It takes: { amount, date, description, categoryId, source, rawText }
        description: finalNote,
        categoryId: catId,
        source: mode === 'voice' ? 'voice' : 'manual',
        rawText: '',
        type: 'expense'
      });

      console.log("Saved expense to DB");

      // show ephemeral hint
      setHint("Expense logged");
      setTimeout(() => {
        setHint(null);
        if (payload) {
          // If it came from voice/payload, likely want to close or reset? 
          // Navigation back to home seems appropriate for "Done"
          navigation.goBack();
        } else {
          // Manual flow, maybe add another?
          navigation.goBack();
        }
      }, 1200);

      resetForm();
    } catch (e) {
      console.error("Failed to save", e);
      setHint("Error saving expense");
    }
  };

  const nextStep = () => {
    if (step === 1 && !amount) return;
    setStep((s) => Math.min(3, s + 1));
  };
  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { paddingTop: insets.top + 16 }]}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Add Expense</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            onPress={() => setMode("form")}
            style={[styles.modeButton, mode === "form" && styles.modeActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.modeText, mode === "form" && styles.modeTextActive]}>🖊️ Tap</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMode("voice")}
            style={[styles.modeButton, mode === "voice" && styles.modeActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.modeText, mode === "voice" && styles.modeTextActive]}>🎙️ Voice</Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode === "voice" ? (
        <VoiceInput
          onSave={(payload) => {
            saveExpense(payload);
          }}
        />
      ) : (
        <>
          {/* Step components shown sequentially */}
          {step === 1 && <AmountStep amount={amount} setAmount={setAmount} onQuickSet={(v) => setAmount(String(v))} />}

          {step === 2 && (
            <CategoryStep
              selectedCategory={selectedCategory}
              onSelect={(c) => setSelectedCategory(c)}
            />
          )}

          {step === 3 && <NoteStep note={note} setNote={setNote} />}

          {/* bottom nav */}
          <View style={styles.navContainer}>
            {step > 1 ? (
              <TouchableOpacity onPress={prevStep} style={styles.navAlt}>
                <Text style={styles.navAltText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.navAltPlaceholder} />
            )}

            {step < 3 ? (
              <TouchableOpacity
                onPress={nextStep}
                style={[styles.navPrimary, step === 1 && !amount ? styles.navDisabled : undefined]}
                disabled={step === 1 && !amount}
              >
                <Text style={styles.navPrimaryText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (!amount || !selectedCategory) {
                    setHint("Enter amount and choose category");
                    setTimeout(() => setHint(null), 2000);
                    return;
                  }
                  saveExpense();
                }}
                style={[styles.navPrimary, !amount || !selectedCategory ? styles.navDisabled : undefined]}
                disabled={!amount || !selectedCategory}
              >
                <Text style={styles.navPrimaryText}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ephemeral hint / toast */}
      {hint && (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backBtn: { padding: 8 },
  backText: { fontSize: 20, color: colors.text },
  title: { ...typography.header, flex: 1, fontSize: 22, color: colors.text, textAlign: "center" },
  modeToggle: { flexDirection: "row", borderRadius: 8, overflow: "hidden" },
  modeButton: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
  modeActive: { backgroundColor: colors.primary },
  modeText: { color: colors.text, fontWeight: "600" },
  modeTextActive: { color: "white" },

  navContainer: { flexDirection: "row", marginTop: 12, marginBottom: 8 },
  navAlt: { flex: 1, backgroundColor: colors.surface, padding: 14, borderRadius: 10, marginRight: 8, alignItems: "center" },
  navAltText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  navAltPlaceholder: { flex: 1, marginRight: 8 },

  navPrimary: { flex: 1, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: "center" },
  navPrimaryText: { color: "white", fontSize: 16, fontWeight: "700" },
  navDisabled: { opacity: 0.6, backgroundColor: colors.textSecondary },

  hintBox: {
    position: "absolute",
    bottom: 18,
    left: 24,
    right: 24,
    backgroundColor: "#222",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  hintText: { color: "#FFF", fontSize: 14 },
});

export default AddExpenseScreen;
