import React, { useState } from 'react';
import { SafeAreaView } from 'react-native';
import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import SmsReaderScreen from './src/screens/SmsReaderScreen';


type Screen = 'setup' | 'home' | 'addExpense' | 'smsReader';

const App = () => {
  const [userName, setUserName] = useState<string | null>(null);
  const [persona, setPersona] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('setup');

  const handleSetupComplete = (name: string, selectedPersona: string) => {
    console.log(`User setup complete: ${name} (${selectedPersona})`);
    setUserName(name);
    setPersona(selectedPersona);
    setCurrentScreen('home');
  };

  const handleNavigate = (screen: Screen) => {
    console.log(`Navigating to ${screen}`);
    setCurrentScreen(screen);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {currentScreen === 'setup' && <SetupScreen onComplete={handleSetupComplete} />}
      {currentScreen === 'home' && (
        <HomeScreen
          name={userName!}
          persona={persona!}
          onNavigate={handleNavigate}
        />
      )}
      {currentScreen === 'addExpense' && (
        <AddExpenseScreen
          onBack={() => handleNavigate('home')}
        />
      )}
      {currentScreen === 'smsReader' && (
        <SmsReaderScreen />
      )}
    </SafeAreaView>
  );
};

export default App;
