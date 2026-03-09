import React, { useEffect, useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform, PermissionsAndroid, Linking, Alert, TouchableOpacity, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { EventType } from '@notifee/react-native';
import { SettingsRepository } from './src/services/settings/SettingsRepository';
import { IngestionService } from './src/services/ingestion/IngestionService';
import { AutoClassifier } from './src/services/intelligence/AutoClassifier';
import { Database } from './src/services/ledger/Database';
import { colors } from './src/theme/colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SetupScreen from './src/screens/SetupScreen';
import SmsReaderScreen from './src/screens/SmsReaderScreen'; // Legacy for debug
import VoiceInput from './src/screens/VoiceInput';
import AdviceScreen from './src/screens/AdviceScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import VisualAnalyticsScreen from './src/screens/VisualAnalyticsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AddManualExpenseScreen from './src/screens/AddManualExpenseScreen';
import AiManagementScreen from './src/screens/AiManagementScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { BudgetDetailScreen } from './src/screens/BudgetDetailScreen';
import { BudgetSetupScreen } from './src/screens/BudgetSetupScreen';
import { AddBudgetItemScreen } from './src/screens/AddBudgetItemScreen';
import { EditActualAmountScreen } from './src/screens/EditActualAmountScreen';
import { ReconciliationScreen } from './src/screens/ReconciliationScreen';
import QuickCategoryScreen from './src/screens/QuickCategoryScreen';

// Icons
import { LayoutDashboard, Wallet, Mic, Lightbulb, User, Plus, Bike, BarChart3, PieChart, Target } from 'lucide-react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

export type RootStackParamList = {
  Onboarding: undefined;
  Setup: { name: string; persona: string };
  MainTabs: undefined;
  SmsReader: undefined;
  AddExpense: undefined; // Voice Input
  AddManual: undefined; // Manual Entry
  SmartSuggestion: { name: string, count: number };
  Profile: undefined;
  AiManagement: undefined;
  BudgetDetail: { categoryId: string; month: string; spentAmount: number; itemizedAmount: number; limitAmount: number; categoryName: string };
  BudgetSetup: { currentMonth: string; initialCategoryId?: string; initialLimitAmount?: number; initialBudgetLineId?: string };
  AddBudgetItem: { budgetLineId: string; categoryId: string; isUnplanned: boolean; month: string };
  EditActualAmount: { breakdownId: string; tagName: string; currentAmount: number; plannedAmount: number };
  Reconciliation: { categoryId: string; month: string; tagId?: string };
  QuickCategory: { txId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Analytics: undefined; // Graphs
  Budgets: undefined;
  Wallet: undefined;
  Insights: undefined;
};

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: 'white', // card-light
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          height: 70 + (insets.bottom > 0 ? insets.bottom : 20), // Increased base height & fallback
          paddingBottom: (insets.bottom > 0 ? insets.bottom : 20), // Added more breathing room
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 4 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} />
        }}
      />

      {/* Analytics (Graphs) - Replaces Trips */}
      <Tab.Screen
        name="Analytics"
        component={VisualAnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ color }) => <PieChart size={24} color={color} />
        }}
      />

      <Tab.Screen
        name="Budgets"
        component={BudgetScreen}
        options={{
          tabBarLabel: 'Budgets',
          tabBarIcon: ({ color }) => <Target size={24} color={color} />
        }}
      />

      <Tab.Screen
        name="Wallet"
        component={AnalyticsScreen} // Mapped to Ledger/Analytics
        options={{
          tabBarLabel: 'Wallet',
          tabBarIcon: ({ color }) => <Wallet size={24} color={color} />
        }}
      />

      <Tab.Screen
        name="Insights"
        component={AdviceScreen} // Mapped to Advice/Insights
        options={{
          tabBarLabel: 'Insights',
          tabBarIcon: ({ color }) => <BarChart3 size={24} color={color} />
        }}
      />
    </Tab.Navigator>
  );
}




