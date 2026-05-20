import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  TRANSLATOR_CONFIG: '@yt_translate/translator_config',
  RECENT_URLS: '@yt_translate/recent_urls',
} as const;

const MAX_RECENT_URLS = 10;

export interface TranslatorConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  targetLang: string;
}

export const DEFAULT_TRANSLATOR_CONFIG: TranslatorConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-v4-flash',
  targetLang: '中文',
};

export async function saveTranslatorConfig(config: TranslatorConfig): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRANSLATOR_CONFIG, JSON.stringify(config));
}

export async function loadTranslatorConfig(): Promise<TranslatorConfig> {
  const json = await AsyncStorage.getItem(KEYS.TRANSLATOR_CONFIG);
  if (!json) return { ...DEFAULT_TRANSLATOR_CONFIG };
  try {
    const parsed = JSON.parse(json) as Partial<TranslatorConfig>;
    return { ...DEFAULT_TRANSLATOR_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_TRANSLATOR_CONFIG };
  }
}

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

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.TRANSLATOR_CONFIG, KEYS.RECENT_URLS]);
}
