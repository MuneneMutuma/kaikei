import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Button,
  PermissionsAndroid,
  Platform,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import SmsAndroid from "react-native-get-sms-android";
import { parseMpesaMessage, MpesaTransaction } from "../utils/mpesaParser";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { NaturalLanguageParser } from "../services/parser/NaturalLanguageParser";
import { Database } from "../services/ledger/Database";

const parseMpesaDate = (dateStr: string, timeStr?: string): string => {
  // Expected format: DD/MM/YY or DD/MM/YYYY
  try {
    const [day, month, yearPart] = dateStr.split('/').map(Number);
    // Handle 2-digit year (assume 20xx)
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;

    // Default to noon if no time, or parse time if needed. 
    // For now, let's keep it simple and just use the date.
    // If timeStr is e.g. "8:42 PM", we could parse it, but Date(year, month-1, day) is safer.
    const date = new Date(year, month - 1, day, 12, 0, 0);

    // Check validity
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date");
    }
    return date.toISOString();
  } catch (e) {
    console.warn("Date parse error, using now:", e);
    return new Date().toISOString();
  }
};

export default function SMSReaderScreen() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [transactions, setTransactions] = useState<MpesaTransaction[]>([]);
  const [syncedTxIds, setSyncedTxIds] = useState<Set<string>>(new Set());
  const [selectedTx, setSelectedTx] = useState<MpesaTransaction | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const repo = useRef(new ExpenseRepository());
  const parser = useRef(new NaturalLanguageParser());

  useEffect(() => {
    Database.init();
    requestSMSPermission();
  }, []);

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

  const syncTransactions = async (parsedTxs: MpesaTransaction[]) => {
    setIsSyncing(true);
    const newSynced = new Set(syncedTxIds);
    let addedCount = 0;

    for (const tx of parsedTxs) {
      try {
        const exists = await repo.current.existsByTransactionId(tx.tx_id);
        if (exists) {
          newSynced.add(tx.tx_id);
        } else {
          // Auto-Add
          const descriptionToParse = `${tx.from} ${tx.to} ${tx.type}`;
          const categorySuggestion = await parser.current.predictCategory(descriptionToParse);
          const categoryId = categorySuggestion?.id || repo.current.getCategoryByName('Other')?.id || 'unknown_cat';

          const cleanDesc = tx.direction === 'in'
            ? `Received from ${tx.from}`
            : `Paid to ${tx.to || tx.account || 'Unknown'}`;

          await repo.current.addExpense({
            amount: tx.amount,
            date: parseMpesaDate(tx.date, tx.time),
            description: cleanDesc,
            categoryId: categoryId,
            source: 'mpesa',
            rawText: tx.raw_text,
            transactionId: tx.tx_id
          });
          newSynced.add(tx.tx_id);
          addedCount++;
        }
      } catch (e) {
        console.error("Sync error for " + tx.tx_id, e);
      }
    }

    setSyncedTxIds(newSynced);
    setIsSyncing(false);
    if (addedCount > 0) {
      Alert.alert("Sync Complete", `${addedCount} new transactions imported.`);
    }
  };

  const refreshAndSync = () => {
    if (!permissionGranted) {
      console.log("Permission not granted");
      Alert.alert("Permission", "Please allow SMS permissions to read M-Pesa messages.");
      return;
    }

    const filter = {
      box: "inbox",
      address: "MPESA",
      maxCount: 50, // Limit for performance
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (fail: any) => console.log("Error:", fail),
      (count: any, smsList: any) => {
        const arr = JSON.parse(smsList);
        const parsed = arr
          .map((msg: any) => parseMpesaMessage(msg.body))
          .filter(Boolean) as MpesaTransaction[];

        setTransactions(parsed);
        // Trigger Auto Sync
        syncTransactions(parsed);
      }
    );
  };

  const handleRemove = async (tx: MpesaTransaction) => {
    try {
      await repo.current.deleteByTransactionId(tx.tx_id);
      const newSynced = new Set(syncedTxIds);
      newSynced.delete(tx.tx_id);
      setSyncedTxIds(newSynced);
      setModalVisible(false);
      Alert.alert("Removed", "Transaction removed from Ledger.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not remove transaction.");
    }
  };

  const handlePress = (tx: MpesaTransaction) => {
    setSelectedTx(tx);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: MpesaTransaction }) => {
    const isSynced = syncedTxIds.has(item.tx_id);
    return (
      <TouchableOpacity onPress={() => handlePress(item)}>
        <View
          style={[
            styles.card,
            item.direction === "in"
              ? styles.incoming
              : item.direction === "out"
                ? styles.outgoing
                : styles.internal,
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={styles.txid}>{item.tx_id}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {isSynced && <Text style={{ marginRight: 5, fontSize: 10, color: '#4CAF50' }}>✅ Synced</Text>}
              <Text style={styles.amount}>Ksh {item.amount?.toFixed(2) || "--"}</Text>
            </View>
          </View>

          <Text
            style={[
              styles.direction,
              {
                color:
                  item.direction === "in"
                    ? "#2E7D32"
                    : item.direction === "out"
                      ? "#C62828"
                      : "#1565C0",
              },
            ]}
          >
            {item.direction === "in"
              ? "Incoming"
              : item.direction === "out"
                ? "Outgoing"
                : "Internal Transfer"}
          </Text>

          <View style={styles.row}>
            <Text style={styles.label}>{item.direction === 'in' ? 'From:' : 'To:'}</Text>
            <Text style={styles.value}>
              {item.direction === 'in' ? (item.from || "—") : (item.to || item.account || "—")}
            </Text>
          </View>

          <Text style={styles.date}>
            {item.date} {item.time && `at ${item.time}`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📱 M-Pesa Transactions</Text>
      <View style={styles.headerButtons}>
        <Button
          title={isSyncing ? "Syncing..." : "🔄 Refresh & Sync"}
          onPress={refreshAndSync}
          color="#2196F3"
          disabled={isSyncing}
        />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.tx_id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}
        ListEmptyComponent={<Text style={styles.empty}>No transactions found.</Text>}
      />

      {/* 🪟 Transaction Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              {selectedTx && (
                <View style={styles.modalContent}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalKey}>TX ID</Text>
                    <Text style={styles.modalValue}>{selectedTx.tx_id}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalKey}>Status</Text>
                    <Text style={[styles.modalValue, { color: syncedTxIds.has(selectedTx.tx_id) ? 'green' : 'gray' }]}>
                      {syncedTxIds.has(selectedTx.tx_id) ? 'Synced to Ledger' : 'Not Synced'}
                    </Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalKey}>Amount</Text>
                    <Text style={styles.modalValue}>Ksh {selectedTx.amount}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalKey}>Type</Text>
                    <Text style={styles.modalValue}>{selectedTx.type}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalKey}>Party</Text>
                    <Text style={styles.modalValue}>{selectedTx.from || selectedTx.to}</Text>
                  </View>
                </View>
              )}

              <View style={styles.modalActions}>
                {selectedTx && syncedTxIds.has(selectedTx.tx_id) ? (
                  <TouchableOpacity
                    style={[styles.modalButton, styles.closeButton]} // Red for remove
                    onPress={() => handleRemove(selectedTx)}
                  >
                    <Text style={styles.buttonText}>🗑️ Remove from Ledger</Text>
                  </TouchableOpacity>
                ) : (
                  // Re-add button if for some reason it failed validation but showed up here?
                  // Or just force re-sync?
                  <TouchableOpacity
                    style={[styles.modalButton, styles.saveButton]}
                    onPress={() => {
                      // Manually trigger sync for this one?
                      if (selectedTx) syncTransactions([selectedTx]);
                      setModalVisible(false);
                    }}
                  >
                    <Text style={styles.buttonText}>Force Import</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: '#777' }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.buttonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// 🎨 Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
    padding: 15,
  },
  headerButtons: {
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
    color: '#333'
  },
  empty: {
    textAlign: 'center',
    marginTop: 50,
    color: '#888'
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 }
  },
  incoming: {
    borderLeftWidth: 4,
    borderLeftColor: "#2E7D32",
  },
  outgoing: {
    borderLeftWidth: 4,
    borderLeftColor: "#C62828",
  },
  internal: {
    borderLeftWidth: 4,
    borderLeftColor: "#1565C0",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    marginTop: 4,
  },
  label: {
    fontWeight: "600",
    color: "#555",
    width: 60,
  },
  value: {
    color: "#333",
    flexShrink: 1,
    fontWeight: '500'
  },
  txid: {
    fontWeight: "bold",
    color: "#333",
    fontSize: 12
  },
  amount: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  direction: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  date: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
    alignSelf: 'flex-end'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
    color: '#333'
  },
  modalContent: {
    marginBottom: 20,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 8,
  },
  modalKey: {
    fontWeight: "bold",
    color: "#555",
    width: "30%",
  },
  modalValue: {
    color: "#333",
    width: "70%",
    textAlign: "right",
  },
  modalActions: {
    marginTop: 10,
    gap: 10
  },
  modalButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  closeButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold'
  }
});
