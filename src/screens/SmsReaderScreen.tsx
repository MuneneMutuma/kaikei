import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  PermissionsAndroid,
  Platform,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import SmsAndroid from "react-native-get-sms-android";
import { parseMpesaMessage, MpesaTransaction } from "../utils/mpesaParser";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { NaturalLanguageParser } from "../services/parser/NaturalLanguageParser";
import { Database } from "../services/ledger/Database";
import { Category, Expense } from "../services/ledger/Schema";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

const parseMpesaDate = (dateStr: string, timeStr?: string): string => {
  try {
    const [day, month, yearPart] = dateStr.split('/').map(Number);
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (isNaN(date.getTime())) throw new Error("Invalid date");
    return date.toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
};

export default function SMSReaderScreen() {
  const insets = useSafeAreaInsets();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [transactions, setTransactions] = useState<MpesaTransaction[]>([]);
  // State for IDs
  const [syncedTxIds, setSyncedTxIds] = useState<Set<string>>(new Set());
  const [ignoredTxIds, setIgnoredTxIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);

  // Edit/Detail Modal State
  const [selectedTx, setSelectedTx] = useState<MpesaTransaction | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // Helper to know if currently edited item is already synced (so we are editing an EXISTING expense)
  const [existingExpenseId, setExistingExpenseId] = useState<string | null>(null);

  const repo = useRef(new ExpenseRepository());
  const parser = useRef(new NaturalLanguageParser());

  useEffect(() => {
    Database.init();
    requestSMSPermission();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (permissionGranted) {
        loadMessages();
      }
    }, [permissionGranted])
  );

  const requestSMSPermission = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);
      const allGranted = Object.values(granted).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED
      );
      setPermissionGranted(allGranted);
    }
  };

  const loadMessages = async () => {
    if (!permissionGranted) return;
    setLoading(true);

    // 1. Load Ledger State
    const allCategories = repo.current.getAllCategories();
    setCategories(allCategories);

    // We could optimize this by fetching only relevant IDs, but for now filtering locally
    // Actually repo methods are async in our thought process but implementation was mixed. 
    // Let's assume we can fetch statuses.

    // Re-fetching expenses to map IDs is heavy. 
    // Better: We rely on `existsByTransactionId` mostly, but for list speed we should optimize.
    // Let's just fetch ALL textIds from DB for cache.
    // For now, simpler: Just load ignored. Synced we check differently or load last 100?

    const ignored = await repo.current.getIgnoredTransactionIds();
    setIgnoredTxIds(ignored);

    // For synced, we need to know WHICH ones are synced. 
    // Let's check the current batch against the DB manually or fetch all txIds (assuming < 1000)
    // A quick hack: Fetch recent expenses and map txId.
    // Ideally we add `getAllTransactionIds` to repo. 
    // I will iterate the SMS list and check existence in bulk or one by one? 
    // One by one is slow. 
    // Let's use `checkBatchStatus` - wait, I don't have that.

    // Fallback: Lazy load status? No, UI needs it. 
    // I already have `syncedTxIds` state. I should update it based on current View.

    // 116 -> 500 Limit
    const filter = {
      box: "inbox",
      address: "MPESA",
      maxCount: 1000, // Increased limit per user request
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (fail: any) => {
        console.log("Error:", fail);
        setLoading(false);
      },
      async (count: any, smsList: any) => {
        const arr = JSON.parse(smsList);
        const parsed = arr
          .map((msg: any) => parseMpesaMessage(msg.body))
          .filter(Boolean) as MpesaTransaction[];

        setTransactions(parsed);

        // Check Sync Status
        const newSynced = new Set<string>();
        for (const tx of parsed) {
          if (await repo.current.existsByTransactionId(tx.tx_id)) {
            newSynced.add(tx.tx_id);
          }
        }
        setSyncedTxIds(newSynced);
        setLoading(false);
      }
    );
  };

  const handleSelectAll = async () => {
    // Bulk Import Logic
    if (loading) return;
    setLoading(true);

    // Filter unsynced, unignored transactions (candidates)
    const candidates = transactions.filter(tx =>
      !syncedTxIds.has(tx.tx_id) && !ignoredTxIds.has(tx.tx_id)
    );

    if (candidates.length === 0) {
      Alert.alert("Info", "No new transactions to import.");
      setLoading(false);
      return;
    }

    // Confirm
    /* // Optional confirmation
    Alert.alert("Confirm Import", `Import ${candidates.length} transactions?`, [
        { text: "Cancel", onPress: () => setLoading(false) },
        { text: "Import", onPress: () => performBulkImport(candidates) }
    ]);
    */
    // Just do it for now (Toggle style)
    await performBulkImport(candidates);
  };

  const performBulkImport = async (candidates: MpesaTransaction[]) => {
    let count = 0;
    // Process in chunks to yield UI? JS is single threaded but we can use setTimeout or just await.
    // Await inside loop yields to microtasks, but not necessarily rendering if synchronous DB calls are heavy.
    // SQLite is async-ish (bridge).

    for (const tx of candidates) {
      try {
        // Re-use logic (abstracted ideally, but copying for safety/speed now)
        // 1. Predict Category (Fast Regex)
        const descriptionToParse = `${tx.from} ${tx.to} ${tx.type} `;
        const categorySuggestion = await parser.current.predictCategory(descriptionToParse);
        const categoryId = categorySuggestion?.id || repo.current.getCategoryByName('Other')?.id || 'unknown_cat';

        const cleanDesc = tx.direction === 'in'
          ? `Received from ${tx.from} `
          : `Paid to ${tx.to || tx.account || 'Unknown'} `;

        // NEW: Check internal
        const isInternal = tx.type === 'internal' || tx.direction === 'internal';

        // Determine Type (Income/Expense/Transfer)
        let type: 'income' | 'expense' | 'transfer' = 'expense';
        if (isInternal) {
          type = 'transfer';
        } else if (tx.direction === 'in') {
          type = 'income';
        } else if (tx.type === 'transfer') {
          type = 'transfer';
        }

        // Handle Transfer specifics
        if (type === 'transfer') {
          // If manual transfer, check sender/recip
          if (tx.from?.toUpperCase() === 'M-PESA') {
            // Outgoing transfer (M-Pesa -> Pochi)
            // Keeping it as 'transfer' essentially hides it from Expense/Income totals
          }
        }

        // Determine Sender / Recipient
        let sender = 'Unknown';
        let recipient = 'Unknown';

        if (type === 'income') {
          sender = tx.from;
          recipient = 'M-PESA'; // Or 'You'
        } else {
          sender = 'M-PESA'; // Or 'You'
          recipient = tx.to || tx.account || 'Unknown';
        }

        // 2. Add to Ledger
        await repo.current.addExpense({
          amount: tx.amount,
          date: parseMpesaDate(tx.date, tx.time),
          description: cleanDesc,
          categoryId: categoryId,
          source: 'mpesa',
          rawText: tx.raw_text,
          transactionId: tx.tx_id,
          excludeFromAnalytics: isInternal, // Prevent double counting for internal moves
          type: type,
          sender: sender,
          recipient: recipient
        });
        count++;
      } catch (e) {
        console.error("Failed to import", tx.tx_id, e);
      }
    }

    // Update State Once
    const newSynced = new Set(syncedTxIds);
    candidates.forEach(c => newSynced.add(c.tx_id));
    setSyncedTxIds(newSynced);
    setLoading(false);
    Alert.alert("Success", `Imported ${count} transactions.`);
  };

  const openDetails = (tx: MpesaTransaction) => {
    setSelectedTx(tx);
    // If synced, maybe load existing description/category?
    // For now, just show modal.
    setDetailModalVisible(true);
  };

  const handleToggleBusiness = async (item: MpesaTransaction) => {
    if (syncedTxIds.has(item.tx_id)) {
      // If already synced, maybe we want to un-sync? (Delete)
      // For now, assume toggle off = delete?
      // User requested "Select All" -> Import.
      // Usually toggle means On/Off.
      // Let's implement Delete for completeness if safe.
      Alert.alert("Actions", "Transaction already imported. Delete?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: 'destructive', onPress: async () => {
            await repo.current.deleteByTransactionId(item.tx_id);
            const next = new Set(syncedTxIds);
            next.delete(item.tx_id);
            setSyncedTxIds(next);
          }
        }
      ]);
      return;
    }

    // Import
    try {
      const descriptionToParse = `${item.from} ${item.to} ${item.type} `;
      const categorySuggestion = await parser.current.predictCategory(descriptionToParse);
      const categoryId = categorySuggestion?.id || repo.current.getCategoryByName('Other')?.id || 'unknown_cat';

      const cleanDesc = item.direction === 'in'
        ? `Received from ${item.from} `
        : `Paid to ${item.to || item.account || 'Unknown'} `;

      const isInternal = item.type === 'internal' || item.direction === 'internal';

      await repo.current.addExpense({
        amount: item.amount,
        date: parseMpesaDate(item.date, item.time),
        description: cleanDesc,
        categoryId: categoryId,
        source: 'mpesa',
        rawText: item.raw_text,
        transactionId: item.tx_id,
        excludeFromAnalytics: isInternal, // Prevent double counting for internal moves
        type: type // Explicitly set type
      });

      // Update Set
      const next = new Set(syncedTxIds);
      next.add(item.tx_id);
      setSyncedTxIds(next);

      // If it was ignored, unignore
      if (ignoredTxIds.has(item.tx_id)) {
        await repo.current.unIgnoreTransaction(item.tx_id);
        const nextIgnored = new Set(ignoredTxIds);
        nextIgnored.delete(item.tx_id);
        setIgnoredTxIds(nextIgnored);
      }

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to import.");
    }
  };

  const renderItem = ({ item }: { item: MpesaTransaction }) => {
    const isSynced = syncedTxIds.has(item.tx_id);
    const isIgnored = ignoredTxIds.has(item.tx_id);

    // M-Pesa Centric Direction Logic
    let isIncome = item.direction === 'in';
    let displayParty = isIncome ? item.from : (item.to || item.account || "Unknown");

    if (item.type === 'internal' || item.direction === 'internal' || item.type === 'transfer') {
      // Internal Transfer Logic:
      // M-PESA is the center.
      if (item.from?.toUpperCase() === 'M-PESA') {
        // Moving FROM M-Pesa -> Other (e.g. Pochi)
        isIncome = false; // Outgoing visual
        displayParty = `Transfer to ${item.to || 'Internal Account'}`;
      } else {
        // Moving TO M-Pesa (from Pochi/Mshwari)
        isIncome = true; // Incoming visual
        displayParty = `Transfer from ${item.from || 'Internal Account'}`;
      }
    }

    return (
      <TouchableOpacity
        style={[styles.card, isIgnored && styles.cardIgnored]}
        onPress={() => openDetails(item)}
        activeOpacity={0.9}
      >
        <View style={styles.cardHeader}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{isIncome ? '📥' : '📤'}</Text>
          </View>

          {/* Content */}
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.party} numberOfLines={1}>
              {displayParty}
            </Text>
            <View style={styles.rowMeta}>
              <Text style={styles.date}>{item.date} • {item.time}</Text>
            </View>
            <Text style={[styles.amount, isIncome ? styles.textGreen : styles.textBlack]}>
              {isIncome ? '+' : '-'} {item.amount.toLocaleString()}
            </Text>
          </View>

          {/* Toggle (Checkbox) */}
          <TouchableOpacity
            style={[styles.checkbox, isSynced ? styles.checkboxChecked : styles.checkboxUnchecked]}
            onPress={() => handleToggleBusiness(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.checkboxIcon}>{isSynced ? '✓' : ''}</Text>
          </TouchableOpacity>
        </View>

        {/* Status Text (Optional, small) */}
        {isSynced && (
          <Text style={styles.miniStatus}>Business</Text>
        )}
        {isIgnored && (
          <Text style={styles.miniStatusPersonal}>Personal</Text>
        )}
      </TouchableOpacity>
    );
  };

  // Render Header Update
  // ...
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Imports</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>{transactions.length} messages found</Text>
        </View>
        <TouchableOpacity
          style={[styles.checkbox, { width: 'auto', paddingHorizontal: 10, borderColor: colors.primary, borderWidth: 1 }]}
          onPress={handleSelectAll}
        >
          <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Import All</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        // ... same ...
        data={transactions}
        keyExtractor={(item) => item.tx_id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadMessages} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 50 }}>📭</Text>
            <Text style={{ color: '#888', marginTop: 10 }}>No messages found</Text>
          </View>
        }
      />

      {/* Details Modal (Bottom Sheet style) */}
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
            <Text style={styles.drawerTitle}>Transaction Details</Text>

            {selectedTx && (
              <View>
                {/* Header Section */}
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ fontSize: 14, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{selectedTx.type}</Text>
                  <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#111', marginVertical: 5 }}>
                    {selectedTx.direction === 'in' ? '+' : '-'} {selectedTx.amount.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 16, color: '#333' }}>
                    {selectedTx.from || selectedTx.to}
                  </Text>
                </View>

                {/* Details Grid */}
                <View style={styles.detailGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{selectedTx.date}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Time</Text>
                    <Text style={styles.detailValue}>{selectedTx.time}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Transaction ID</Text>
                    <Text style={styles.detailValue}>{selectedTx.tx_id}</Text>
                  </View>
                  {selectedTx.account ? (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Account / Ref</Text>
                      <Text style={styles.detailValue}>{selectedTx.account}</Text>
                    </View>
                  ) : null}
                  {selectedTx.tx_cost ? (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Fee</Text>
                      <Text style={styles.detailValue}>{selectedTx.tx_cost}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Balances */}
                {(selectedTx.balances?.mpesa || selectedTx.balances?.pochi) && (
                  <View style={styles.balanceContainer}>
                    <Text style={styles.balanceTitle}>Balances</Text>
                    {selectedTx.balances.mpesa !== undefined && (
                      <View style={styles.rowBetween}>
                        <Text style={styles.balanceLabel}>M-PESA</Text>
                        <Text style={styles.balanceValue}>{selectedTx.balances.mpesa.toLocaleString()}</Text>
                      </View>
                    )}
                    {selectedTx.balances.pochi !== undefined && (
                      <View style={styles.rowBetween}>
                        <Text style={styles.balanceLabel}>Pochi</Text>
                        <Text style={styles.balanceValue}>{selectedTx.balances.pochi.toLocaleString()}</Text>
                      </View>
                    )}
                  </View>
                )}

                {syncedTxIds.has(selectedTx.tx_id) ? (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.sectionHeader}>Legger Entry</Text>

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

                    <TouchableOpacity style={styles.saveBtn} onPress={() => {
                      Alert.alert("Coming Soon", "Edit functionality is mapped but awaiting API.");
                      setDetailModalVisible(false);
                    }}>
                      <Text style={styles.saveBtnText}>Update Entry</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.drawerActions}>
                    <Text style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', marginTop: 20 }}>
                      Toggle the checkbox on the list to add this to your business ledger.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Category Picker Modal */}
      <Modal visible={categoryModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.drawerContainer, { paddingBottom: 40 }]}>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border },
  title: { ...typography.header, fontSize: 18, color: colors.text },
  listContent: { padding: 16, paddingBottom: Platform.OS === 'android' ? 100 : 80 },

  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: colors.primary, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardIgnored: { opacity: 0.7, backgroundColor: colors.background },
  cardHeader: { flexDirection: 'row', alignItems: 'center' }, // Removed marginBottom to keep it tight
  iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  icon: { fontSize: 18, color: colors.text },
  party: { ...typography.body, fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  date: { ...typography.caption, fontSize: 12, color: colors.textSecondary },
  amount: { ...typography.mono, fontSize: 15, fontWeight: 'bold', marginTop: 2 },
  textGreen: { color: colors.success },
  textBlack: { color: colors.text },

  // Toggle Checkbox
  checkbox: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxUnchecked: { backgroundColor: 'transparent', borderColor: '#ccc' },
  checkboxIcon: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  miniStatus: { fontSize: 10, color: colors.primary, fontWeight: 'bold', marginTop: 8, marginLeft: 52 },
  miniStatusPersonal: { fontSize: 10, color: colors.textSecondary, fontWeight: 'bold', marginTop: 8, marginLeft: 52 },

  // Drawer
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawerContainer: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, width: '100%', paddingBottom: 40, maxHeight: '90%' },
  drawerHandle: { width: 40, height: 5, backgroundColor: '#ddd', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  drawerTitle: { ...typography.subHeader, fontSize: 16, marginBottom: 10, color: colors.textSecondary, textAlign: 'center', textTransform: 'uppercase' },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20, backgroundColor: colors.background, padding: 15, borderRadius: 12 },
  detailItem: { width: '48%', marginBottom: 12 },
  detailLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 2 },
  detailValue: { fontWeight: '600', color: colors.text, fontSize: 13 },

  balanceContainer: { backgroundColor: colors.primary + '1A', padding: 15, borderRadius: 12, marginBottom: 20 }, // 10% opacity
  balanceTitle: { fontSize: 12, fontWeight: 'bold', color: colors.primary, marginBottom: 8, textTransform: 'uppercase' },
  balanceLabel: { color: colors.text, fontSize: 14, opacity: 0.8 },
  balanceValue: { fontWeight: 'bold', color: colors.text, fontSize: 14 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  drawerActions: { marginTop: 10, alignItems: 'center' },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
  sectionHeader: { ...typography.subHeader, fontSize: 16, marginBottom: 15, color: colors.text },
  inputLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: colors.background, padding: 12, borderRadius: 8, color: colors.text, borderWidth: 1, borderColor: colors.border },

  saveBtn: { backgroundColor: colors.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: 'white', fontWeight: 'bold' },

  catItem: { padding: 15, borderBottomWidth: 1, borderColor: colors.border },
  catText: { fontSize: 16, color: colors.text },
  closeBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
});
