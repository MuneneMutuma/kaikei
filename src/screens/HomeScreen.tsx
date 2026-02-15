import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  RefreshControl, Alert, Modal, InteractionManager, TextInput, Platform, StatusBar
} from 'react-native';
import { View as MotiView } from 'moti';

import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { Expense, Category } from "../services/ledger/Schema";
import { useFocusEffect } from '@react-navigation/native';
import { AutoClassifier } from '../services/intelligence/AutoClassifier';
import { SuggestionDeck } from "../components/SuggestionDeck";
import { SmartOnboardingService, PayeeCandidate } from "../services/intelligence/SmartOnboardingService";
import HomeHeader from "../components/HomeHeader";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { IngestionEvents, INGESTION_EVENT } from "../services/ingestion/IngestionEvents";

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

interface SectionData {
  title: string;
  data: Expense[];
}

export default function HomeScreen({ route, navigation }: any) {
  // 1. Params & State
  const { name: userName = "User" } = route.params || {};

  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [lastDataHash, setLastDataHash] = useState<string>(''); // For Preventing Re-renders

  // Smart Onboarding State
  const [suggestions, setSuggestions] = useState<PayeeCandidate[]>([]);
  const [lastSuggestionHash, setLastSuggestionHash] = useState<string>(''); // For Preventing Re-renders
  const [suggestion, setSuggestion] = useState<PayeeCandidate | null>(null); // Track active one for Modal
  const [isUpdatingSuggestion, setIsUpdatingSuggestion] = useState(false);
  const onboardingService = React.useMemo(() => new SmartOnboardingService(), []);

  // Classifier State
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
  const repo = React.useMemo(() => new ExpenseRepository(), []);

  // 3. Handlers
  const fetchData = useCallback(async () => {
    // Only show spinner on initial load or manual refresh
    // Don't flicker spinner on focus updates if data is cached

    try {
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const allExpenses = await repo.getExpensesByMonth(monthStr);

      // Compute Hash to avoid unnecessary re-renders
      // Simple hash: Count + Total Amount + Timestamp of newest item
      const count = allExpenses.length;
      if (count === 0) {
        if (sections.length > 0) {
          setSections([]);
          setTotalSpent(0);
          setTotalIncome(0);
          setLastDataHash('empty');
        }
        return;
      }

      const newestTimestamp = allExpenses.length > 0 ? allExpenses[0].id : ''; // Assuming ID is time-based or use date
      const totalAmount = allExpenses.reduce((sum, e) => sum + e.amount, 0);
      const newHash = `${count}-${totalAmount}-${newestTimestamp}`;

      if (newHash === lastDataHash) {
        console.log("[HomeScreen] Data matches hash, skipping render.");
        return;
      }

      console.log(`[HomeScreen] Data changed (Hash: ${newHash}). Updating UI.`);
      setLastDataHash(newHash);
      setLoading(true); // Only show loading if we are actually updating

      // Calculate Totals
      const spent = allExpenses
        .filter(e => e.type === 'expense' && !e.excludeFromAnalytics)
        .reduce((sum, e) => sum + e.amount, 0);

      const income = allExpenses
        .filter(e => e.type === 'income' && !e.excludeFromAnalytics)
        .reduce((sum, e) => sum + e.amount, 0);

      setTotalSpent(spent);
      setTotalIncome(income);

      // Group by Date for SectionList
      const grouped = allExpenses.reduce((acc, expense) => {
        const dateKey = new Date(expense.date).toLocaleDateString(); // Simple grouping
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(expense);
        return acc;
      }, {} as Record<string, Expense[]>);

      // Sort Sections by Date (Desc)
      const sortedSections: SectionData[] = Object.keys(grouped)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .map(date => {
          // Friendly Labels
          const d = new Date(date);
          const today = new Date();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          let title = date;
          if (d.toDateString() === today.toDateString()) title = "Today";
          else if (d.toDateString() === yesterday.toDateString()) title = "Yesterday";

          return { title, data: grouped[date] };
        });

      setSections(sortedSections);

      // Load Categories
      const cats = await repo.getAllCategories();
      setCategories(cats);
      setLoading(false);

    } catch (e) {
      console.error("Failed to load home data", e);
      setLoading(false);
    }

    // Heavy Background Tasks
    // Run these AFTER UI update or independently
    setTimeout(async () => {
      await repo.scanAndFlagInternalTransfers();
      try {
        // Fetch TOP 5 Suggestions for the Deck
        const suggs = await onboardingService.getTopPayees(5);
        // Only update suggestions if count changed (simple check)
        // Ideally should check content too but this is a start
        setSuggestions(suggs);
      } catch (e) {
        console.log("Error fetching suggestions:", e);
      }
    }, 500);

  }, [repo, onboardingService, lastDataHash, sections.length]);

  const handleConfirmSuggestion = async (candidate: PayeeCandidate, catId: string) => {
    // Use passed candidate/catId or fallback to state?
    // The Deck calls this with specific args
    const targetName = candidate?.name || suggestion?.name;
    const targetCat = catId || editCategoryId;

    if (!targetName || !targetCat) {
      Alert.alert("Select Category", "Please pick a category first.");
      return;
    }
    setIsUpdatingSuggestion(true);
    try {
      const count = await onboardingService.labelPayee(targetName, targetCat);
      Alert.alert("Awesome! 🚀", `Categorized ${count} transactions.`);

      // Remove from local list immediately
      setSuggestions(prev => prev.filter(s => s.name !== targetName));
      setSuggestion(null);
      setEditCategoryId("");

      // Refresh Data (to show new categories in list)
      fetchData();
    } catch (e) {
      Alert.alert("Error", "Failed to update.");
    } finally {
      setIsUpdatingSuggestion(false);
    }
  };

  const handleOpenDetails = useCallback((expense: Expense) => {
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
      fetchData();
    } catch (e) {
      Alert.alert("Error", "Update failed.");
    }
  }, [selectedExpense, editDescription, editCategoryId, repo, fetchData]);

  const handleDelete = useCallback(async () => {
    if (!selectedExpense) return;
    try {
      await repo.deleteExpense(selectedExpense.id);
      setDetailModalVisible(false);
      fetchData();
    } catch (e) {
      Alert.alert("Error", "Delete failed.");
    }
  }, [selectedExpense, repo, fetchData]);

  // 4. Effects
  useFocusEffect(
    useCallback(() => {
      // Ensure Status Bar is dark when on Home (light background)
      StatusBar.setBarStyle('dark-content');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('transparent');
        StatusBar.setTranslucent(true);
      }
      fetchData();
    }, [])
  );

  useEffect(() => {
    const classifier = AutoClassifier.getInstance();
    const unsub = classifier.addListener((status, processing) => {
      setClassifierStatus(status);
      setIsProcessing(processing);
    });
    classifier.start();
    return () => {
      classifier.stop();
      unsub();
    };
  }, []);

  // Subscribe to auto-ingestion events for live refresh
  useEffect(() => {
    const unsubTx = IngestionEvents.on(INGESTION_EVENT.TRANSACTION_INGESTED, () => {
      console.log('[HomeScreen] Auto-ingested transaction detected, refreshing...');
      setLastDataHash(''); // Force hash mismatch to trigger re-render
      fetchData();
    });
    const unsubCatchUp = IngestionEvents.on(INGESTION_EVENT.CATCH_UP_COMPLETE, (result: any) => {
      if (result?.imported > 0) {
        console.log(`[HomeScreen] Catch-up imported ${result.imported} transactions, refreshing...`);
        setLastDataHash('');
        fetchData();
      }
    });
    return () => {
      unsubTx();
      unsubCatchUp();
    };
  }, [fetchData]);

  // 5. Renderers
  const renderItem = useCallback(({ item, index }: { item: Expense, index: number }) => {
    const isIncome = item.type === 'income';
    let displayName = item.description;
    if (isIncome && item.sender && item.sender !== 'Unknown') displayName = item.sender;
    else if (!isIncome && item.recipient && item.recipient !== 'Unknown') displayName = item.recipient;

    return (
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{
          type: 'timing',
          duration: 350,
          delay: index * 50 // Stagger by 50ms
        }}
        style={{ marginBottom: 8, marginHorizontal: 16 }}
      >
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
              <Text style={styles.description} numberOfLines={1}>{displayName}</Text>
              <Text style={[styles.amount, isIncome ? { color: colors.success } : {}]}>
                {isIncome ? '+' : '-'} {item.amount.toLocaleString()}
              </Text>
            </View>
            <Text style={styles.date}>{item.categoryName || 'Uncategorized'}</Text>
          </View>
        </TouchableOpacity>
      </MotiView>
    );
  }, [handleOpenDetails]);

  const renderSectionHeader = useCallback(({ section: { title } }: { section: SectionData }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  ), []);

  const HeaderComponent = useCallback(() => (
    <View>
      {/* Smart Suggestion Deck */}
      {/* We pass the array of suggestions. The Deck manages cycling. 
          When we confirm, we remove from the list via fetch/refresh or local filter? 
          For now, refreshing data is safer but slower. 
      */}
      {suggestions.length > 0 && (
        <View style={{ marginTop: 10, marginBottom: 10, zIndex: 10 }}>
          <SuggestionDeck
            suggestions={suggestions}
            isUpdating={isUpdatingSuggestion}
            categories={categories}
            selectedCategoryId={editCategoryId}
            onSelectCategory={(item) => {
              setSuggestion(item);
              setEditCategoryId("");
              setCategoryModalVisible(true);
            }}
            onConfirm={handleConfirmSuggestion}
            onDismiss={(item) => {
              setSuggestions(prev => prev.filter(s => s.name !== item.name));
            }}
            onOpenDetails={(item) => navigation.navigate('SmartSuggestion', { name: item.name, count: item.count })}
          />
        </View>
      )}
    </View>
  ), [suggestions, categories, editCategoryId, isUpdatingSuggestion]);

  return (
    <View style={styles.container}>
      <HomeHeader userName={userName} totalSpent={totalSpent} totalIncome={totalIncome} />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={HeaderComponent}
        stickySectionHeadersEnabled={true}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 120 } // Extra space for Floating Tab Bar
        ]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyText}>No expenses yet.</Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailModalVisible(false)}>
          <View style={styles.drawerContainer}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Transaction Details</Text>

            {/* Simple Edit Form */}
            <Text style={styles.inputLabel}>Amount: Ksh {selectedExpense?.amount.toLocaleString()}</Text>

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={styles.input}
              value={editDescription}
              onChangeText={setEditDescription}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <TouchableOpacity style={styles.input} onPress={() => setCategoryModalVisible(true)}>
              <Text>{categories.find(c => c.id === editCategoryId)?.name || 'Uncategorized'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#FFEBEE', marginTop: 10 }]} onPress={handleDelete}>
              <Text style={[styles.saveBtnText, { color: colors.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>




    </View >
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 80 }, // Space for Tab Bar

  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    ...typography.subHeader,
    color: colors.textSecondary,
    fontSize: 14,
    textTransform: 'uppercase',
  },

  // Card Styles
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: { fontSize: 20 },
  cardContent: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  description: { ...typography.body, fontWeight: '600', color: colors.text, flex: 1 },
  amount: { ...typography.body, fontWeight: '700', color: colors.danger },
  date: { ...typography.caption, marginTop: 2 },

  // Empty State
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { ...typography.body, color: colors.textSecondary },

  // Modal (Drawer)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  drawerContainer: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  drawerHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  drawerTitle: { ...typography.header, textAlign: 'center', marginBottom: 20 },

  inputLabel: { ...typography.caption, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: colors.background, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },

  saveBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: 'white', fontWeight: 'bold' },

  catItem: { padding: 16, borderBottomWidth: 1, borderColor: colors.border },
  catText: { ...typography.body, fontSize: 16 },
});


