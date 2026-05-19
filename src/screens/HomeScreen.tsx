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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { fetchYouTubeSubtitles, SubtitleCue } from '../utils/youtube';
import { translateSubtitles } from '../utils/deepl';
import { loadDeepLApiKey, saveRecentUrl, loadRecentUrls } from '../utils/storage';
import type { RootStackParamList } from '../../App';

type HomeNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

type LoadingStage = 'idle' | 'fetching' | 'translating' | 'done';

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();
  const [url, setUrl] = useState('');
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  const isLoading = loadingStage !== 'idle' && loadingStage !== 'done';

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

    const apiKey = await loadDeepLApiKey();
    if (!apiKey) {
      Alert.alert(
        'API Key Required',
        'Please add your DeepL API key in Settings before translating.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
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
      const translated = await translateSubtitles(texts, apiKey, 'ZH', (done, total) => {
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

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Paste a YouTube video URL above. The app will fetch the English subtitles and
            translate them to Chinese using DeepL.
          </Text>
          <Text style={styles.infoText}>
            You need a free DeepL API key. Get one at deepl.com/pro#developer
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
});
