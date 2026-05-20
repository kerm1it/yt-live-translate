import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  NativeModules,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { fetchYouTubeSubtitles, SubtitleCue } from '../utils/youtube';
import { translateSubtitles } from '../utils/translator';
import { loadTranslatorConfig, saveRecentUrl, loadRecentUrls } from '../utils/storage';
import type { RootStackParamList } from '../../App';

type HomeNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

type LoadingStage = 'idle' | 'fetching' | 'translating' | 'done';

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();
  const [url, setUrl] = useState('');
  const [overlayActive, setOverlayActive] = useState(false);
  const [hasOverlayPerm, setHasOverlayPerm] = useState<boolean | null>(null);
  const [hasA11yPerm, setHasA11yPerm] = useState<boolean | null>(null);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  const isLoading = loadingStage !== 'idle' && loadingStage !== 'done';

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const { OverlayModule } = NativeModules;
      if (!OverlayModule) return;
      OverlayModule.hasOverlayPermission((granted: boolean) => setHasOverlayPerm(granted));
      OverlayModule.isAccessibilityEnabled((enabled: boolean) => setHasA11yPerm(enabled));
    }, [])
  );

  const handleToggleOverlay = useCallback(async () => {
    const { OverlayModule } = NativeModules;
    if (!OverlayModule) return;
    if (overlayActive) {
      OverlayModule.stopOverlay();
      setOverlayActive(false);
      return;
    }
    if (!hasOverlayPerm) {
      Alert.alert(
        '需要权限',
        '请授予"显示在其他应用上层"权限，悬浮窗才能覆盖在 YouTube 上方。',
        [
          { text: '取消', style: 'cancel' },
          { text: '去设置', onPress: () => OverlayModule.openOverlayPermissionSettings() },
        ]
      );
      return;
    }
    if (!hasA11yPerm) {
      Alert.alert(
        '需要无障碍权限',
        '请在无障碍设置中开启"YT Live Translate"，以便读取 YouTube 字幕。',
        [
          { text: '取消', style: 'cancel' },
          { text: '去无障碍设置', onPress: () => OverlayModule.openAccessibilitySettings() },
        ]
      );
      return;
    }
    const cfg = await loadTranslatorConfig();
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      Alert.alert('需要翻译服务配置', '请先在设置中填写 Base URL、API Key 和 Model。', [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => navigation.navigate('Settings') },
      ]);
      return;
    }
    OverlayModule.startOverlay({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      targetLang: cfg.targetLang,
    });
    setOverlayActive(true);
  }, [overlayActive, hasOverlayPerm, hasA11yPerm, navigation]);

  const loadRecent = useCallback(async () => {
    const urls = await loadRecentUrls();
    setRecentUrls(urls);
    setShowRecent(urls.length > 0);
  }, []);

  const handleFocus = useCallback(() => {
    loadRecent().catch(console.error);
  }, [loadRecent]);

  const handleFetch = useCallback(async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      Alert.alert('Error', 'Please enter a YouTube video URL.');
      return;
    }

    const cfg = await loadTranslatorConfig();
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      Alert.alert(
        '需要翻译服务配置',
        '请先在设置中填写 Base URL、API Key 和 Model。',
        [
          { text: '取消', style: 'cancel' },
          { text: '去设置', onPress: () => navigation.navigate('Settings') },
        ]
      );
      return;
    }

    try {
      setLoadingStage('fetching');
      setProgress(0);
      setShowRecent(false);

      const cues: SubtitleCue[] = await fetchYouTubeSubtitles(trimmedUrl);

      setLoadingStage('translating');

      const texts = cues.map((c) => c.text);
      const translated = await translateSubtitles(texts, cfg, cfg.targetLang, (done, total) => {
        setProgress(Math.round((done / total) * 100));
      });

      const translatedCues = cues.map((cue, i) => ({
        ...cue,
        translated: translated[i] ?? cue.text,
      }));

      await saveRecentUrl(trimmedUrl);
      setLoadingStage('done');

      navigation.navigate('Subtitles', { cues: translatedCues });
      setLoadingStage('idle');
    } catch (error) {
      setLoadingStage('idle');
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      Alert.alert('Error', message);
    }
  }, [url, navigation]);

  const handleSelectRecent = (recentUrl: string) => {
    setUrl(recentUrl);
    setShowRecent(false);
  };

  const getLoadingText = () => {
    switch (loadingStage) {
      case 'fetching':
        return 'Fetching subtitles from YouTube...';
      case 'translating':
        return `Translating... ${progress}%`;
      default:
        return '';
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>YT Translate</Text>
          <Text style={styles.subtitle}>YouTube subtitles → Chinese</Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.label}>YouTube Video URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            onFocus={handleFocus}
            placeholder="https://www.youtube.com/watch?v=..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isLoading}
          />

          {showRecent && recentUrls.length > 0 && (
            <View style={styles.recentList}>
              <Text style={styles.recentLabel}>Recent</Text>
              {recentUrls.map((recentUrl) => (
                <TouchableOpacity
                  key={recentUrl}
                  style={styles.recentItem}
                  onPress={() => handleSelectRecent(recentUrl)}
                >
                  <Text style={styles.recentText} numberOfLines={1}>
                    {recentUrl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4A9EFF" />
            <Text style={styles.loadingText}>{getLoadingText()}</Text>
            {loadingStage === 'translating' && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleFetch}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Fetch &amp; Translate</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.settingsButtonText}>⚙ Settings</Text>
        </TouchableOpacity>

        {Platform.OS === 'android' && (
          <View style={styles.overlaySection}>
            <View style={styles.overlayHeader}>
              <View style={[styles.statusDot, overlayActive && styles.statusDotActive]} />
              <Text style={styles.overlayTitle}>
                {overlayActive ? '悬浮字幕运行中' : '实时悬浮字幕'}
              </Text>
            </View>
            <Text style={styles.overlayDescription}>
              打开 YouTube 并开启英文 CC 字幕，然后启动悬浮窗，即可实时看到中文翻译。
            </Text>
            <TouchableOpacity
              style={[styles.overlayButton, overlayActive && styles.overlayButtonStop]}
              onPress={handleToggleOverlay}
            >
              <Text style={styles.overlayButtonText}>
                {overlayActive ? '停止悬浮字幕' : '启动悬浮字幕'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            粘贴 YouTube 视频链接，应用会抓取字幕并通过 OpenAI 兼容服务翻译。
          </Text>
          <Text style={styles.infoText}>
            在「设置」中填写 Base URL、API Key 和 Model（支持 OpenAI / DeepSeek / OpenRouter 等）。
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#fff',
  },
  recentList: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  recentLabel: {
    fontSize: 11,
    color: '#666',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recentItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  recentText: {
    color: '#4A9EFF',
    fontSize: 13,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4A9EFF',
    borderRadius: 2,
  },
  button: {
    backgroundColor: '#4A9EFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#2a4a6e',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  settingsButton: {
    padding: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  settingsButtonText: {
    color: '#888',
    fontSize: 15,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  infoText: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
  overlaySection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#555',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#4caf50',
  },
  overlayTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  overlayDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
    marginBottom: 12,
  },
  overlayButton: {
    backgroundColor: '#4A9EFF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  overlayButtonStop: {
    backgroundColor: '#c0392b',
  },
  overlayButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
