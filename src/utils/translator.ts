import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

export interface TranslatorConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface NativeOverlay {
  translateAll(
    config: { baseUrl: string; apiKey: string; model: string; targetLang: string },
    texts: string[]
  ): Promise<string[]>;
}

function getNativeModule(): NativeOverlay {
  const mod = NativeModules.OverlayModule as NativeOverlay | undefined;
  if (!mod || typeof mod.translateAll !== 'function') {
    throw new Error('翻译服务只在 Android 设备上可用。');
  }
  return mod;
}

export async function translateText(
  text: string,
  config: TranslatorConfig,
  targetLang: string = '中文'
): Promise<string> {
  const out = await translateSubtitles([text], config, targetLang);
  return out[0] ?? text;
}

export async function translateSubtitles(
  texts: string[],
  config: TranslatorConfig,
  targetLang: string = '中文',
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  if (!config.apiKey.trim()) throw new Error('请先在设置中填写 API Key。');
  if (!config.baseUrl.trim()) throw new Error('请先在设置中填写 Base URL。');
  if (!config.model.trim()) throw new Error('请先在设置中填写 Model。');
  if (texts.length === 0) return [];

  const mod = getNativeModule();
  let sub: EmitterSubscription | null = null;
  if (onProgress) {
    const emitter = new NativeEventEmitter(NativeModules.OverlayModule);
    sub = emitter.addListener(
      'OnTranslateProgress',
      (event: { completed: number; total: number }) => {
        onProgress(event.completed, event.total);
      }
    );
  }
  try {
    return await mod.translateAll(
      { ...config, targetLang },
      texts
    );
  } finally {
    sub?.remove();
  }
}
