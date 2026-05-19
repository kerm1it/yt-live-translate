import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { saveDeepLApiKey, loadDeepLApiKey, clearAllData } from '../utils/storage';
import { translateText } from '../utils/deepl';

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadDeepLApiKey()
      .then((key) => {
        setApiKey(key);
        setSavedKey(key);
      })
      .catch(console.error);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      await saveDeepLApiKey(apiKey.trim());
      setSavedKey(apiKey.trim());
      Alert.alert('Saved', 'DeepL API key saved successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save API key.');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey]);

  const handleTest = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      Alert.alert('Error', 'Please enter an API key first.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await translateText('Hello, world!', key, 'ZH');
      setTestResult(`Translation test passed: "${result}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed.';
      setTestResult(`Test failed: ${message}`);
    } finally {
      setIsTesting(false);
    }
  }, [apiKey]);

  const handleClearData = useCallback(() => {
    Alert.alert(
      'Clear All Data',
      'This will remove your API key and all saved URLs. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              setApiKey('');
              setSavedKey('');
              setTestResult(null);
              Alert.alert('Done', 'All saved data has been cleared.');
            } catch {
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
        },
      ]
    );
  }, []);

  const hasChanges = apiKey.trim() !== savedKey;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DeepL API Key</Text>
        <Text style={styles.sectionDescription}>
          Required for translation. Get a free API key at deepl.com/pro#developer
          (Free tier: 500,000 chars/month).
        </Text>

        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={(text) => {
            setApiKey(text);
            setTestResult(null);
          }}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={false}
        />

        {testResult && (
          <View
            style={[
              styles.testResultBox,
              testResult.startsWith('Translation test passed')
                ? styles.testResultSuccess
                : styles.testResultError,
            ]}
          >
            <Text style={styles.testResultText}>{testResult}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.testButton, isTesting && styles.buttonDisabled]}
            onPress={handleTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Test Key</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.saveButton,
              (!hasChanges || isSaving) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
          <Text style={styles.dangerButtonText}>Clear All Saved Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>YT Live Translate v1.0.0</Text>
        <Text style={styles.aboutText}>
          Fetches subtitles from YouTube videos and translates them using DeepL.
        </Text>
        <Text style={styles.aboutText}>
          This app uses the YouTube timedtext API and DeepL Free API.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A9EFF',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionDescription: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: '#fff',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  testResultBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  testResultSuccess: {
    backgroundColor: '#0d2b1a',
    borderColor: '#2d6a4f',
  },
  testResultError: {
    backgroundColor: '#2b0d0d',
    borderColor: '#6a2d2d',
  },
  testResultText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#2a3a4a',
  },
  saveButton: {
    backgroundColor: '#4A9EFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#2b1010',
    borderWidth: 1,
    borderColor: '#6a2020',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#ff6b6b',
    fontSize: 15,
    fontWeight: '500',
  },
  aboutText: {
    color: '#666',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
});
