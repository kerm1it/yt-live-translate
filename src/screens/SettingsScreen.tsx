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
import {
  saveTranslatorConfig,
  loadTranslatorConfig,
  clearAllData,
  DEFAULT_TRANSLATOR_CONFIG,
  TranslatorConfig,
} from '../utils/storage';
import { translateText } from '../utils/translator';

export default function SettingsScreen() {
  const [config, setConfig] = useState<TranslatorConfig>(DEFAULT_TRANSLATOR_CONFIG);
  const [savedConfig, setSavedConfig] = useState<TranslatorConfig>(DEFAULT_TRANSLATOR_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadTranslatorConfig()
      .then((c) => {
        setConfig(c);
        setSavedConfig(c);
      })
      .catch(console.error);
  }, []);

  const updateField = useCallback(<K extends keyof TranslatorConfig>(key: K, value: TranslatorConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const trimmed: TranslatorConfig = {
        baseUrl: config.baseUrl.trim(),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
        targetLang: config.targetLang.trim() || '中文',
      };
      await saveTranslatorConfig(trimmed);
      setConfig(trimmed);
      setSavedConfig(trimmed);
      Alert.alert('已保存', '翻译服务配置已保存。');
    } catch {
      Alert.alert('错误', '保存失败。');
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  const handleTest = useCallback(async () => {
    const trimmed: TranslatorConfig = {
      baseUrl: config.baseUrl.trim(),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
      targetLang: config.targetLang.trim() || '中文',
    };
    if (!trimmed.apiKey || !trimmed.baseUrl || !trimmed.model) {
      Alert.alert('错误', '请先填写 Base URL、API Key 和 Model。');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await translateText('Hello, world!', trimmed, trimmed.targetLang);
      setTestResult(`测试成功: "${result}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '测试失败。';
      setTestResult(`测试失败: ${message}`);
    } finally {
      setIsTesting(false);
    }
  }, [config]);

  const handleClearData = useCallback(() => {
    Alert.alert('清除所有数据', '将清除翻译服务配置和保存的 URL，确定吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAllData();
            setConfig(DEFAULT_TRANSLATOR_CONFIG);
            setSavedConfig(DEFAULT_TRANSLATOR_CONFIG);
            setTestResult(null);
            Alert.alert('完成', '所有数据已清除。');
          } catch {
            Alert.alert('错误', '清除失败。');
          }
        },
      },
    ]);
  }, []);

  const hasChanges =
    config.baseUrl.trim() !== savedConfig.baseUrl ||
    config.apiKey.trim() !== savedConfig.apiKey ||
    config.model.trim() !== savedConfig.model ||
    config.targetLang.trim() !== savedConfig.targetLang;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>翻译服务（OpenAI 兼容）</Text>
        <Text style={styles.sectionDescription}>
          支持任何 OpenAI 兼容的 /v1/chat/completions 接口：OpenAI、DeepSeek、OpenRouter、SiliconFlow、本地 vLLM/Ollama 等。
        </Text>

        <Text style={styles.fieldLabel}>Base URL</Text>
        <TextInput
          style={styles.input}
          value={config.baseUrl}
          onChangeText={(t) => updateField('baseUrl', t)}
          placeholder="https://api.deepseek.com/v1"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.fieldLabel}>API Key</Text>
        <TextInput
          style={styles.input}
          value={config.apiKey}
          onChangeText={(t) => updateField('apiKey', t)}
          placeholder="sk-..."
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={false}
        />

        <Text style={styles.fieldLabel}>Model</Text>
        <TextInput
          style={styles.input}
          value={config.model}
          onChangeText={(t) => updateField('model', t)}
          placeholder="deepseek-v4-flash"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.fieldLabel}>目标语言</Text>
        <TextInput
          style={styles.input}
          value={config.targetLang}
          onChangeText={(t) => updateField('targetLang', t)}
          placeholder="中文"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {testResult && (
          <View
            style={[
              styles.testResultBox,
              testResult.startsWith('测试成功')
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
              <Text style={styles.buttonText}>测试</Text>
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
              <Text style={styles.buttonText}>保存</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>数据</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
          <Text style={styles.dangerButtonText}>清除所有数据</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关于</Text>
        <Text style={styles.aboutText}>YT Live Translate v1.0.0</Text>
        <Text style={styles.aboutText}>
          通过 OpenAI 兼容接口翻译 YouTube 视频字幕。
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
  fieldLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
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
