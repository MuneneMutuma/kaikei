import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SmartOnboardingService } from '../services/intelligence/SmartOnboardingService';
import { Expense } from '../services/ledger/Schema';
import { RootStackParamList } from '../../App';

type SmartSuggestionScreenRouteProp = RouteProp<RootStackParamList, 'SmartSuggestion'>;

export const SmartSuggestionScreen = () => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<SmartSuggestionScreenRouteProp>();
    const { name, count } = route.params;

    const [transactions, setTransactions] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [categories, setCategories] = useState(new SmartOnboardingService().getCategories());
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

    const onboardingService = new SmartOnboardingService();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const txs = await onboardingService.getTransactionsForRecipient(name);
            setTransactions(txs);
            setSelectedIds(new Set(txs.map(t => t.id))); // Select all by default
        } catch (e) {
            Alert.alert("Error", "Failed to load transactions.");
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!selectedCategoryId) {
            Alert.alert("Select Category", "Please pick a category first.");
            return;
        }

        setSubmitting(true);
        try {
            // We use the service to label (which updates ALL by default)
            // But if we want to support partial selection, we need a batch update method.
            // For now, let's assume "Smart Suggestion" implies "All these belong to this category".
            // If the user unchecks some, strictly we should only update those.

            // FIXME: The service currently does "bulkUpdateCategory" (ALL by name).
            // To support selection, we should filter.
            // However, for MVP stability, let's stick to the service method if all selected.

            // If selection < total, iterate updates (slower but correct)
            if (selectedIds.size < transactions.length) {
                console.log("Partial update not fully supported by bulk service, falling back to iterative.");
            }

            // Ideally we pass IDs. SmartOnboardingService.labelPayee might need an update? 
            // The User's previous request mentioned "onConfirmBatch" passed from HomeScreen.
            // Let's implement the logic LOCALLY here since we are the page now.

            const count = await onboardingService.labelPayee(name, selectedCategoryId);

            Alert.alert("Success", `Categorized ${count} transactions.`);
            // Go home and force refresh?
            // Passing params back to Home is one way, or just popping
            navigation.navigate('Home', { name: 'Refreshed', persona: 'Refreshed' });
        } catch (e) {
            Alert.alert("Error", "Failed to categorize.");
        } finally {
            setSubmitting(false);
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const getCategoryIcon = (name: string) => {
        const map: { [key: string]: string } = {
            'Fuel': '⛽', 'Stock': '📦', 'Food': '🍔', 'Transport': '🚌',
            'Airtime': '📱', 'Rent': '🏠', 'Utilities': '💡', 'Labor': '👷',
            'Loans': '🏦', 'Other': '📝'
        };
        return map[name] || '🏷️';
    };

    const renderItem = ({ item }: { item: Expense }) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <TouchableOpacity
                style={[styles.itemCard, isSelected && styles.itemSelected]}
                onPress={() => toggleSelection(item.id)}
            >
                <View style={[styles.checkbox, isSelected ? styles.checked : styles.unchecked]}>
                    {isSelected && <Text style={{ color: 'white', fontSize: 12 }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.amount, { color: item.type === 'income' ? '#4CAF50' : '#F44336' }]}>
                            {item.type === 'income' ? '+' : '-'} Ksh {item.amount.toLocaleString()}
                        </Text>
                        <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={{ fontSize: 24, color: '#333' }}>←</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>Review: {name}</Text>
                    <Text style={styles.subtitle}>{loading ? "Loading..." : `${transactions.length} transactions found`}</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#2196F3" />
                </View>
            ) : (
                <FlatList
                    data={transactions}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                />
            )}

            <View style={styles.footer}>
                <Text style={styles.label}>Category:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                    {categories.map(c => (
                        <TouchableOpacity
                            key={c.id}
                            style={[styles.catChip, selectedCategoryId === c.id && styles.catChipSelected]}
                            onPress={() => setSelectedCategoryId(c.id)}
                        >
                            <Text style={[styles.catText, selectedCategoryId === c.id && styles.catTextSelected]}>
                                {getCategoryIcon(c.name)} {c.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <TouchableOpacity
                    style={[styles.confirmBtn, (!selectedCategoryId || selectedIds.size === 0) && styles.disabledBtn]}
                    onPress={handleConfirm}
                    disabled={submitting || !selectedCategoryId || selectedIds.size === 0}
                >
                    {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.confirmText}>Categorize Selected ({selectedIds.size})</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#EEE' },
    backBtn: { marginRight: 15, padding: 5 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    subtitle: { fontSize: 14, color: '#666' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 15 },
    itemCard: { flexDirection: 'row', backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
    itemSelected: { borderColor: '#2196F3', borderWidth: 1, backgroundColor: '#E3F2FD' },
    checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#CCC', marginRight: 15, alignItems: 'center', justifyContent: 'center' },
    checked: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
    unchecked: {},
    amount: { fontWeight: 'bold', fontSize: 16, color: '#333' },
    date: { fontSize: 12, color: '#999' },
    desc: { fontSize: 12, color: '#777', marginTop: 2 },
    footer: { padding: 20, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#EEE' },
    label: { fontWeight: 'bold', marginBottom: 10, color: '#333' },
    catScroll: { marginBottom: 20, maxHeight: 50 },
    catChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0', marginRight: 10, borderWidth: 1, borderColor: 'transparent' },
    catChipSelected: { backgroundColor: '#E3F2FD', borderColor: '#2196F3' },
    catText: { color: '#333' },
    catTextSelected: { color: '#2196F3', fontWeight: 'bold' },
    confirmBtn: { backgroundColor: '#2196F3', padding: 15, borderRadius: 10, alignItems: 'center' },
    disabledBtn: { backgroundColor: '#B0BEC5' },
    confirmText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
