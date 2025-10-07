import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

type HomeScreenProps = {
  name: string;
  persona: string;
  onNavigate: (screen: 'home' | 'addExpense' | 'setup') => void;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ name, persona, onNavigate }) => {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.welcome}>Karibu, {persona} {name}!</Text>
      <Text style={styles.subtext}>
        Ready to manage your M-Pesa expenses? Choose what you’d like to do:
      </Text>

      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
          onPress={() => onNavigate('addExpense')}
        >
          <Text style={styles.actionText}>➕ Add Expense</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#2196F3' }]}
          onPress={() => console.log('Summary screen coming soon!')}
        >
          <Text style={styles.actionText}>📊 View Summary</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#673AB7' }]}
          onPress={() => onNavigate('smsReader')}
        >
          <Text style={styles.actionText}>💬 Read M-Pesa SMS</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F7F9FC',
  },
  welcome: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 10,
    color: '#222',
    textAlign: 'center',
  },
  subtext: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  actionContainer: {
    width: '100%',
  },
  actionButton: {
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  actionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default HomeScreen;
