import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform, PermissionsAndroid, Linking, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SettingsRepository } from './src/services/settings/SettingsRepository';
import { IngestionService } from './src/services/ingestion/IngestionService';
import { AutoClassifier } from './src/services/intelligence/AutoClassifier';
import { Database } from './src/services/ledger/Database';
import { colors } from './src/theme/colors';

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

// Icons
import { LayoutDashboard, Wallet, Mic, Lightbulb, User, Plus, Bike, BarChart3, PieChart } from 'lucide-react-native';

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
};

export type MainTabParamList = {
  Home: undefined;
  Analytics: undefined; // Graphs
  Wallet: undefined;
  Reports: undefined;
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: 'white', // card-light
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          height: 70,
          paddingBottom: 10,
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
        name="Wallet"
        component={AnalyticsScreen} // Mapped to Ledger/Analytics
        options={{
          tabBarLabel: 'Wallet',
          tabBarIcon: ({ color }) => <Wallet size={24} color={color} />
        }}
      />

      <Tab.Screen
        name="Reports"
        component={AdviceScreen} // Mapped to Advice/Insights
        options={{
          tabBarLabel: 'Reports',
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

  return (
    <NavigationContainer theme={{
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
