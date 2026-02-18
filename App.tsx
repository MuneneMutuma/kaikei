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
import ProfileScreen from './src/screens/ProfileScreen';

// Icons
import { LayoutDashboard, Wallet, Mic, Lightbulb, User, Plus } from 'lucide-react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

export type RootStackParamList = {
  Onboarding: undefined;
  Setup: { name: string; persona: string };
  MainTabs: undefined;
  SmsReader: undefined;
  AddExpense: undefined; // Generic add expense (voice/manual)
  SmartSuggestion: { name: string, count: number };
  Profile: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Ledger: undefined;
  Voice: undefined; // Placeholder for FAB
  Advice: undefined;
  Profile: undefined;
};

// Custom FAB Component for the center button
const VoiceFabButton = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity
    style={{
      top: -24,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 8,
    }}
    onPress={onPress}
  >
    <View style={{
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: colors.background,
    }}>
      <Mic size={32} color="#0d1b12" />
    </View>
  </TouchableOpacity>
);

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          backgroundColor: 'white',
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
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={24} color={color} />
        }}
      />
      <Tab.Screen
        name="Ledger"
        component={AnalyticsScreen} // Analytics is now the Ledger
        options={{
          tabBarLabel: 'Ledger',
          tabBarIcon: ({ color, size }) => <Wallet size={24} color={color} />
        }}
      />

      {/* Center Voice Button */}
      <Tab.Screen
        name="Voice"
        component={VoiceViewPlaceholder} // Dummy component
        options={({ navigation }) => ({
          tabBarButton: (props) => (
            <VoiceFabButton onPress={() => (navigation as any).navigate('AddExpense')} />
          ),
          tabBarLabel: '',
        })}
      />

      <Tab.Screen
        name="Advice"
        component={AdviceScreen}
        options={{
          tabBarLabel: 'Advice',
          tabBarIcon: ({ color, size }) => <Lightbulb size={24} color={color} />
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={24} color={color} />
        }}
      />
    </Tab.Navigator>
  );
}

const VoiceViewPlaceholder = () => <View style={{ flex: 1, backgroundColor: colors.background }} />;

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
        <Stack.Screen name="SmsReader" component={SmsReaderScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