const TripsPlaceholder = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
    <Bike size={48} color={colors.primary} />
    <Text style={{ marginTop: 16, fontSize: 18, fontWeight: 'bold', color: colors.text }}>Trips Coming Soon</Text>
    <Text style={{ marginTop: 8, color: '#64748b' }}>Track your rides and mileage here.</Text>
  </View>
);

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        try {
          const txId = await AsyncStorage.getItem('pendingCategoryTxId');
          if (txId) {
            await AsyncStorage.removeItem('pendingCategoryTxId');
            // Give navigation time to mount
            setTimeout(() => {
              if (navigationRef.isReady()) {
                navigationRef.navigate('QuickCategory', { txId });
              }
            }, 300);
          }
        } catch (e) {
          console.error('App: Failed to check pending category popup', e);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    handleAppStateChange(AppState.currentState);

    return () => sub.remove();
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Initialize Database
        console.log('App: Initializing Database...');
        await Database.init();
        setIsDbReady(true);

        // 2. Check Setup Status (only after DB is ready)
        const settings = new SettingsRepository();
        const isSetup = await settings.isOnboardingComplete();
        setIsFirstLaunch(!isSetup);



        // 4. Start Services (only after DB is ready)
        console.log('App: Starting Background Services...');
        // Note: IngestionService is a singleton instance export, not a class we instantiate here
        // But accessing properties or methods typically needs initialization if they assume DB presence
        await IngestionService.start();
        await AutoClassifier.getInstance().start();

      } catch (e) {
        console.error('App Initialization Failed:', e);
        Alert.alert("Initialization Error", "Failed to start Kaikei database.");
      }
    };

    // Delay slightly to ensure Activity is attached for permissions
    const timer = setTimeout(() => {
      initApp();
    }, 500);

    return () => clearTimeout(timer);
  }, []);



  if (!isDbReady || isFirstLaunch === null) {
    // Splash Loading State
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.primaryDark, fontWeight: 'bold' }}>Starting Kaikei...</Text>
      </View>
    );
  }

  const linking = {
    prefixes: ['kaikei://'],
    config: {
      screens: {
        QuickCategory: 'category/:txId',
      },
    },
    async getInitialURL() {
      const url = await Linking.getInitialURL();
      if (url != null) return url;
      
      const initialNotification = await notifee.getInitialNotification();
      if (initialNotification?.pressAction?.id === 'cat_other' || initialNotification?.pressAction?.id === 'action_change' || initialNotification?.pressAction?.id === 'default') {
        const txId = initialNotification.notification.data?.tx_id;
        if (txId) return `kaikei://category/${txId}`;
      }
      return null;
    },
    subscribe(listener: (url: string) => void) {
      const onReceiveURL = ({ url }: { url: string }) => listener(url);
      const linkingSubscription = Linking.addEventListener('url', onReceiveURL);
      
      const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.PRESS || (type === EventType.ACTION_PRESS && (detail.pressAction?.id === 'cat_other' || detail.pressAction?.id === 'action_change'))) {
          const txId = detail.notification?.data?.tx_id;
          if (txId) listener(`kaikei://category/${txId}`);
        }
      });

      return () => {
        linkingSubscription.remove();
        unsubscribeNotifee();
      };
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer 
        ref={navigationRef}
        linking={linking}
        theme={{
        dark: false,
        colors: {
          primary: colors.primary,
          background: colors.surface, // Default to White for Onboarding/Setup
          card: 'white',
          text: '#0d1b12',
          border: '#e2e8f0',
          notification: colors.danger,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        }
      }}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
          {isFirstLaunch ? (
            <>
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen name="Setup" component={SetupScreen} />
              <Stack.Screen name="MainTabs" component={MainTabs} />
            </>
          ) : (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen name="Setup" component={SetupScreen} />
            </>
          )}

          {/* Modals & Full Screens */}
          <Stack.Screen
            name="AddExpense"
            component={VoiceInput}
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="AddManual"
            component={AddManualExpenseScreen}
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="SmsReader" component={SmsReaderScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="AiManagement" component={AiManagementScreen} />
          <Stack.Screen name="BudgetDetail" component={BudgetDetailScreen} />
          <Stack.Screen name="BudgetSetup" component={BudgetSetupScreen} />
          <Stack.Screen name="AddBudgetItem" component={AddBudgetItemScreen} />
          <Stack.Screen name="EditActualAmount" component={EditActualAmountScreen} />
          <Stack.Screen name="Reconciliation" component={ReconciliationScreen} />
          <Stack.Screen 
            name="QuickCategory" 
            component={QuickCategoryScreen}
            options={{ presentation: 'transparentModal', animation: 'fade' }}
          />
        </Stack.Navigator>
      </NavigationContainer >
    </GestureHandlerRootView >
  );
}
