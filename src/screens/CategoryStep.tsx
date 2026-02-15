import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from "react-native";
import {
  ShoppingBag,
  Fuel,
  Utensils,
  Wrench,
  Zap,
  Smartphone,
  MoreHorizontal,
  Bus,
  Home,
  HeartPulse,
  ShoppingBasket,
  Coins,
  Download,
  Plus
} from 'lucide-react-native';
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 64) / 3;

const SPECIAL_ACTIONS = [
  { id: "import", name: "Import SMS", color: colors.primary, icon: Download, type: 'action' },
  { id: "add_new", name: "New Category", color: colors.textSecondary, icon: Plus, type: 'action' },
];

export const getCategoryIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('stock')) return ShoppingBag;
  if (n.includes('fuel')) return Fuel;
  if (n.includes('food') || n.includes('meal')) return Utensils;
  if (n.includes('transport') || n.includes('mate') || n.includes('fare')) return Bus;
  if (n.includes('rent') || n.includes('home')) return Home;
  if (n.includes('airtime') || n.includes('data')) return Smartphone;
  if (n.includes('repair') || n.includes('service')) return Wrench;
  if (n.includes('health') || n.includes('hospital')) return HeartPulse;
  if (n.includes('util') || n.includes('kplc') || n.includes('water')) return Zap;
  if (n.includes('shop')) return ShoppingBasket;
  if (n.includes('float') || n.includes('mpesa')) return Coins;
  return MoreHorizontal;
};

export const getCategoryColor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('stock')) return "#4CAF50";
  if (n.includes('fuel')) return "#FF9800";
  if (n.includes('food') || n.includes('meal')) return "#E91E63";
  if (n.includes('transport')) return "#2196F3";
  if (n.includes('rent')) return "#9C27B0";
  if (n.includes('airtime')) return "#009688";
  if (n.includes('repair')) return "#795548";
  if (n.includes('health')) return "#F44336";
  if (n.includes('util')) return "#607D8B";
  if (n.includes('shop')) return "#FF5722";
  if (n.includes('float')) return "#3F51B5";
  return "#9E9E9E";
};

const CategoryStep: React.FC<{
  categories: any[];
  selectedCategory: any | null;
  onSelect: (c: any) => void;
}> = ({ categories, selectedCategory, onSelect }) => {
  const formattedCategories = categories.map(c => ({
    ...c,
    icon: getCategoryIcon(c.name),
    color: getCategoryColor(c.name),
    type: 'category'
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. Quick Action Bar (Horizontal) */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
      </View>
      <View style={styles.actionRow}>
        {SPECIAL_ACTIONS.map((item, index) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.7}
              onPress={() => onSelect(item)}
              style={[
                styles.actionChip,
                index === 0 && { marginRight: 12 } // Add spacing between the two items
              ]}
            >
              <View style={styles.actionIcon}>
                <Icon size={20} color={item.color} />
              </View>
              <Text style={styles.actionText}>{item.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 2. Scrollable Category Grid */}
      <View style={[styles.sectionHeader, { marginTop: 4 }]}>
        <Text style={styles.sectionTitle}>CATEGORIES</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridContainer}
      >
        <View style={styles.grid}>
          {formattedCategories.map((item) => {
            const selected = selectedCategory?.id === item.id;
            const Icon = item.icon;

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => onSelect(item)}
                style={[
                  styles.card,
                  selected ? { backgroundColor: item.color, borderColor: item.color } : undefined
                ]}
              >
                <View style={[
                  styles.iconCircle,
                  selected ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: '#F3F4F6' }
                ]}>
                  <Icon size={24} color={selected ? '#FFF' : item.color} />
                </View>
                <Text
                  style={[styles.cardText, selected ? { color: "#FFF" } : undefined]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    paddingHorizontal: 4,
    marginBottom: 12,
    paddingTop: 40, // EXPLICIT FIX: Clears progress bar
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1.2,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16, // Standard horizontal padding
    paddingVertical: 2,
    marginBottom: 4
  },
  actionChip: {
    flex: 1, // Equal width split
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 14, // Balanced height
    paddingHorizontal: 12,
    borderRadius: 14,
    // marginRight is handled in the map to avoid trailing margin issues on the last item if we added more
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'center'
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  gridContainer: {
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: ITEM_SIZE,
    aspectRatio: 1,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  cardText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    textAlign: 'center'
  },
});

export default CategoryStep;
