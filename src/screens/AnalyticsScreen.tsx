import React, { useState, useEffect } from "react";
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator
} from "react-native";
import { colors } from "../theme/colors";
import { Search, Filter, Plus, PieChart, MoreHorizontal, ArrowUpRight, ArrowDownLeft } from "lucide-react-native";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";

const AnalyticsScreen = ({ navigation }: any) => {
    const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
    const [searchQuery, setSearchQuery] = useState("");
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadTransactions();
    }, [filter]);

    const loadTransactions = async () => {
        setLoading(true);
        const repo = new ExpenseRepository();
        // Mocking fetching all for now, would use specific query
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const data = await repo.getExpensesByMonth(monthStr);

        // Filter
        const filtered = data.filter(t => {
            if (filter === 'all') return true;
            if (filter === 'in') return t.type === 'income';
            if (filter === 'out') return t.type === 'expense';
            return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setTransactions(filtered);
        setLoading(false);
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.transactionRow}>
            <View style={[styles.iconBox, item.type === 'income' ? styles.incomeIcon : styles.expenseIcon]}>
                {item.type === 'income' ? <ArrowDownLeft size={20} color="#16a34a" /> : <ArrowUpRight size={20} color="#dc2626" />}
            </View>

            <View style={styles.txnDetails}>
                <Text style={styles.txnTitle}>{item.description || item.category}</Text>
                <Text style={styles.txnTime}>{item.date}</Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.txnAmount, item.type === 'income' ? { color: '#16a34a' } : { color: '#dc2626' }]}>
                    {item.type === 'income' ? '+' : '-'} KES {item.amount.toLocaleString()}
                </Text>
                <Text style={styles.txnMethod}>M-Pesa</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Transactions</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.iconButton}>
                        <PieChart size={20} color="#0d1b12" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton}>
                        <MoreHorizontal size={20} color="#0d1b12" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search & Filter */}
            <View style={styles.filterArea}>
                <View style={styles.searchBar}>
                    <Search size={18} color="#94a3b8" />
                    <TextInput
                        placeholder="Search M-Pesa..."
                        style={styles.input}
                        placeholderTextColor="#94a3b8"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
                <TouchableOpacity style={styles.filterBtn}>
                    <Filter size={18} color="white" />
                </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tab, filter === 'all' && styles.activeTab]} onPress={() => setFilter('all')}>
                    <Text style={[styles.tabText, filter === 'all' && styles.activeTabText]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, filter === 'out' && styles.activeTab]} onPress={() => setFilter('out')}>
                    <Text style={[styles.tabText, filter === 'out' && styles.activeTabText]}>Out</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, filter === 'in' && styles.activeTab]} onPress={() => setFilter('in')}>
                    <Text style={[styles.tabText, filter === 'in' && styles.activeTabText]}>In</Text>
                </TouchableOpacity>
            </View>

            {/* List */}
            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={transactions.filter(t => t.description?.toLowerCase().includes(searchQuery.toLowerCase()) || t.category.toLowerCase().includes(searchQuery.toLowerCase()))}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 24 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Text style={{ color: '#94a3b8' }}>No transactions found</Text>
                        </View>
                    }
                />
            )}

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddExpense')}>
                <Plus size={32} color="#0d1b12" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0d1b12' },
    headerActions: { flexDirection: 'row', gap: 12 },
    iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },

    filterArea: { flexDirection: 'row', paddingHorizontal: 24, gap: 12, marginBottom: 16 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: '#e2e8f0' },
    input: { flex: 1, fontSize: 16, color: '#0d1b12' },
    filterBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#0d1b12', alignItems: 'center', justifyContent: 'center' },

    tabs: { flexDirection: 'row', paddingHorizontal: 24, gap: 8, marginBottom: 16 },
    tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)' },
    activeTab: { backgroundColor: '#0d1b12' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    activeTabText: { color: 'white' },

    transactionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    expenseIcon: { backgroundColor: '#fef2f2' },
    incomeIcon: { backgroundColor: '#f0fdf4' },

    txnDetails: { flex: 1 },
    txnTitle: { fontSize: 16, fontWeight: '600', color: '#0d1b12', marginBottom: 2 },
    txnTime: { fontSize: 12, color: '#94a3b8' },

    txnAmount: { fontSize: 16, fontWeight: 'bold' },
    txnMethod: { fontSize: 10, color: '#94a3b8', marginTop: 2 },

    fab: { position: 'absolute', bottom: 24, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
});

export default AnalyticsScreen;
