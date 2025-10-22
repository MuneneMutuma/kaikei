import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

type Props = {
  amount: string;
  setAmount: (v: string) => void;
  onQuickSet?: (v: number) => void;
};

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

const AmountStep: React.FC<Props> = ({ amount, setAmount, onQuickSet }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Enter Amount (KES)</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="e.g. 250"
        keyboardType="numeric"
        placeholderTextColor="#999"
        style={styles.input}
      />

      <View style={styles.quickRow}>
        {QUICK_AMOUNTS.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => {
              onQuickSet?.(v);
            }}
            style={styles.chip}
          >
            <Text style={styles.chipText}>+{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  label: { fontSize: 16, color: "#333", marginBottom: 8 },
  input: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 10,
    borderColor: "#DDD",
    borderWidth: 1,
    fontSize: 18,
    color: "#222",
  },
  quickRow: { flexDirection: "row", marginTop: 12, flexWrap: "wrap" },
  chip: { backgroundColor: "#EEE", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  chipText: { color: "#222", fontWeight: "600" },
});

export default AmountStep;
