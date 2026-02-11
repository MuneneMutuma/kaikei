import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Home, Lightbulb, User, PlusCircle, BarChart3 } from 'lucide-react-native';

import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import SmsReaderScreen from './src/screens/SmsReaderScreen';
import ModelDownloadScreen from './src/screens/ModelDownloadScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import AdviceScreen from './src/screens/AdviceScreen';
import { SmartSuggestionScreen } from './src/screens/SmartSuggestionScreen';
import { Database } from './src/services/ledger/Database';
import { colors } from './src/theme/colors';

export type RootStackParamList = {
  Setup: undefined;
  MainTabs: undefined; // The Tab Navigator
  AddExpense: undefined;
  SmsReader: undefined;
  ModelDownload: undefined;
  SmartSuggestion: { name: string; count: number };
};

export type MainTabParamList = {
  Home: undefined;
  Advice: undefined;
  Import: undefined; // Floating Button Placeholder
  Analytics: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Placeholder for Settings until implemented
const SettingsScreenPlaceholder = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>Settings & Profile (Coming Soon)</Text>
  </View>
);

// Custom FAB Component for the middle button
const ImportPlaceholder = () => null;

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 10,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: colors.surface,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Advice"
        component={AdviceScreen}
        options={{
          tabBarLabel: 'Advice',
          tabBarIcon: ({ color, size }) => <Lightbulb color={color} size={size} />,
        }}
      />

      {/* Central "Add" Button - Triggers Action Sheet or Navigation */}
      <Tab.Screen
        name="Import"
        component={ImportPlaceholder}
        options={({ navigation }) => ({
          tabBarLabel: () => null,
          tabBarIcon: ({ size }) => (
            <View style={{
              marginTop: -24,
              backgroundColor: colors.primary,
              padding: 12,
              borderRadius: 30,
              elevation: 5,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 4,
            }}>
              <PlusCircle color="white" size={32} />
            </View>
          ),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => navigation.navigate('SmsReader')} // Quick Action: Go to Import
            />
          ),
        })}
      />

      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Trends',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ModelDownloadScreen} // Reusing ModelDownload as Settings for now
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

const App = () => {
  useEffect(() => {
    try {
      Database.init();
      console.log('Database initialized successfully');
    } catch (e) {
      console.error('Failed to initialize database:', e);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Setup">
          <Stack.Screen
            name="Setup"
            component={SetupScreen}
            options={{ headerShown: false }}
          />

          {/* Main App Entry Point */}
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />

          {/* Modals & Full Screen Flows */}
          <Stack.Screen
            name="AddExpense"
            component={AddExpenseScreen}
            options={{ title: 'Add Expense' }}
          />
          <Stack.Screen
            name="SmsReader"
            component={SmsReaderScreen}
            options={{ title: 'Import Transactions' }}
          />
          <Stack.Screen
            name="SmartSuggestion"
            component={SmartSuggestionScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
