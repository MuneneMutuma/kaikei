import React, { useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from "react-native";
import { SwipeableSheet, SwipeableSheetRef } from '../components/common/SwipeableSheet';
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { getCategoryIcon, getCategoryColor } from "../utils/categoryHelpers";
import { Plus, X, Split, AlertCircle, Check, Layers } from "lucide-react-native";
import { Category, BudgetBreakdown } from "../services/ledger/Schema";

type Props = {
  note: string;
  setNote: (s: string) => void;
  summary?: {
    amount: string;
    categoryName: string;
    categoryColor: string;
  };
  onEditCategory?: () => void;
  onEditAmount?: () => void;
  isSplit?: boolean;
  setIsSplit?: (v: boolean) => void;
  splits?: {
    categoryId: string,
    categoryName: string,
    amount: string,
    budgetBreakdownId?: string,
    tagId?: string,
    tagName?: string
  }[];
  setSplits?: (s: any) => void;
  dbCategories?: Category[];
  availableBreakdowns?: BudgetBreakdown[];
  selectedBreakdownId?: string | null;
  onSelectBreakdown?: (id: string | null) => void;
  availableTags?: { id: string, name: string }[];
  selectedTagIds?: string[];
  onSelectTag?: (id: string) => void;
  onClearTags?: () => void;
  onAddBreakdown?: () => void;
};

const { width } = Dimensions.get('window');

const NoteStep: React.FC<Props> = ({
  note,
  setNote,
  summary,
  onEditCategory,
  onEditAmount,
  isSplit,
  setIsSplit,
  splits,
  setSplits,
  dbCategories,
  availableTags,
  selectedTagIds = [],
  onSelectTag,
  onClearTags,
  onAddBreakdown
}) => {
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [activeSplitIdx, setActiveSplitIdx] = React.useState<number | null>(null);
  const splitPickerRef = useRef<SwipeableSheetRef>(null);
  const existingTransactionsSheetRef = useRef<SwipeableSheetRef>(null);

  React.useEffect(() => {
    if (pickerVisible) {
      splitPickerRef.current?.present();
    } else {
      splitPickerRef.current?.dismiss();
    }
  }, [pickerVisible]);

  const handleSelectSplitCat = (cat: Category) => {
    if (activeSplitIdx !== null && splits && setSplits) {
      const newSplits = [...splits];
      newSplits[activeSplitIdx] = {
        ...newSplits[activeSplitIdx],
        categoryId: cat.id,
        categoryName: cat.name
      };
      setSplits(newSplits);
    }
    setPickerVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.label}>Final Details</Text>

      {summary && (
        <View style={styles.summaryContainer}>
          <TouchableOpacity
            onPress={onEditCategory}
            style={[styles.categoryRow, { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' }]}
          >
            <View style={[styles.badgeIcon, { backgroundColor: summary.categoryColor }]}>
              {React.createElement(getCategoryIcon(summary.categoryName), { size: 14, color: '#FFF' })}
            </View>
            <Text style={[styles.categoryName, { color: colors.text }]}>{summary.categoryName}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onEditAmount} style={styles.amountRow}>
            <Text style={styles.currencyLabel}>Ksh</Text>
            <Text style={styles.hugeAmount}>{summary.amount}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Budget Tag Selector - Panel Style */}
      {!isSplit && dbCategories && (
        <View style={styles.bucketSelectionContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={styles.subLabel}>Transaction Tag</Text>

            <TouchableOpacity
              onPress={() => {
                setIsSplit?.(true);
                if ((!splits || splits.length === 0) && summary) {
                  setSplits?.([
                    { categoryId: dbCategories?.find(c => c.name === summary.categoryName)?.id || '', categoryName: summary.categoryName, amount: summary.amount }
                  ]);
                }
              }}
              style={styles.inlineSplitBtn}
            >
              <Split size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.inlineSplitText}>Split</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tagPanel}>
            <TouchableOpacity
              onPress={() => {
                onClearTags?.();
              }}
              style={[styles.tagCard, selectedTagIds.length === 0 && { backgroundColor: `${colors.primary} 10`, borderColor: colors.primary }]}
            >
              <View style={[styles.tagIcon, { backgroundColor: selectedTagIds.length === 0 ? colors.primary + '15' : '#F1F5F9' }]}>
                <Layers size={18} color={selectedTagIds.length === 0 ? colors.primary : colors.textSecondary} />
              </View>
              <Text style={[styles.tagCardText, selectedTagIds.length === 0 && { color: colors.primary, fontWeight: '700' }]}>None</Text>
            </TouchableOpacity>

            {(availableTags || []).map(tag => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <TouchableOpacity
                  key={tag.id}
                  onPress={() => {
                    onSelectTag?.(tag.id);
                  }}
                  style={[styles.tagCard, active && { backgroundColor: `${colors.primary} 10`, borderColor: colors.primary }]}
                >
                  <View style={[styles.tagIcon, { backgroundColor: active ? colors.primary + '15' : '#F1F5F9' }]}>
                    <Layers size={18} color={active ? colors.primary : colors.textSecondary} />
                  </View>
                  <Text style={[styles.tagCardText, active && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={onAddBreakdown}
              style={[styles.tagCard, { borderStyle: 'dashed' }]}
            >
              <View style={[styles.tagIcon, { backgroundColor: colors.primary + '08' }]}>
                <Plus size={18} color={colors.primary} />
              </View>
              <Text style={[styles.tagCardText, { color: colors.primary, fontWeight: '700' }]}>New Tag</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isSplit && (
        <View style={{ marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.subLabel}>Transaction Splits</Text>
          <TouchableOpacity onPress={() => setIsSplit?.(false)}>
            <Text style={{ fontSize: 13, color: colors.danger, fontWeight: '600' }}>Cancel Split</Text>
          </TouchableOpacity>
        </View>
      )}

      {isSplit && splits && setSplits && dbCategories && (
        <View style={styles.splitsList}>
          {splits.map((s, idx) => {
            const Icon = getCategoryIcon(s.categoryName);
            const color = getCategoryColor(s.categoryName);
            return (
              <View key={idx} style={styles.splitItem}>
                <View style={[styles.splitInputs, { borderColor: color + '40' }]}>
                  <TouchableOpacity
                    style={[styles.splitCatSelect, { backgroundColor: color + '15' }]}
                    onPress={() => {
                      setActiveSplitIdx(idx);
                      setPickerVisible(true);
                    }}
                  >
                    <Icon size={14} color={color} style={{ marginRight: 6 }} />
                    <Text style={[styles.splitCatText, { color: color }]} numberOfLines={1}>{s.categoryName}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.splitAmountInput}
                    value={s.amount}
                    onChangeText={(val) => {
                      const newSplits = [...splits];
                      newSplits[idx].amount = val;
                      setSplits(newSplits);
                    }}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                </View>
                <TouchableOpacity onPress={() => setSplits(splits.filter((_, i) => i !== idx))} style={styles.removeBtn}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.addSplitBtn}
            onPress={() => setSplits([...splits, { categoryId: dbCategories[0].id, categoryName: dbCategories[0].name, amount: '' }])}
          >
            <Plus size={14} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.addSplitBtnText}>Add Split</Text>
          </TouchableOpacity>

          {/* Validation */}
          {(() => {
            const total = parseFloat(summary?.amount || '0');
            const splitTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
            const diff = total - splitTotal;

            if (Math.abs(diff) > 0.01) {
              return (
                <View style={styles.splitValidation}>
                  <AlertCircle size={14} color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={styles.validationText}>
                    {diff > 0 ? `Unallocated: KES ${diff.toLocaleString()} ` : `Overallocated: KES ${Math.abs(diff).toLocaleString()} `}
                  </Text>
                </View>
              );
            }
            return (
              <View style={styles.splitValidation}>
                <Check size={14} color={colors.success} style={{ marginRight: 6 }} />
                <Text style={[styles.validationText, { color: colors.success }]}>Total splits match transaction amount.</Text>
              </View>
            );
          })()}
        </View>
      )}

      {/* Category Picker Sheet for Splits */}
      <SwipeableSheet
        ref={splitPickerRef}
        title="Choose Category"
        snapPoints={['70%']}
        onDismiss={() => setPickerVisible(false)}
      >
        <ScrollView contentContainerStyle={styles.pickerGrid}>
          {dbCategories && dbCategories.map(cat => {
            const Icon = getCategoryIcon(cat.name);
            const color = getCategoryColor(cat.name);
            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.pickerItem}
                onPress={() => handleSelectSplitCat(cat)}
              >
                <View style={[styles.pickerIcon, { backgroundColor: color + '15' }]}>
                  <Icon size={24} color={color} />
                </View>
                <Text style={styles.pickerText}>{cat.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SwipeableSheet>

      <Text style={styles.subLabel}>Add a note (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Bought tomatoes at market"
        placeholderTextColor="#9CA3AF"
        style={styles.input}
        multiline
        autoFocus={false}
      />

      <Text style={styles.hintText}>
        Tip: You can use Voice at any time to update these details.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: {
    ...typography.header,
    fontSize: 24,
    color: colors.text,
    marginBottom: 20,
    marginTop: 40,
    textAlign: 'center'
  },
  summaryContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20
  },
  inlineSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  inlineSplitText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 16
  },
  currencyLabel: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: '600',
    marginRight: 8,
  },
  hugeAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  badgeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.5
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4
  },
  input: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    borderColor: "#E5E7EB",
    borderWidth: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  hintText: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 20
  },
  bucketSelectionContainer: {
    marginBottom: 24,
    marginTop: -10
  },
  tagPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 2
  },
  tagCard: {
    width: (width - 48 - 16) / 3, // 3 columns with gap and padding
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  tagIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  tagCardText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center'
  },
  requiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.danger
  },
  splitsList: {
    marginBottom: 24
  },
  splitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12
  },
  splitInputs: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden'
  },
  splitCatSelect: {
    flex: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB'
  },
  splitCatText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500'
  },
  splitAmountInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right'
  },
  addSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  addSplitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary
  },
  splitValidation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4
  },
  validationText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger
  },
  removeBtn: {
    padding: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: '70%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  pickerItem: {
    width: (width - 32) / 3,
    alignItems: 'center',
    marginBottom: 20,
    padding: 8
  },
  pickerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  pickerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center'
  }
});

export default NoteStep;
