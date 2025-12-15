import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ExpenseRepository } from '../services/ledger/ExpenseRepository';
import { Expense, Category } from '../services/ledger/Schema';

type HomeScreenProps = {
  name: string;
  persona: string;
  onNavigate: (screen: 'Home' | 'AddExpense' | 'Setup' | 'SmsReader') => void;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ name, persona, onNavigate }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [repo] = useState(() => new ExpenseRepository());

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const fetchData = async () => {
    // Basic "current month" fetch - sophisticated date handling can be added later
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const data = repo.getExpensesByMonth(currentMonth);
    setExpenses(data);

    // Also fetch categories for mapping names if needed (though repo join handles it)
    setCategories(repo.getAllCategories());
  };

  const renderExpenseItem = ({ item }: { item: Expense & { categoryName?: string } }) => (
    <View style={styles.expenseItem}>
      <View style={styles.expenseLeft}>
        <Text style={styles.expenseCategory}>{item.categoryName || 'Unknown'}</Text>
        <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.expenseDate}>{new Date(item.date).toLocaleDateString()}</Text>
      </View>
      <Text style={styles.expenseAmount}>Ksh {item.amount.toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Karibu, {name}!</Text>
        <Text style={styles.personaBadge}>{persona}</Text>
      </View>

      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
          onPress={() => onNavigate('AddExpense')}
        >
          <Text style={styles.actionText}>🎙️ Voice Input</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#673AB7' }]}
          onPress={() => onNavigate('SmsReader')}
        >
          <Text style={styles.actionText}>💬 Read M-Pesa</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Recent Expenses</Text>
        <FlatList
          data={expenses}
          renderItem={renderExpenseItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No expenses yet. Tap Voice Input to start!</Text>
          }
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    padding: 20,
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  welcome: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
  },
  personaBadge: {
    fontSize: 14,
    color: '#666',
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 5,
    overflow: 'hidden',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  actionButton: {
    flex: 0.48,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
  },
  actionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  listContent: {
    paddingBottom: 20,
  },
  expenseItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  expenseLeft: {
    flex: 1,
    marginRight: 10,
  },
  expenseCategory: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2196F3',
    textTransform: 'uppercase',
  },
  expenseDesc: {
    fontSize: 16,
    color: '#333',
    marginVertical: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: '#888',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E53935',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 30,
    fontStyle: 'italic',
  }
});

export default HomeScreen;
