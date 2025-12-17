import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert
} from "react-native";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { Expense, Category } from "../services/ledger/Schema";
import { useFocusEffect } from '@react-navigation/native';
import SummaryCard from "../components/SummaryCard";
import CategoryBreakdown from "../components/CategoryBreakdown";

const getCategoryIcon = (name: string) => {
  switch (name?.toLowerCase()) {
    case 'food': return '🍔';
    case 'transport': return '🚕';
    case 'shopping': return '🛍️';
    case 'entertainment': return '🎬';
    case 'bills': return '🧾';
    case 'health': return '💊';
    default: return '💸';
  }
};

const getCategoryColor = (name: string) => {
  switch (name?.toLowerCase()) {
    case 'food': return '#FF9800';
    case 'transport': return '#2196F3';
    case 'shopping': return '#E91E63';
    case 'entertainment': return '#9C27B0';
    case 'bills': return '#F44336';
    default: return '#607D8B';
  }
};

export default function HomeScreen({ navigation }: any) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);
  const [topCategory, setTopCategory] = useState<{ name: string, amount: number, percent: number } | undefined>(undefined);
  const [breakdownData, setBreakdownData] = useState<any[]>([]);

  // Edit / Details State
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const repo = new ExpenseRepository();

  const fetchData = async () => {
    setLoading(true);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const data = repo.getExpensesByMonth(currentMonth);

    // Sort desc date
    data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setExpenses(data);

    // Calculate Stats
    const total = data.reduce((sum, item) => sum + item.amount, 0);
    setTotalSpent(total);

    if (total > 0) {
      const catMap = new Map<string, number>();
      data.forEach(item => {
        const current = catMap.get(item.categoryName || 'Other') || 0;
        catMap.set(item.categoryName || 'Other', current + item.amount);
      });

      const stats: any[] = [];
      let topName = '';
      let topAmount = 0;

      catMap.forEach((amt, name) => {
        if (amt > topAmount) {
          topAmount = amt;
          topName = name;
        }
        stats.push({
          name,
          amount: amt,
          percent: Math.round((amt / total) * 100),
          color: getCategoryColor(name),
          icon: getCategoryIcon(name),
        });
      });

      setTopCategory({
        name: topName,
        amount: topAmount,
        percent: Math.round((topAmount / total) * 100)
      });
      setBreakdownData(stats);
    } else {
      setTopCategory(undefined);
      setBreakdownData([]);
    }

    // Load Categories for editing
    setCategories(repo.getAllCategories());

    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const handleOpenDetails = (expense: Expense) => {
    setSelectedExpense(expense);
    setEditDescription(expense.description);
    setEditCategoryId(expense.categoryId);
    setDetailModalVisible(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedExpense) return;
    try {
      await repo.updateExpense(selectedExpense.id, {
        description: editDescription,
        categoryId: editCategoryId
      });
      setDetailModalVisible(false);
      fetchData(); // Refresh UI
      Alert.alert("Success", "Transaction updated.");
    } catch (e) {
      Alert.alert("Error", "Failed to update transaction.");
    }
  };

  const renderItem = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => handleOpenDetails(item)}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{getCategoryIcon(item.categoryName || '')}</Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.row}>
          <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.amount}>- {item.amount.toLocaleString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.category}>{item.categoryName || 'Uncategorized'}</Text>
          <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Karibu, User</Text>
          <Text style={styles.personaBadge}>Personal Finance</Text>
        </View>
        <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate("VoiceInput")}>
          <Text style={{ fontSize: 20 }}>🎙️</Text>
        </TouchableOpacity>
      </View>

      <SummaryCard
        month={new Date().toLocaleDateString(undefined, { month: 'long' })}
        totalSpent={totalSpent}
        topCategory={topCategory}
      />

      <View style={styles.actionContainer}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('SmsReader')}>
          <Text style={styles.actionIcon}>📥</Text>
          <Text style={styles.actionLabel}>Import</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>📊</Text>
          <Text style={styles.actionLabel}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>🎯</Text>
          <Text style={styles.actionLabel}>Budget</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("ModelDownload")}>
          <Text style={styles.actionIcon}>🤖</Text>
          <Text style={styles.actionLabel}>AI Model</Text>
        </TouchableOpacity>
      </View>

      {/* Analytics Section */}
      {totalSpent > 0 && (
        <CategoryBreakdown data={breakdownData} total={totalSpent} />
      )}

      <Text style={styles.sectionTitle}>Recent Transactions</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchData} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyText}>No expenses yet this month.</Text>
            <Text style={styles.emptySubText}>Tap Voice to start tracking!</Text>
          </View>
        }
      />

      {/* Edit Details Drawer */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDetailModalVisible(false)}
        >
          <View style={styles.drawerContainer}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Edit Transaction</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={styles.detailValue}>Ksh {selectedExpense?.amount.toLocaleString()}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{selectedExpense ? new Date(selectedExpense.date).toLocaleDateString() : ''}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={styles.input}
              value={editDescription}
              onChangeText={setEditDescription}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setCategoryModalVisible(true)}
            >
              <Text>{categories.find(c => c.id === editCategoryId)?.name || 'Select Category'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveChanges}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Category Picker Modal */}
      <Modal visible={categoryModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.drawerContainer, { height: '50%', paddingBottom: 40 }]}>
            <Text style={styles.drawerTitle}>Select Category</Text>
            <FlatList
              data={categories}
              keyExtractor={c => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.catItem} onPress={() => {
                  setEditCategoryId(item.id);
                  setCategoryModalVisible(false);
                }}>
                  <Text style={styles.catText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setCategoryModalVisible(false)}>
              <Text>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F7' },
  list: { paddingBottom: 20 },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  welcome: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  personaBadge: { fontSize: 14, color: '#666', backgroundColor: '#E0E0E0', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  profileButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  
  actionContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20, paddingHorizontal: 10 },
  actionBtn: { alignItems: 'center', width: 70 },
  actionIcon: { fontSize: 24, marginBottom: 8, backgroundColor: 'white', padding: 12, borderRadius: 16, overflow: 'hidden', textAlign: 'center', width: 50, height: 50 },
  actionLabel: { fontSize: 12, color: '#333', fontWeight: '500' },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 20, marginBottom: 10, paddingHorizontal: 20 },
  
  card: { flexDirection: 'row', backgroundColor: 'white', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  icon: { fontSize: 20 },
  cardContent: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  description: { fontSize: 16, fontWeight: '600', color: '#333', flex: 1, marginRight: 10 },
  amount: { fontSize: 16, fontWeight: 'bold', color: '#F44336' },
  category: { fontSize: 12, color: '#666', backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  date: { fontSize: 12, color: '#999' },

  // Drawer & Modal Styles (Reused)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawerContainer: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, width: '100%', paddingBottom: 40, maxHeight: '90%' },
  drawerHandle: { width: 40, height: 5, backgroundColor: '#ddd', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  drawerTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#333', textAlign: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  detailLabel: { color: '#888', fontWeight: '500' },
  detailValue: { fontWeight: '600', color: '#333' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  inputLabel: { fontSize: 12, color: '#666', marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, color: '#333', borderWidth: 1, borderColor: '#eee' },
  saveBtn: { backgroundColor: '#2196F3', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: 'white', fontWeight: 'bold' },
  catItem: { padding: 15, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  catText: { fontSize: 16 },
  closeBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyIcon: { fontSize: 50, marginBottom: 10 },
  emptyText: { fontSize: 16, fontWeight: 'bold', color: '#555' }
});

