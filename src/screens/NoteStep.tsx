import React from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { getCategoryIcon } from "./CategoryStep";

type Props = {
  note: string;
  setNote: (s: string) => void;
  summary?: {
    amount: string;
    categoryName: string;
    categoryColor: string;
  };
  onEditCategory?: () => void;
  onEditAmount?: () => void;
};

const NoteStep: React.FC<Props> = ({ note, setNote, summary, onEditCategory, onEditAmount }) => {
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.label}>Final Details</Text>

      {summary && (
        <View style={styles.summaryContainer}>
          {/* Layout: Category Pill (Top) -> Amount (Bottom) */}
          <TouchableOpacity
            onPress={onEditCategory}
            style={[styles.categoryRow, { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' }]}
          >
            <View style={[styles.badgeIcon, { backgroundColor: summary.categoryColor }]}>
              {React.createElement(getCategoryIcon(summary.categoryName), { size: 14, color: '#FFF' })}
            </View>
            <Text style={[styles.categoryName, { color: colors.text }]}>{summary.categoryName}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onEditAmount} style={styles.amountRow}>
            <Text style={styles.currencyLabel}>Ksh</Text>
            <Text style={styles.hugeAmount}>{summary.amount}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.subLabel}>Add a note (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Bought tomatoes at market"
        placeholderTextColor="#9CA3AF"
        style={styles.input}
        multiline
        autoFocus={false}
      />

      <Text style={styles.hintText}>
        Tip: You can use Voice at any time to update these details.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: {
    ...typography.header,
    fontSize: 24,
    color: colors.text,
    marginBottom: 20,
    marginTop: 40, // Increased spacing from header (was 20)
    textAlign: 'center'
  },
  summaryContainer: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 16 // Changed from marginBottom to marginTop since it's now second
  },
  currencyLabel: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: '600',
    marginRight: 8,
  },
  hugeAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20, // Fully rounded capsule
    // Background color is handled dynamically 
  },
  badgeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.5
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4
  },
  input: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderColor: "#E5E7EB",
    borderWidth: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  hintText: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic'
  }
});

export default NoteStep;
