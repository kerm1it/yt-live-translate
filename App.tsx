import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import HomeScreen from './src/screens/HomeScreen';
import SubtitleScreen from './src/screens/SubtitleScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export interface TranslatedCue {
  text: string;
  start: number;
  duration: number;
  translated: string;
}

export type RootStackParamList = {
  Home: undefined;
  Subtitles: { cues: TranslatedCue[] };
  Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: '#1a1a1a' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '600' },
            cardStyle: { backgroundColor: '#0f0f0f' },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Subtitles"
            component={SubtitleScreen}
            options={{ title: 'Translated Subtitles' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
