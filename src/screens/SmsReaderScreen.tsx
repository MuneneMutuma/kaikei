import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  PermissionsAndroid,
  Platform,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  LayoutAnimation,
  Pressable,
  Alert,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { SwipeableSheet, SwipeableSheetRef } from '../components/common/SwipeableSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import SmsAndroid from "react-native-get-sms-android";
import { ScreenHeader } from "../components/ScreenHeader";
import { DownloadCloud, CheckCircle2, XCircle, Briefcase, User, Filter, ArrowRight, Ban, Check } from "lucide-react-native";
import { parseMpesaMessage, MpesaTransaction } from "../utils/mpesaParser";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { NaturalLanguageParser } from "../services/parser/NaturalLanguageParser";
import { Database } from "../services/ledger/Database";
import { Category, Expense } from "../services/ledger/Schema";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { TransactionImporter, parseMpesaDate } from "../services/ingestion/TransactionImporter";

// parseMpesaDate is now imported from TransactionImporter

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
  const [filterMode, setFilterMode] = useState<'inbox' | 'all'>('inbox');
  const [categories, setCategories] = useState<Category[]>([]);
  const bottomSheetRef = useRef<SwipeableSheetRef>(null);
  const categorySheetRef = useRef<SwipeableSheetRef>(null);

  // Helper to know if currently edited item is already synced (so we are editing an EXISTING expense)
  const [existingExpenseId, setExistingExpenseId] = useState<string | null>(null);

  const repo = useRef(new ExpenseRepository());
  const parser = useRef(new NaturalLanguageParser());
  const importer = useRef(new TransactionImporter());

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

  useEffect(() => {
    if (detailModalVisible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [detailModalVisible]);

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
    const loadData = async () => {
      const allCategories = await repo.current.getAllCategories();
      setCategories(allCategories);
    };
    loadData();

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

        // Check Sync Status (Bulk)
        const allSynced = await repo.current.getAllTransactionIds();

        // Filter Synced Logic: 
        // We only care about the ones in our current list for display, 
        // but `allSynced` is the source of truth.
        // Let's perform the intersection for local state if we want, 
        // OR just keep the whole set (it's O(1) lookup anyway).

        setSyncedTxIds(allSynced);
        setLoading(false);
      }
    );
  };

  const getFilteredTransactions = () => {
    if (filterMode === 'all') return transactions;
    return transactions.filter(tx => !syncedTxIds.has(tx.tx_id) && !ignoredTxIds.has(tx.tx_id));
  };

  const filteredData = getFilteredTransactions();

  const handleImportAll = async () => {
    // Import all visible (Inbox) items
    if (loading) return;
    const candidates = filteredData.filter(tx => !syncedTxIds.has(tx.tx_id) && !ignoredTxIds.has(tx.tx_id));

    if (candidates.length === 0) {
      Alert.alert("All Caught Up", "No new transactions to import.");
      return;
    }

    setLoading(true);
    await performBulkImport(candidates);
    setLoading(false);
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
    Alert.alert("Confirm Import", `Import ${ candidates.length } transactions ? `, [
        { text: "Cancel", onPress: () => setLoading(false) },
        { text: "Import", onPress: () => performBulkImport(candidates) }
    ]);
    */
    // Just do it for now (Toggle style)
    await performBulkImport(candidates);
  };

  const performBulkImport = async (candidates: MpesaTransaction[]) => {
    const result = await importer.current.importBatch(candidates, 'manual');

    // Update synced state
    const newSynced = new Set(syncedTxIds);
    result.results.forEach(r => {
      if (r.success && !r.skipped) {
        newSynced.add(r.transactionId);
      }
    });
    setSyncedTxIds(newSynced);
    setLoading(false);
    Alert.alert("Success", `Imported ${result.imported} transactions.`);
  };

  const openDetails = async (tx: MpesaTransaction) => {
    setSelectedTx(tx);
    setDetailModalVisible(true);

    // Reset edit state
    setEditDescription(tx.direction === 'in' ? `Received from ${tx.from} ` : `Paid to ${tx.to || tx.account || 'Unknown'} `);
    setEditCategoryId("");
    setExistingExpenseId(null);

    // If synced, load the existing expense data to allow editing
    if (syncedTxIds.has(tx.tx_id)) {
      try {
        const result = await Database.getInstance().execute(
          'SELECT id, description, categoryId FROM expenses WHERE transactionId = ? LIMIT 1',
          [tx.tx_id]
        );
        const rows = Database.getRows(result);
        if (rows.length > 0) {
          const exp = rows[0];
          setExistingExpenseId(exp.id);
          setEditDescription(exp.description);
          setEditCategoryId(exp.categoryId);
        }
      } catch (e) {
        console.error("Failed to load existing expense for edit", e);
      }
    }
  };

  const handleMarkBusiness = async (item: MpesaTransaction) => {
    // Import Logic
    try {
      const result = await importer.current.importTransaction(item, 'manual');
      if (result.success && !result.skipped) {
        const next = new Set(syncedTxIds);
        next.add(item.tx_id);
        setSyncedTxIds(next);

        // If it was ignored, remove from ignored
        if (ignoredTxIds.has(item.tx_id)) {
          await repo.current.unIgnoreTransaction(item.tx_id);
          const nextIgnored = new Set(ignoredTxIds);
          nextIgnored.delete(item.tx_id);
          setIgnoredTxIds(nextIgnored);
        }
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
    } catch (e) { console.error(e); }
  };

  const handleMarkPersonal = async (item: MpesaTransaction) => {
    // Ignore Logic
    try {
      // If synced, delete
      if (syncedTxIds.has(item.tx_id)) {
        await repo.current.deleteByTransactionId(item.tx_id);
        const next = new Set(syncedTxIds);
        next.delete(item.tx_id);
        setSyncedTxIds(next);
      }

      await repo.current.ignoreTransaction(item.tx_id);
      const nextIgnored = new Set(ignoredTxIds);
      nextIgnored.add(item.tx_id);
      setIgnoredTxIds(nextIgnored);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) { console.error(e); }
  };

  const renderItem = ({ item }: { item: MpesaTransaction }) => {
    const isSynced = syncedTxIds.has(item.tx_id);
    const isIgnored = ignoredTxIds.has(item.tx_id);

    // M-Pesa Centric Direction Logic
    let isIncome = item.direction === 'in';
    let displayParty = isIncome ? item.from : (item.to || item.account || "Unknown");

    if (item.type === 'internal' || item.direction === 'internal' || item.type === 'transfer') {
      if (item.from?.toUpperCase() === 'M-PESA') {
        isIncome = false;
        displayParty = `Transfer to ${item.to || 'Internal'} `;
      } else {
        isIncome = true;
        displayParty = `Transfer from ${item.from || 'Internal'} `;
      }
    }

    // Determine Status
    // Business (Synced) | Personal (Ignored) | Unprocessed (Neither)
    const isBusiness = isSynced;

    return (
      <View style={styles.rowContainer}>
        {/* Icon Column */}
        <View style={styles.iconCol}>
          <View style={[styles.iconCircle, { backgroundColor: isSynced ? colors.primary + '15' : (isIgnored ? '#f1f5f9' : '#e0f2fe') }]}>
            {isSynced ? <Briefcase size={20} color={colors.primary} /> :
              isIgnored ? <User size={20} color="#94a3b8" /> :
                <Filter size={20} color="#0ea5e9" />}
          </View>
          {isSynced && (
            <View style={styles.businessBadge}>
              <Briefcase size={8} color="white" />
            </View>
          )}
        </View>

        {/* Content Column */}
        <TouchableOpacity style={styles.contentCol} onPress={() => openDetails(item)}>
          <Text style={[styles.rowTitle, isIgnored && { textDecorationLine: 'line-through', color: '#94a3b8' }]} numberOfLines={1}>
            {displayParty}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.rowSubtitle}>
              {item.date} • {item.time} {item.account ? `• ${item.account} ` : ''}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Amount & Actions Column */}
        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: isIncome ? colors.success : colors.text }]}>
            {isIncome ? '+' : '-'} {item.amount.toLocaleString()}
          </Text>

          {/* Actions (Only if not synced) */}
          {!isSynced && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, isIgnored && styles.actionBtnActivePersonal]}
                onPress={() => handleMarkPersonal(item)}
                disabled={isIgnored}
              >
                <User size={16} color={isIgnored ? 'white' : '#94a3b8'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleMarkBusiness(item)}
              >
                <Briefcase size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Render Header Update
  // ...
  return (
    <View style={styles.container}>
      {/* Header */}
      <ScreenHeader
        title="M-Pesa Sync"
        subtitle={`${transactions.length} messages found`}
        showBackButton={true}
      />

      {/* Controls Bar */}
      <View style={styles.topBar}>
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, filterMode === 'inbox' && styles.segmentBtnActive]}
            onPress={() => setFilterMode('inbox')}
          >
            <Text style={[styles.segmentText, filterMode === 'inbox' && styles.segmentTextActive]}>Inbox</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, filterMode === 'all' && styles.segmentBtnActive]}
            onPress={() => setFilterMode('all')}
          >
            <Text style={[styles.segmentText, filterMode === 'all' && styles.segmentTextActive]}>All</Text>
          </TouchableOpacity>
        </View>

        {filterMode === 'inbox' && filteredData.length > 0 && (
          <TouchableOpacity style={styles.importAllBtn} onPress={handleImportAll}>
            <Text style={styles.importAllText}>Import All</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item: MpesaTransaction) => item.tx_id}
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

      {/* Details Modal */}
      <SwipeableSheet
        ref={bottomSheetRef}
        onDismiss={() => setDetailModalVisible(false)}
        title="Transaction Details"
        snapPoints={['94%']}
      >
        <ScrollView style={{ flex: 1 }}>
          {selectedTx && (
            <View style={{ padding: 24 }}>
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>{selectedTx.type}</Text>
                <Text style={{ fontSize: 34, fontWeight: 'bold', color: colors.text, marginVertical: 8 }}>
                  {selectedTx.direction === 'in' ? '+' : '-'} {selectedTx.amount.toLocaleString()}
                </Text>
                <Text style={{ fontSize: 16, color: colors.text, fontWeight: '500' }}>
                  {selectedTx.from || selectedTx.to}
                </Text>
              </View>

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

              {(selectedTx.balances?.mpesa || selectedTx.balances?.pochi) && (
                <View style={styles.balanceContainer}>
                  <Text style={styles.balanceTitle}>Balances</Text>
                  {selectedTx.balances.mpesa !== undefined && (
                    <View style={styles.rowBetween}>
                      <Text style={styles.balanceLabel}>M-PESA</Text>
                      <Text style={styles.balanceValue}>KES {selectedTx.balances.mpesa.toLocaleString()}</Text>
                    </View>
                  )}
                  {selectedTx.balances.pochi !== undefined && (
                    <View style={styles.rowBetween}>
                      <Text style={styles.balanceLabel}>Pochi</Text>
                      <Text style={styles.balanceValue}>KES {selectedTx.balances.pochi.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
              )}

              {syncedTxIds.has(selectedTx.tx_id) ? (
                <View>
                  <View style={styles.divider} />
                  <Text style={styles.sectionHeader}>Ledger Entry</Text>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={styles.input}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Describe this expense..."
                  />
                  <Text style={styles.inputLabel}>Category</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => categorySheetRef.current?.present()}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: editCategoryId ? colors.text : '#999', fontSize: 15 }}>
                        {categories.find(c => c.id === editCategoryId)?.name || 'Select Category'}
                      </Text>
                      <CheckCircle2 size={18} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, loading && { opacity: 0.7 }]}
                    disabled={loading}
                    onPress={async () => {
                      if (!existingExpenseId) return;
                      setLoading(true);
                      try {
                        await repo.current.updateExpense(existingExpenseId, {
                          description: editDescription,
                          categoryId: editCategoryId,
                          isVerified: true
                        });
                        Alert.alert("Success", "Entry updated and verified.");
                        setDetailModalVisible(false);
                        loadMessages();
                      } catch (e) {
                        Alert.alert("Error", "Failed to update entry.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes & Verify</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.drawerActions}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { width: '100%', backgroundColor: colors.primary }]}
                    onPress={() => {
                      if (selectedTx) {
                        setDetailModalVisible(false);
                        handleMarkBusiness(selectedTx);
                      }
                    }}
                  >
                    <Text style={styles.saveBtnText}>Import to Business</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SwipeableSheet>

      {/* Category Picker Sheet */}
      <SwipeableSheet
        ref={categorySheetRef}
        title="Select Category"
        snapPoints={['50%', '80%']}
      >
        <FlatList
          data={categories}
          keyExtractor={(c: Category) => c.id}
          renderItem={({ item }: { item: Category }) => (
            <Pressable
              style={styles.catItem}
              onPress={() => {
                setEditCategoryId(item.id);
                categorySheetRef.current?.dismiss();
              }}
            >
              <View style={[styles.catIcon, { backgroundColor: colors.primary + '15' }]}>
                <Text style={{ fontSize: 16 }}>🏷️</Text>
              </View>
              <Text style={styles.catText}>{item.name}</Text>
            </Pressable>
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      </SwipeableSheet>

    </View >
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border },
  title: { ...typography.header, fontSize: 18, color: colors.text },
  listContent: { padding: 16, paddingBottom: Platform.OS === 'android' ? 100 : 80 },

  // New Standard List Styles
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 12, backgroundColor: colors.background }, // Matched Home padding
  segmentContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 4 },
  segmentBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  segmentBtnActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '500', color: '#64748b' },
  segmentTextActive: { color: colors.text, fontWeight: '600' },

  importAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  importAllText: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  // TransactionRow EXACT Styles
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16, // Increased from 12 for "larger card" feel
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  iconCol: {
    position: 'relative',
    marginRight: 14,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  businessBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#0EA5E9', // Sky Blue
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  contentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  rowTitle: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  amountCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  amount: {
    ...typography.mono,
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Custom Actions (blending into TransactionRow style)
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 }, // Increased gap
  actionBtn: {
    width: 34, // Increased from 24
    height: 34,
    borderRadius: 17, // 34/2
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  actionBtnActivePersonal: { backgroundColor: '#94a3b8', borderColor: '#94a3b8' },
  actionBtnActiveBusiness: { backgroundColor: colors.primary, borderColor: colors.primary },

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

  catItem: { padding: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border },
  catIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  catText: { ...typography.body, fontSize: 16 },
  closeBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
});
