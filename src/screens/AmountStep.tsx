import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Delete, Check } from 'lucide-react-native';
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

type Props = {
  amount: string;
  setAmount: (v: string) => void;
  onQuickSet?: (v: number) => void;
  onNext?: () => void;
};

import { View as MotiView } from 'moti';

const { width } = Dimensions.get('window');
const BUTTON_SIZE = (width - 80) / 3;

const AmountStep: React.FC<Props> = ({ amount, setAmount, onNext }) => {

  const handlePress = (val: string) => {
    if (val === 'DEL') {
      setAmount(amount.slice(0, -1));
    } else {
      // Prevent leading zeros unless it's just "0"
      if (amount === '0' && val !== '.') {
        setAmount(val);
      } else {
        setAmount(amount + val);
      }
    }
  };

  const Key = ({ val, icon: Icon, color }: { val: string, icon?: any, color?: string }) => (
    <TouchableOpacity
      onPress={() => handlePress(val)}
      activeOpacity={0.7}
      style={styles.key}
    >
      {Icon ? <Icon color={color || colors.text} size={28} /> : <Text style={styles.keyText}>{val}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.displayArea}>
        <Text style={styles.currency}>Ksh</Text>
        <Text style={styles.amountText}>{amount || "0"}</Text>
      </View>

      <View style={styles.keypadContainer}>
        <View style={styles.numpad}>
          <View style={styles.row}>
            <Key val="1" />
            <Key val="2" />
            <Key val="3" />
          </View>
          <View style={styles.row}>
            <Key val="4" />
            <Key val="5" />
            <Key val="6" />
          </View>
          <View style={styles.row}>
            <Key val="7" />
            <Key val="8" />
            <Key val="9" />
          </View>
          <View style={styles.row}>
            <Key val="." />
            <Key val="0" />
            <Key val="DEL" icon={Delete} color={colors.danger} />
          </View>
        </View>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  displayArea: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  currency: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 8,
    marginTop: 8
  },
  amountText: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.primary,
  },
  numpad: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  keypadContainer: {
    paddingTop: 10,
    paddingBottom: 24, // Fix footer overlap
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  key: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE * 0.72,
    backgroundColor: 'transparent',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 30,
    fontWeight: '500',
    color: colors.text
  }
});

export default AmountStep;
