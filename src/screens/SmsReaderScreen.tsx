import React, { useEffect, useState } from "react";
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
} from "react-native";
import SmsAndroid from "react-native-get-sms-android";
import { parseMpesaMessage, MpesaTransaction } from "../utils/mpesaParser";

export default function SMSReaderScreen() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [transactions, setTransactions] = useState<MpesaTransaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<MpesaTransaction | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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

  const readMpesaSMS = () => {
    if (!permissionGranted) {
      console.log("Permission not granted");
      return;
    }

    SmsAndroid.list(
      JSON.stringify({
        box: "inbox",
        address: "MPESA",
        maxCount: 100,
      }),
      (fail: any) => console.log("Error:", fail),
      (count: any, smsList: any) => {
        const arr = JSON.parse(smsList);
        const parsed = arr
          .map((msg: any) => parseMpesaMessage(msg.body))
          .filter(Boolean) as MpesaTransaction[];
        setTransactions(parsed);
        console.log("✅ Parsed transactions:", JSON.stringify(parsed, null, 2));
      }
    );
  };

  useEffect(() => {
    requestSMSPermission();
  }, []);

  const handlePress = (tx: MpesaTransaction) => {
    setSelectedTx(tx);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: MpesaTransaction }) => (
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
          <Text style={styles.amount}>Ksh {item.amount?.toFixed(2) || "--"}</Text>
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
          <Text style={styles.label}>From:</Text>
          <Text style={styles.value}>{item.from || "—"}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>To:</Text>
          <Text style={styles.value}>{item.to || "—"}</Text>
        </View>

        {item.phone && (
          <View style={styles.row}>
            <Text style={styles.label}>Phone:</Text>
            <Text style={styles.value}>{item.phone}</Text>
          </View>
        )}

        {item.account && (
          <View style={styles.row}>
            <Text style={styles.label}>Account:</Text>
            <Text style={styles.value}>{item.account}</Text>
          </View>
        )}

        <View style={styles.row}>
          <Text style={styles.label}>Cost:</Text>
          <Text style={styles.value}>
            {item.tx_cost.toFixed(2)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Balance:</Text>
          <Text style={styles.value}>
            {item.balance ? `Ksh ${item.balance.toFixed(2)}` : "—"}
          </Text>
        </View>

        {item.other_balance && (
          <View style={styles.row}>
            <Text style={styles.label}>Other Bal:</Text>
            <Text style={styles.value}>
              {`Ksh ${item.other_balance.toFixed(2)}`}
            </Text>
          </View>
        )}

        <Text style={styles.date}>
          {item.date} {item.time && `at ${item.time}`}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📱 M-Pesa Transactions</Text>
      <Button title="Read M-Pesa Messages" onPress={readMpesaSMS} color="#4CAF50" />

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.tx_id + Math.random()}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
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
                  {Object.entries(selectedTx).map(([key, value]) => (
                    <View key={key} style={styles.modalRow}>
                      <Text style={styles.modalKey}>{key}</Text>
                      <Text style={styles.modalValue}>{String(value)}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Button title="Close" color="#C62828" onPress={() => setModalVisible(false)} />
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
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    elevation: 2,
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
    width: 90,
  },
  value: {
    color: "#333",
    flexShrink: 1,
  },
  txid: {
    fontWeight: "bold",
    color: "#333",
  },
  amount: {
    fontSize: 18,
    color: "#2E7D32",
    fontWeight: "bold",
  },
  direction: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  date: {
    fontSize: 12,
    color: "#777",
    marginTop: 6,
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
    marginBottom: 10,
    textAlign: "center",
  },
  modalContent: {
    marginBottom: 10,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 4,
  },
  modalKey: {
    fontWeight: "bold",
    color: "#555",
    width: "45%",
  },
  modalValue: {
    color: "#333",
    width: "55%",
    textAlign: "right",
  },
});
