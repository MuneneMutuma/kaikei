import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, View, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Home, Lightbulb, User, PlusCircle, BarChart3 } from 'lucide-react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

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
import ProfileScreen from './src/screens/ProfileScreen';
import { SettingsRepository } from './src/services/settings/SettingsRepository';
// Import IngestionService at module scope so Headless JS task is registered immediately
import { IngestionService } from './src/services/ingestion/IngestionService';

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
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Placeholder for Settings until implemented
const SettingsScreenPlaceholder = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>Settings &amp; Profile (Coming Soon)</Text>
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
          backgroundColor: colors.surface,
          paddingTop: 0,
          // paddingBottom: 80, // Extra spacing requested by user
          height: 68, // Taller tab bar
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
          tabBarButton: (props) => {
            const { onPress, onLongPress, accessibilityState, accessibilityLabel } = props;
            return (
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('SmsReader')}
                onLongPress={onLongPress || undefined}
                accessibilityState={accessibilityState}
                accessibilityLabel={accessibilityLabel}
                style={props.style}
              >
                {props.children}
              </TouchableOpacity>
            );
          },
        })}
      />

      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />


      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

const App = () => {
  const [initialRoute, setInitialRoute] = useState<"Setup" | "MainTabs">("Setup");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        await Database.init();
        console.log('Database initialized successfully');

        const settings = new SettingsRepository();
        const isComplete = await settings.isOnboardingComplete();
        if (isComplete) {
          setInitialRoute("MainTabs");
        }

        // Start auto-ingestion if enabled
        try {
          await IngestionService.start();
        } catch (e) {
          console.warn('IngestionService startup (non-critical):', e);
        }
      } catch (e) {
        console.error('Failed to initialize:', e);
      } finally {
        setLoading(false);
      }
    };
    init();

    return () => {
      // Cleanup ingestion on unmount
      IngestionService.stop();
    };
  }, []);

  if (loading) return null; // Or a splash screen

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
          <NavigationContainer>
            <Stack.Navigator initialRouteName={initialRoute}>
              <Stack.Screen
                name="Setup"
                component={SetupScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="MainTabs"
                component={MainTabs}
                options={{ headerShown: false }}
              />
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
              <Stack.Screen
                name="ModelDownload"
                component={ModelDownloadScreen}
                options={{ headerShown: false }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
