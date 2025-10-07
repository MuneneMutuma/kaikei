import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

type AddExpenseScreenProps = {
  onBack: () => void;
};

const categories = ['Stock', 'Fuel', 'Repairs', 'Meals', 'Float', 'Airtime'];

const AddExpenseScreen: React.FC<AddExpenseScreenProps> = ({ onBack }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const handleSave = () => {
    if (!amount || !description || !category) {
      console.log('Please fill all fields');
      return;
    }

    const expense = {
      amount: parseFloat(amount),
      description,
      category,
      date: new Date().toISOString(),
    };

    console.log('Saved Expense:', expense);
    setAmount('');
    setDescription('');
    setCategory('');
    onBack(); // Return to Home
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Add Expense</Text>

      <TextInput
        style={styles.input}
        placeholder="Amount (KES)"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />

      <TextInput
        style={styles.input}
        placeholder="Description"
        value={description}
        onChangeText={setDescription}
      />

      <Text style={styles.label}>Category</Text>
      {categories.map((c) => (
        <TouchableOpacity
          key={c}
          style={[
            styles.categoryButton,
            category === c && styles.categorySelected,
          ]}
          onPress={() => setCategory(c)}
        >
          <Text
            style={[
              styles.categoryText,
              category === c && styles.categoryTextSelected,
            ]}
          >
            {c}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>💾 Save Expense</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>⬅ Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  categoryButton: {
    padding: 12,
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    marginBottom: 8,
  },
  categorySelected: {
    backgroundColor: '#4CAF50',
  },
  categoryText: {
    textAlign: 'center',
    color: '#333',
  },
  categoryTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  saveText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 16,
  },
  backButton: {
    marginTop: 15,
    padding: 12,
    alignItems: 'center',
  },
  backText: {
    color: '#666',
    fontSize: 16,
  },
});

export default AddExpenseScreen;
