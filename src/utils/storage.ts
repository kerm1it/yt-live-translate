import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DEEPL_API_KEY: '@yt_translate/deepl_api_key',
  RECENT_URLS: '@yt_translate/recent_urls',
} as const;

const MAX_RECENT_URLS = 10;

// DeepL API Key

export async function saveDeepLApiKey(apiKey: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEEPL_API_KEY, apiKey);
}

export async function loadDeepLApiKey(): Promise<string> {
  const key = await AsyncStorage.getItem(KEYS.DEEPL_API_KEY);
  return key ?? '';
}

// Recent URLs

export async function loadRecentUrls(): Promise<string[]> {
  const json = await AsyncStorage.getItem(KEYS.RECENT_URLS);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    return [];
  }
}

export async function saveRecentUrl(url: string): Promise<void> {
  const existing = await loadRecentUrls();
  const filtered = existing.filter((u) => u !== url);
  const updated = [url, ...filtered].slice(0, MAX_RECENT_URLS);
  await AsyncStorage.setItem(KEYS.RECENT_URLS, JSON.stringify(updated));
}

// Clear all data

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.DEEPL_API_KEY, KEYS.RECENT_URLS]);
}
