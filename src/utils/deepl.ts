const DEEPL_FREE_API_URL = 'https://api-free.deepl.com/v2/translate';
const BATCH_SIZE = 50; // DeepL allows up to 50 texts per request

interface DeepLResponse {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

async function translateBatch(
  texts: string[],
  apiKey: string,
  targetLang: string
): Promise<string[]> {
  const response = await fetch(DEEPL_FREE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: texts,
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    if (response.status === 403) {
      throw new Error(
        'Invalid DeepL API key. Please check your API key in Settings.'
      );
    }
    if (response.status === 456) {
      throw new Error(
        'DeepL API quota exceeded. Please check your DeepL account usage.'
      );
    }
    if (response.status === 429) {
      throw new Error('Too many requests to DeepL. Please wait a moment and try again.');
    }
    throw new Error(
      `DeepL API error (${response.status}): ${errorText || 'Unknown error'}`
    );
  }

  const data = (await response.json()) as DeepLResponse;
  return data.translations.map((t) => t.text);
}

export async function translateText(
  text: string,
  apiKey: string,
  targetLang: string = 'ZH'
): Promise<string> {
  const results = await translateBatch([text], apiKey, targetLang);
  return results[0] ?? text;
}

export async function translateSubtitles(
  texts: string[],
  apiKey: string,
  targetLang: string = 'ZH',
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  if (!apiKey.trim()) {
    throw new Error(
      'DeepL API key is required. Please add your API key in Settings.'
    );
  }

  const results: string[] = new Array(texts.length);
  let completed = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const translations = await translateBatch(batch, apiKey, targetLang);

    for (let j = 0; j < translations.length; j++) {
      results[i + j] = translations[j];
    }

    completed += batch.length;
    onProgress?.(Math.min(completed, texts.length), texts.length);
  }

  return results;
}
