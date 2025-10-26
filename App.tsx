import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import SmsReaderScreen from './src/screens/SmsReaderScreen';

export type RootStackParamList = {
  Setup: undefined;
  Home: { name: string; persona: string };
  AddExpense: undefined;
  SmsReader: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const App = () => {
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
            options={{ title: 'Home', headerBackVisible: false }}
          >
            {({ route, navigation }) => (
              <HomeScreen
                name={route.params.name}
                persona={route.params.persona}
                onNavigate={(screen) => navigation.navigate(screen as any)}
              />
            )}
          </Stack.Screen>

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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
