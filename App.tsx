import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import SmsReaderScreen from './src/screens/SmsReaderScreen';
import ModelDownloadScreen from './src/screens/ModelDownloadScreen';
import { Database } from './src/services/ledger/Database';

export type RootStackParamList = {
  Setup: undefined;
  Home: { name: string; persona: string };
  AddExpense: undefined;
  SmsReader: undefined;
  ModelDownload: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const App = () => {
  useEffect(() => {
    try {
      Database.init();
      console.log('Database initialized successfully');
    } catch (e) {
      console.error('Failed to initialize database:', e);
    }
  }, []);

  const [userName, setUserName] = useState<string | null>(null);
  const [persona, setPersona] = useState<string | null>(null);

  const handleSetupComplete = (name: string, selectedPersona: string, navigation: any) => {
    console.log(`User setup complete: ${name} (${selectedPersona})`);
    setUserName(name);
    setPersona(selectedPersona);
    navigation.replace('Home', { name, persona: selectedPersona });
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Setup">
          <Stack.Screen
            name="Setup"
            options={{ headerShown: false }}
          >
            {({ navigation }) => (
              <SetupScreen
                onComplete={(name, persona) => handleSetupComplete(name, persona, navigation)}
              />
            )}
          </Stack.Screen>

          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={({ navigation }: any) => ({
              title: 'Kaikei',
              headerBackVisible: false,
              headerRight: () => (
                <TouchableOpacity onPress={() => navigation.navigate('ModelDownload')} style={{ padding: 10 }}>
                  <Text style={{ fontSize: 20 }}>🧠</Text>
                </TouchableOpacity>
              )
            })}
          />

          <Stack.Screen
            name="AddExpense"
            component={AddExpenseScreen}
            options={{ title: 'Add Expense' }}
          />

          <Stack.Screen
            name="SmsReader"
            component={SmsReaderScreen}
            options={{ title: 'SMS Reader' }}
          />

          <Stack.Screen
            name="ModelDownload"
            component={ModelDownloadScreen}
            options={{ title: 'AI Settings' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
