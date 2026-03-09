import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { Category, Expense } from '../services/ledger/Schema';
import { Database } from '../services/ledger/Database';
import { colors } from '../theme/colors';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryHelpers';
import { X, Calendar, Plus, Check } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');
const MODAL_WIDTH = width * 0.94;
const GRID_PADDING = 16;
const GRID_GAP = 12;
const GRID_ITEM_SIZE = (MODAL_WIDTH - (GRID_PADDING * 2) - (GRID_GAP * 2)) / 3;

export default function QuickCategoryScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const txId = route.params?.txId; // M-Pesa transactionId
  
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Ensure Database is initialized (Fix for cold start)
        await Database.init();
        
        const repo = new ExpenseRepository();
        const db = Database.getInstance();
        
        // 2. Load Categories
        const cats = await repo.getAllCategories();
        setCategories(cats);

        // 3. Load Expense Details
        if (txId) {
          const result = await db.execute('SELECT * FROM expenses WHERE transactionId = ? LIMIT 1', [txId]);
          const rows = Database.getRows(result);
          if (rows.length > 0) {
            const exp = rows[0] as Expense;
            setExpense(exp);
            setSelectedCatId(exp.categoryId || null);
          }
        }
      } catch (e) {
        console.error('QuickCategoryScreen: Failed to load data', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [txId]);

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    }
  };

  const handleSave = async () => {
    if (!txId || !selectedCatId) return;
    
    setUpdating(true);
    try {
      const repo = new ExpenseRepository();
      const db = Database.getInstance();
      
      const result = await db.execute('SELECT id FROM expenses WHERE transactionId = ? LIMIT 1', [txId]);
      const rows = Database.getRows(result);
      
      if (rows.length > 0) {
          const internalId = rows[0].id;
          await repo.updateExpense(internalId, { categoryId: selectedCatId, isVerified: true });
          handleClose();
      }
    } catch (e) {
      console.error('Failed to update category', e);
      Alert.alert("Error", "Failed to save category selection.");
    } finally {
      setUpdating(false);
    }
  };

  const formattedDate = expense?.date ? new Date(expense.date).toLocaleDateString([], { day: 'numeric', month: 'short' }) : 'Today';
  const formattedTime = expense?.date ? new Date(expense.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.overlay} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!txId || !expense) {
    return (
      <View style={styles.container}>
        <View style={styles.overlay} />
        <View style={styles.modal}>
          <View style={styles.modalTopBar}>
          <Text style={styles.title}>Transaction Not Found</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeIcon}>
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { paddingHorizontal: 24, marginBottom: 20 }]}>We couldn't find the details for this transaction.</Text>
          <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1}>
        <View style={styles.overlay} />
      </TouchableOpacity>

      <View style={styles.modal}>
        {/* V3 Header: Top Navigation Bar */}
        <View style={styles.modalTopBar}>
            <View style={{ width: 40 }} />
            <Text style={styles.modalTitle}>Categorize</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeIcon}>
                <X color={colors.textSecondary} size={20} />
            </TouchableOpacity>
        </View>

        {/* V3 Header: Transaction Summary Insight Card */}
        <View style={styles.insightCard}>
            <View style={styles.insightRow}>
                <View style={[styles.iconBox, { backgroundColor: `${getCategoryColor(expense.categoryName)}15` }]}>
                    {React.createElement(getCategoryIcon(expense.categoryName), { size: 22, color: getCategoryColor(expense.categoryName) })}
                </View>
                <View style={styles.insightInfo}>
                    <Text style={styles.recipientName} numberOfLines={1}>{expense.recipient || expense.description || 'Unknown'}</Text>
                    <Text style={styles.metaText}>{formattedDate}{formattedTime ? `, ${formattedTime}` : ''}</Text>
                </View>
                <View style={styles.amountContainer}>
                    <Text style={[
                        styles.amountText,
                        { color: expense.type === 'income' ? colors.success : colors.danger }
                    ]}>
                        {expense.type === 'income' ? '+' : '-'} Ksh {expense.amount.toLocaleString()}
                    </Text>
                </View>
            </View>
        </View>

        <View style={styles.divider} />

        {/* Category Grid: Flat Design */}
        <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.gridContent}
            style={styles.gridContainer}
        >
            <View style={styles.grid}>
                {categories.map((item) => {
                    const Icon = getCategoryIcon(item.name);
                    const color = getCategoryColor(item.name);
                    const isSelected = selectedCatId === item.id;

                    return (
                        <TouchableOpacity 
                            key={item.id} 
                            style={[
                                styles.gridItem,
                                isSelected && { backgroundColor: `${color}10`, borderColor: color }
                            ]} 
                            onPress={() => setSelectedCatId(item.id)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.iconCircle,
                                { backgroundColor: isSelected ? color : '#f8fafc' }
                            ]}>
                                <Icon size={22} color={isSelected ? '#fff' : color} />
                            </View>
                            <Text 
                                style={[
                                    styles.itemText,
                                    isSelected && { color: color, fontWeight: '700' }
                                ]}
                                numberOfLines={1}
                            >
                                {item.name}
                            </Text>
                        </TouchableOpacity>
                    );
                })}

                {/* New Category Button: Neutral styling */}
                <TouchableOpacity 
                    style={[styles.gridItem, { borderStyle: 'dashed' }]}
                    onPress={() => Alert.alert("Coming Soon", "Adding categories is coming in the next update.")}
                    activeOpacity={0.7}
                >
                    <View style={[styles.iconCircle, { backgroundColor: '#f1f5f9' }]}>
                        <Plus size={22} color={colors.textSecondary} />
                    </View>
                    <Text style={[styles.itemText, { color: colors.textSecondary }]}>New Category</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>

        {/* Action Button: Matches Save flow */}
        {selectedCatId && selectedCatId !== expense.categoryId && (
            <View style={styles.footer}>
                <TouchableOpacity 
                    style={styles.saveBtn} 
                    onPress={handleSave}
                    disabled={updating}
                >
                    {updating ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <Check size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.saveBtnText}>Save Category</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 15, 10, 0.75)',
  },
  modal: {
    width: MODAL_WIDTH,
    maxHeight: height * 0.8,
    backgroundColor: colors.surface,
    borderRadius: 32,
    paddingTop: 24,
    paddingBottom: 24,
    elevation: 0, // Flat design
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    overflow: 'hidden'
  },
  modalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  insightCard: {
    marginHorizontal: 16,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  insightInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12, 
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 1,
  },
  amountContainer: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  amountText: {
    fontSize: 17,
    fontWeight: '800',
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
    marginBottom: 20,
    marginTop: 8,
  },
  gridContainer: {
    flexGrow: 0,
  },
  gridContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    aspectRatio: 0.95,
    backgroundColor: '#fff', // Flat - no elevation/shadows
    borderRadius: 20,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#f1f5f9',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  saveBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: 18,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  closeIcon: {
    padding: 4,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cancelBtn: {
    marginHorizontal: 24,
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 18,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
