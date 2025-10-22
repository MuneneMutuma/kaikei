import React from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";

type Category = { id: string; name: string; color: string };

const CATEGORIES: Category[] = [
  { id: "1", name: "Stock", color: "#4CAF50" },
  { id: "2", name: "Fuel", color: "#FF9800" },
  { id: "3", name: "Meals", color: "#E91E63" },
  { id: "4", name: "Repairs", color: "#2196F3" },
  { id: "5", name: "Float", color: "#9C27B0" },
  { id: "6", name: "Airtime", color: "#009688" },
  { id: "7", name: "Other", color: "#607D8B" },
];

const CategoryStep: React.FC<{
  selectedCategory: Category | null;
  onSelect: (c: Category) => void;
}> = ({ selectedCategory, onSelect }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Select Category</Text>

      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => {
          const selected = selectedCategory?.id === item.id;
          return (
            <TouchableOpacity
              onPress={() => onSelect(item)}
              style={[styles.chip, selected ? { backgroundColor: item.color } : undefined]}
            >
              <Text style={[styles.chipText, selected ? { color: "#FFF" } : undefined]} numberOfLines={1} ellipsizeMode="tail">
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  label: { fontSize: 16, color: "#333", marginBottom: 8 },
  chip: {
    backgroundColor: "#EEE",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    maxWidth: 120,
  },
  chipText: { color: "#222", fontWeight: "600" },
});

export default CategoryStep;
