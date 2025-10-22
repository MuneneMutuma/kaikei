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

import { useNavigation } from "@react-navigation/native";


import AmountStep from "./AmountStep";
import CategoryStep from "./CategoryStep";
import NoteStep from "./NoteStep";
import VoiceInput from "./VoiceInput";

type Category = { id: string; name: string; color: string };
type Expense = { id: string; amount: number; category: string; note?: string; date: string };

const AddExpenseScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"voice" | "form">("form");
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

  const saveExpense = (payload?: Partial<Expense>) => {
    // Build canonical expense object
    const expense: Expense = {
      id: Date.now().toString(),
      amount: payload?.amount ?? parseFloat(amount || "0"),
      category: payload?.category ?? selectedCategory?.name ?? "Other",
      note: payload?.note ?? note.trim(),
      date: new Date().toISOString(),
    };

    // TODO: persist locally (MMKV / SQLite / AsyncStorage) and/or send to analyzer
    console.log("Saved expense:", expense);

    // show ephemeral hint
    setHint("Expense logged");
    setTimeout(() => setHint(null), 2200);

    resetForm();
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
  container: { flex: 1, backgroundColor: "#F6F7F9", paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backBtn: { padding: 8 },
  backText: { fontSize: 20, color: "#222" },
  title: { flex: 1, fontSize: 22, fontWeight: "700", color: "#222", textAlign: "center" },
  modeToggle: { flexDirection: "row", borderRadius: 8, overflow: "hidden" },
  modeButton: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#EEE" },
  modeActive: { backgroundColor: "#3F51B5" },
  modeText: { color: "#333", fontWeight: "600" },
  modeTextActive: { color: "#FFF" },

  navContainer: { flexDirection: "row", marginTop: 12, marginBottom: 8 },
  navAlt: { flex: 1, backgroundColor: "#E8E8E8", padding: 14, borderRadius: 10, marginRight: 8, alignItems: "center" },
  navAltText: { color: "#222", fontSize: 16, fontWeight: "600" },
  navAltPlaceholder: { flex: 1, marginRight: 8 },

  navPrimary: { flex: 1, backgroundColor: "#3F51B5", padding: 14, borderRadius: 10, alignItems: "center" },
  navPrimaryText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  navDisabled: { opacity: 0.6 },

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
