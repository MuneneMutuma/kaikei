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
import { AutoClassifier } from '../services/intelligence/AutoClassifier';
import { SmartSuggestionCard } from "../components/SmartSuggestionCard";
import { SmartOnboardingService, PayeeCandidate } from "../services/intelligence/SmartOnboardingService";

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
  // 1. State Declarations (Must be first)
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [topCategory, setTopCategory] = useState<{ name: string, amount: number, percent: number } | undefined>(undefined);
  const [breakdownData, setBreakdownData] = useState<any[]>([]);

  // Smart Onboarding State
  const [suggestion, setSuggestion] = useState<PayeeCandidate | null>(null);
  const [isUpdatingSuggestion, setIsUpdatingSuggestion] = useState(false);
  const onboardingService = React.useMemo(() => new SmartOnboardingService(), []);

  // Classifier State (Moved up)
  const [classifierStatus, setClassifierStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Edit / Details State
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // 2. Memos
  /* Use useMemo for repo to avoid re-instantiation */
  const repo = React.useMemo(() => new ExpenseRepository(), []);

  // 3. Handlers (must be defined before being used in Effects or Callbacks)
  // 3. Handlers
  const fetchData = useCallback(async () => {
    setLoading(true);

    // Auto-fix internal transfers
    await repo.scanAndFlagInternalTransfers();

    // Check for Smart Suggestions (Onboarding)
    try {
      const suggestions = onboardingService.getTopPayees(1);
      if (suggestions.length > 0) {
        setSuggestion(suggestions[0]);
      } else {
        setSuggestion(null);
      }
    } catch (e) {
      console.log("Error fetching suggestion:", e);
    }

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const data = repo.getExpensesByMonth(currentMonth);

    // Sort desc date
    data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setExpenses(data);

    // Calculate Stats
    const expenseItems = data.filter(item =>
      item.type !== 'income' && !item.excludeFromAnalytics
    );
    const total = expenseItems.reduce((sum, item) => sum + item.amount, 0);
    setTotalSpent(total);

    const incomeItems = data.filter(item =>
      item.type === 'income' && !item.excludeFromAnalytics
    );
    const income = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    setTotalIncome(income);

    if (total > 0) {
      const catMap = new Map<string, number>();
      expenseItems.forEach(item => {
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

    setCategories(repo.getAllCategories());
    setLoading(false);
  }, [repo, onboardingService]);

  const handleConfirmSuggestion = async () => {
    if (!suggestion || !editCategoryId) {
      Alert.alert("Select Category", "Please pick a category first.");
      return;
    }
    setIsUpdatingSuggestion(true);
    try {
      const count = await onboardingService.labelPayee(suggestion.name, editCategoryId);
      Alert.alert("Awesome! 🚀", `Categorized ${count} transactions for ${suggestion.name}.`);
      setSuggestion(null); // Dismiss
      setEditCategoryId(""); // Reset
      fetchData(); // Refresh UI
    } catch (e) {
      Alert.alert("Error", "Failed to update transactions.");
    } finally {
      setIsUpdatingSuggestion(false);
    }
  };

  const handleOpenDetails = useCallback((expense: Expense) => {
    console.log("Opening details for:", expense.id);
    setSelectedExpense(expense);
    setEditDescription(expense.description);
    setEditCategoryId(expense.categoryId);
    setDetailModalVisible(true);
  }, []);

  const handleUpdate = useCallback(async () => {
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
  }, [selectedExpense, editDescription, editCategoryId, repo, fetchData]);

  const handleDelete = useCallback(async () => {
    if (!selectedExpense) return;
    try {
      await repo.deleteExpense(selectedExpense.id);
      setDetailModalVisible(false);
      fetchData(); // Refresh UI
      Alert.alert("Success", "Transaction deleted.");
    } catch (e) {
      Alert.alert("Error", "Failed to delete.");
    }
  }, [selectedExpense, repo, fetchData]);

  const handleReset = useCallback(() => {
    Alert.alert(
      "Reset All Data",
      "Are you sure you want to delete ALL transactions? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            await repo.clearAll();
            fetchData();
            Alert.alert("Success", "All data has been cleared.");
          }
        }
      ]
    );
  }, [repo, fetchData]);

  // 4. Effects
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  useEffect(() => {
    // Start Classifier
    const classifier = AutoClassifier.getInstance();
    // setTimeout(() => classifier.start(), 2000); // Delay start slightly

    const unsub = classifier.addListener((status, processing) => {
      setClassifierStatus(status);
      setIsProcessing(processing);
    });

    // Auto-start if we have a model
    classifier.start();

    return () => {
      classifier.stop();
      unsub();
    };
  }, []);

  // 5. Render Callbacks
  const renderItem = useCallback(({ item }: { item: Expense }) => {
    const isIncome = item.type === 'income';

    let displayName = item.description;
    if (isIncome && item.sender && item.sender !== 'Unknown') {
      displayName = item.sender;
    } else if (!isIncome && item.recipient && item.recipient !== 'Unknown') {
      displayName = item.recipient;
    }

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        delayPressIn={0}
        onPress={() => handleOpenDetails(item)}
      >
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{getCategoryIcon(item.categoryName || '')}</Text>
        </View>
        <View style={styles.cardContent}>
          <View style={styles.row}>
            <Text style={styles.description} numberOfLines={1}>{displayName}</Text>
            <Text style={[styles.amount, isIncome ? { color: '#4CAF50' } : {}]}>
              {isIncome ? '+' : '-'} {item.amount.toLocaleString()}
            </Text>
          </View>
          <Text style={styles.date}>{new Date(item.date).toLocaleDateString()} • {item.categoryName || 'Uncategorized'}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [handleOpenDetails]); // Dep on repo? No, on handleOpenDetails. Assuming handleOpenDetails is stable? It uses state setters, so yes.

  const HeaderComponent = useCallback(() => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Karibu, User</Text>
          <Text style={styles.personaBadge}>Personal Finance</Text>
          {isProcessing && (
            <Text style={{ fontSize: 10, color: '#2196F3', marginTop: 4 }}>🤖 {classifierStatus}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate("AddExpense", { initialMode: 'voice' })}>
          <Text style={{ fontSize: 20 }}>🎙️</Text>
        </TouchableOpacity>
      </View>

      {/* Smart Suggestion Card */}
      {suggestion && (
        <SmartSuggestionCard
          payeeName={suggestion.name}
          count={suggestion.count}
          sampleTx={suggestion.sample}
          isUpdating={isUpdatingSuggestion}
          selectedCategoryName={categories.find(c => c.id === editCategoryId)?.name}
          onSelectCategory={() => {
            setEditCategoryId(""); // Ensure clear before opening
            setCategoryModalVisible(true);
          }}
          onDismiss={() => setSuggestion(null)}
          onConfirm={handleConfirmSuggestion}
        />
      )}

      <SummaryCard
        month={new Date().toLocaleDateString(undefined, { month: 'long' })}
        totalSpent={totalSpent}
        totalIncome={totalIncome}
        topCategory={topCategory}
      />

      <View style={styles.actionContainer}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('SmsReader')}>
          <Text style={styles.actionIcon}>📥</Text>
          <Text style={styles.actionLabel}>Import</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Analytics')}>
          <Text style={styles.actionIcon}>📊</Text>
          <Text style={styles.actionLabel}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert("Coming Soon", "Budgeting feature in progress!")}>
          <Text style={styles.actionIcon}>🎯</Text>
          <Text style={styles.actionLabel}>Budget</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Advice')}>
          <Text style={styles.actionIcon}>💡</Text>
          <Text style={styles.actionLabel}>Advice</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("ModelDownload")}>
          <Text style={styles.actionIcon}>🤖</Text>
          <Text style={styles.actionLabel}>AI Model</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleReset}>
          <Text style={styles.actionIcon}>🗑️</Text>
          <Text style={styles.actionLabel}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Analytics Section */}
      {totalSpent > 0 && (
        <CategoryBreakdown data={breakdownData} total={totalSpent} />
      )}

      <Text style={styles.sectionTitle}>Recent Transactions</Text>
    </View>
  ), [
    totalSpent,
    totalIncome,
    topCategory,
    breakdownData,
    isProcessing,
    classifierStatus,
    handleReset,
    suggestion,
    categories,
    editCategoryId,
    isUpdatingSuggestion
  ]); // Dependencies updated to prevent stale closures

  return (
    <View style={styles.container}>
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={HeaderComponent}
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

            {/* Flow Indicator */}
            {selectedExpense && (selectedExpense.sender || selectedExpense.recipient) && (
              <View style={{ backgroundColor: '#E3F2FD', padding: 12, borderRadius: 8, marginVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: '#1565C0', fontWeight: 'bold' }}>
                  {selectedExpense.sender || 'You'}  ➡️  {selectedExpense.recipient || 'You'}
                </Text>
              </View>
            )}

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

            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#FFEBEE', marginTop: 10 }]} onPress={handleDelete}>
              <Text style={[styles.saveBtnText, { color: '#F44336' }]}>Delete Transaction</Text>
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
  emptyText: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  emptySubText: { fontSize: 14, color: '#999', marginTop: 5 }
});

