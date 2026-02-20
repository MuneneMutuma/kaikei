import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity, StatusBar, ScrollView, Animated, RefreshControl, Dimensions
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Settings, Cloud, Zap, ArrowRight, Mic, Plus, ArrowLeftRight, TrendingUp, Wallet, Lightbulb, ChevronRight, CheckCircle, BarChart3, Sparkles, RefreshCw, Bike, GraduationCap, Briefcase, ShoppingBasket } from 'lucide-react-native';
import { BarChart } from 'react-native-gifted-charts';
import { colors } from "../theme/colors";
import { ExpenseRepository } from "../services/ledger/ExpenseRepository";
import { SettingsRepository } from "../services/settings/SettingsRepository";
import { InsightRepository } from "../services/intelligence/InsightRepository";
import { Insight } from "../services/intelligence/InsightGenerator";
import { IngestionEvents, INGESTION_EVENT } from "../services/ingestion/IngestionEvents";
import { Expense } from "../services/ledger/Schema";

// Helper to format date relative (Today, Yesterday, etc)
const formatRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (date.toDateString() === now.toDateString()) return `Today, ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const CLOUD_ICON = <Cloud size={16} color={colors.primary} />;

export default function HomeScreen({ navigation }: any) {
  const [userName, setUserName] = useState("Kamau");
  const [userPersona, setUserPersona] = useState("student"); // Default
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(false);

  // Chart Data
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [latestInsight, setLatestInsight] = useState<Insight | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);

  // Animation for large mic button
  const scale = useRef(new Animated.Value(1)).current;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const settingsRepo = new SettingsRepository();
    const expenseRepo = new ExpenseRepository();
    const insightRepo = new InsightRepository();

    try {
      // Load Profile
      const profile = await settingsRepo.getUserSettings();
      setUserName(profile.userName || "Kamau");
      setUserPersona(profile.userPersona?.toLowerCase() || "student");

      // Load Recent Activity (today)
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const monthExpenses = await expenseRepo.getExpensesByMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      const todayTotal = monthExpenses
        .filter(e => e.date.startsWith(todayStr) && e.type === 'expense')
        .reduce((acc, curr) => acc + curr.amount, 0);

      setTotalSpent(todayTotal);

      // Load Weekly Data for Chart
      // We need last 7 days.
      // Logic: Iterate last 7 days, filter monthExpenses? 
      // Better: Create a helper or just iterate manually here for simplicity as we have month data (assuming late month).
      // Ideally we should query repo for range, but reuse monthExpenses if date is > 7th.
      // Let's implement a quick helper for demonstration.

      const last7Days: any[] = [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        // naive filter from loaded month data (might miss previous month if today is 1st)
        // Production: Use repo.getExpensesInRange(start, end)
        // For now, let's just use what we loaded.

        const dayTotal = monthExpenses
          .filter(e => e.date.startsWith(dStr) && e.type === 'expense')
          .reduce((sum, e) => sum + e.amount, 0);

        last7Days.push({
          value: dayTotal,
          label: days[d.getDay()],
          frontColor: dayTotal > 2000 ? colors.danger : colors.primary,
          spacing: 14,
          labelTextStyle: { fontSize: 10, color: '#64748b' }
        });
      }
      setWeeklyData(last7Days);

      // Load Latest Insight
      const activeInsights = await insightRepo.getInsights('active', 1);
      if (activeInsights.length > 0) {
        setLatestInsight(activeInsights[0]);
      } else {
        setLatestInsight(null);
      }

      // Load Recent Expenses (Snapshot)
      const recent = await expenseRepo.getRecentExpenses(3);
      setRecentExpenses(recent);

    } catch (e) {
      console.error("Home Load Error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      StatusBar.setBarStyle('dark-content');
      StatusBar.setBackgroundColor('transparent');
      StatusBar.setTranslucent(true);
    }, [fetchData])
  );

  // Pulse Animation Loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1500, useNativeDriver: true })
      ])
    ).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileRow}>
          <View style={styles.avatarContainer}>
            <View style={styles.personaAvatar}>
              {userPersona.includes('boda') ? <Bike size={24} color={colors.primary} /> :
                userPersona.includes('mama') ? <ShoppingBasket size={24} color={colors.primary} /> :
                  userPersona.includes('prof') ? <Briefcase size={24} color={colors.primary} /> :
                    <GraduationCap size={24} color={colors.primary} />}
            </View>
            <View style={styles.onlineBadge} />
          </View>
          <View>
            <Text style={styles.greeting}>Habari,</Text>
            <Text style={styles.name}>{userName}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Profile')}>
          <Settings size={24} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* Sync Status Pill */}
      <View style={styles.syncContainer}>
        <View style={styles.syncBadge}>
          <CheckCircle size={14} color={colors.primaryDark} />
          <Text style={styles.syncText}>Last updated: Just now</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Stats Row */}
        <View style={[styles.statsRow, { marginTop: 20 }]}>
          <View style={styles.statCompact}>
            <Text style={styles.statLabel}>Today's Spend</Text>
            <Text style={styles.statValueCompact}>KES {totalSpent.toLocaleString()}</Text>
          </View>
          <TouchableOpacity style={styles.statCompact} onPress={() => navigation.navigate('Analytics')}>
            <Text style={styles.statLabel}>Monthly Total</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.statValueCompact}>View Details</Text>
              <ChevronRight size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Quick Actions Grid (Sticky) */}
        <View style={{ backgroundColor: colors.background, paddingBottom: 12 }}>
          <View style={[styles.actionsGrid, { marginBottom: 0 }]}>
            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('AddExpense')}>
              <View style={[styles.actionIcon, { backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' }]}>
                <Mic size={24} color={colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Speak</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('AddManual')}>
              <View style={[styles.actionIcon, { backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' }]}>
                <Plus size={24} color={colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Add Cash</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('SmsReader')}>
              <View style={[styles.actionIcon, { backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' }]}>
                <RefreshCw size={24} color={colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Sync M-Pesa</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Insights')}>
              <View style={[styles.actionIcon, { backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' }]}>
                <Sparkles size={24} color={colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Ask AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Spending Pulse Chart - Only show if there is data */}
        {weeklyData.reduce((acc, item) => acc + (item.value || 0), 0) > 0 && (
          <View style={[styles.chartCard, { marginTop: 8 }]}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>Spending Pulse</Text>
                <Text style={styles.chartSubtitle}>Last 7 Days</Text>
              </View>
              <BarChart3 size={20} color={colors.primary} />
            </View>

            <View>
              {weeklyData.length > 0 ? (
                <BarChart
                  data={weeklyData}
                  width={Dimensions.get('window').width - 80}
                  minHeight={10}
                  barBorderRadius={4}
                  frontColor={colors.primary}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={'#e2e8f0'}
                  hideRules
                  hideYAxisText={false}
                  yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
                  isAnimated
                  noOfSections={3}
                />
              ) : (
                <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#94a3b8' }}>Loading chart...</Text>
                </View>
              )}

              <TouchableOpacity style={styles.chartAction} onPress={() => navigation.navigate('Analytics')}>
                <Text style={styles.chartActionText}>View Analytics</Text>
                <ChevronRight size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Insight Summary Widget */}
        {latestInsight ? (
          <TouchableOpacity style={styles.insightWidget} onPress={() => navigation.navigate('Insights')}>
            <View style={styles.insightHeader}>
              <View style={styles.insightTag}>
                <Lightbulb size={12} color="#fff" />
                <Text style={styles.insightTagText}>INSIGHT</Text>
              </View>
              <Text style={styles.insightDate}>Just now</Text>
            </View>
            <Text style={styles.insightTitle}>{latestInsight.title}</Text>
            <Text style={styles.insightBody} numberOfLines={2}>{latestInsight.description}</Text>
            <View style={styles.insightFooter}>
              <Text style={styles.insightAction}>Tap to view full analysis</Text>
              <ArrowRight size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.insightWidget, { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }]} onPress={() => navigation.navigate('Insights')}>
            <Sparkles size={32} color={colors.primary} style={{ marginBottom: 8, opacity: 0.5 }} />
            <Text style={{ color: '#64748b', fontWeight: '500' }}>No new insights yet</Text>
            <Text style={{ color: colors.primary, marginTop: 4, fontWeight: 'bold' }}>Generate Analysis</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />

        {/* Recent Activity Snapshot */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Analytics')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.recentList}>
          {recentExpenses.length > 0 ? (
            recentExpenses.map((expense, index) => (
              <View key={expense.id} style={[styles.recentItem, index === recentExpenses.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.recentIcon}>
                  <Wallet size={20} color={colors.primaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{expense.description || expense.recipient || "Unknown"}</Text>
                  <Text style={styles.recentDate}>{formatRelativeDate(expense.date)}</Text>
                </View>
                <Text style={[styles.recentAmount, { color: expense.type === 'income' ? colors.success : '#0d1b12' }]}>
                  {expense.type === 'income' ? '+' : '-'} {expense.amount.toLocaleString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No recent activity</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 50, paddingBottom: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarContainer: { position: 'relative' },
  personaAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.primary, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.primary },
  onlineBadge: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 2, borderColor: 'white' },
  greeting: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  name: { fontSize: 20, color: '#0d1b12', fontWeight: 'bold', lineHeight: 24 },
  settingsButton: { padding: 8, borderRadius: 20, backgroundColor: '#f1f5f9' },

  syncContainer: { paddingHorizontal: 24, paddingBottom: 16 },
  syncBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(19, 236, 91, 0.1)', borderWidth: 1, borderColor: 'rgba(19, 236, 91, 0.2)' },
  syncText: { fontSize: 11, color: '#0f172a', fontWeight: '500' },

  scrollContent: { paddingBottom: 20 },

  // New Stats Row
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  statCompact: { flex: 1, backgroundColor: 'white', padding: 12, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  statValueCompact: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12', marginTop: 4 },

  // Chart Card
  chartCard: { backgroundColor: 'white', marginHorizontal: 20, borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
  chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
  chartSubtitle: { fontSize: 12, color: '#64748b' },
  chartAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  chartActionText: { fontSize: 13, color: colors.primary, fontWeight: '600', marginRight: 4 },

  // Actions Grid
  actionsGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 24 },
  actionItem: { alignItems: 'center', width: '22%' },
  actionIcon: { width: 56, height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionLabel: { fontSize: 12, fontWeight: '600', color: '#475569' },

  // Insight Widget
  insightWidget: { backgroundColor: 'white', marginHorizontal: 20, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1, marginBottom: 24 },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  insightTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  insightTagText: { color: 'white', fontSize: 10, fontWeight: '800' },
  insightDate: { fontSize: 12, color: '#94a3b8' },
  insightTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12', marginBottom: 4 },
  insightBody: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 12 },
  insightFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  insightAction: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Old styles (kept for mic button mostly)
  actionArea: { paddingHorizontal: 20, paddingBottom: 20 },
  micButtonWrapper: { alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 10 },
  micPulse: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(19, 236, 91, 0.2)' },
  micButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  micLabel: { marginTop: 12, fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
  micSubLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },

  // Reused styles
  grid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 20, height: 160, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, overflow: 'hidden', position: 'relative' },
  bgIcon: { position: 'absolute', right: -10, top: -10 },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  expenseBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  expenseBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#dc2626' },
  successBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  successBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#15803d' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#0d1b12', marginBottom: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText: { fontSize: 11, fontWeight: '500', color: '#ef4444' },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  safeText: { fontSize: 11, fontWeight: '500', color: colors.primaryDark },
  // Keeping insightCard for reference or if used elsewhere, but new design uses insightWidget
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffedd5', borderRadius: 12, marginBottom: 24 },
  insightIcon: { padding: 8, backgroundColor: '#ffedd5', borderRadius: 20 },
  insightDesc: { fontSize: 13, color: '#475569', marginTop: 2 },

  secondaryActions: { flexDirection: 'row', gap: 12, width: '100%' },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e2e8f0', padding: 16, borderRadius: 12 },
  actionButtonText: { fontSize: 14, fontWeight: 'bold', color: '#0d1b12' },

  // Recent Activity Styles
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0d1b12' },
  seeAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  recentList: { backgroundColor: 'white', marginHorizontal: 20, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  recentIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  recentTitle: { fontSize: 14, fontWeight: '600', color: '#0d1b12' },
  recentDate: { fontSize: 12, color: '#64748b', marginTop: 2 },
  recentAmount: { fontSize: 14, fontWeight: 'bold' },
});
