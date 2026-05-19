export interface SubtitleCue {
  text: string;
  start: number;
  duration: number;
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

interface CaptionTrack {
  baseUrl: string;
  name: { simpleText: string };
  vssId: string;
  languageCode: string;
  kind?: string;
}

// Strategy 1: ANDROID_TESTSUITE client — exempt from PO token requirement
async function fetchPlayerResponseViaAndroidTestsuite(
  videoId: string
): Promise<Record<string, unknown> | null> {
  const body = {
    context: {
      client: {
        clientName: 'ANDROID_TESTSUITE',
        clientVersion: '1.9',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/1.9 (Linux; U; Android 11)',
        'X-YouTube-Client-Name': '30',
        'X-YouTube-Client-Version': '1.9',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return null;
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const playability = data.playabilityStatus as Record<string, unknown> | undefined;
    if (playability?.status === 'LOGIN_REQUIRED' || playability?.status === 'ERROR') return null;
    return data;
  } catch {
    return null;
  }
}

// Strategy 2: TVHTML5_SIMPLY_EMBEDDED_PLAYER client — exempt from PO token requirement
async function fetchPlayerResponseViaTVHTML5(
  videoId: string
): Promise<Record<string, unknown> | null> {
  const body = {
    context: {
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'en',
        gl: 'US',
      },
      thirdParty: { embedUrl: 'https://www.youtube.com' },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
        'X-YouTube-Client-Name': '85',
        'X-YouTube-Client-Version': '2.0',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return null;
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const playability = data.playabilityStatus as Record<string, unknown> | undefined;
    if (playability?.status === 'LOGIN_REQUIRED' || playability?.status === 'ERROR') return null;
    return data;
  } catch {
    return null;
  }
}

// Strategy 3: Innertube API with ANDROID_VR client
async function fetchPlayerResponseViaInnertube(
  videoId: string
): Promise<Record<string, unknown> | null> {
  const body = {
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 2',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12',
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0,
        userAgent:
          'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip',
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const response = await fetch(
    'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.60.19',
        'X-Goog-Api-Format-Version': '2',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) return null;
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const playability = data.playabilityStatus as Record<string, unknown> | undefined;
    if (playability?.status === 'LOGIN_REQUIRED' || playability?.status === 'ERROR') return null;
    return data;
  } catch {
    return null;
  }
}

// Strategy 4: Innertube API with ANDROID_EMBEDDED_PLAYER client
async function fetchPlayerResponseViaAndroid(
  videoId: string
): Promise<Record<string, unknown> | null> {
  const body = {
    context: {
      client: {
        clientName: 'ANDROID_EMBEDDED_PLAYER',
        clientVersion: '17.31.35',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
      },
      thirdParty: { embedUrl: 'https://www.youtube.com' },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3987.132 Mobile Safari/537.36',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) return null;
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const playability = data.playabilityStatus as Record<string, unknown> | undefined;
    if (playability?.status === 'LOGIN_REQUIRED' || playability?.status === 'ERROR') return null;
    return data;
  } catch {
    return null;
  }
}

// Strategy 3: Scrape HTML page — also captures cookies for caption fetching
async function fetchPlayerResponseViaHtml(
  videoId: string
): Promise<{ data: Record<string, unknown>; cookies: string } | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) return null;
  const cookies = response.headers.get('set-cookie') ?? '';
  const html = await response.text();

  const patterns = [
    /var ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        const playability = data.playabilityStatus as Record<string, unknown> | undefined;
        if (playability?.status === 'LOGIN_REQUIRED') return null;
        return { data, cookies };
      } catch {
        // try next
      }
    }
  }
  return null;
}

// Strategy 4: Direct timedtext API (no player response needed)
async function fetchViaTimedtextApi(videoId: string): Promise<SubtitleCue[] | null> {
  // Try manual captions first, then ASR (auto-generated)
  const variants: Array<{ lang: string; kind?: string }> = [
    { lang: 'en' },
    { lang: 'en', kind: 'asr' },
    { lang: 'en-orig' },
    { lang: 'en-orig', kind: 'asr' },
  ];
  for (const { lang, kind } of variants) {
    try {
      const kindParam = kind ? `&kind=${kind}` : '';
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}${kindParam}&fmt=json3`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          Referer: `https://www.youtube.com/watch?v=${videoId}`,
        },
      });
      if (!response.ok) continue;
      const rawText = await response.text();
      let json: { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> };
      try {
        json = JSON.parse(rawText);
      } catch {
        const xmlCues = parseXmlCaptions(rawText);
        if (xmlCues.length > 0) return xmlCues;
        continue;
      }
      if (!json.events?.length) continue;
      const cues = parseJson3Events(json.events);
      if (cues.length > 0) return cues;
    } catch {
      // continue to next variant
    }
  }
  return null;
}

function extractCaptionTracks(playerResponse: Record<string, unknown>): CaptionTrack[] {
  try {
    const captions = playerResponse.captions as Record<string, unknown> | undefined;
    if (!captions) return [];
    const renderer = captions.playerCaptionsTracklistRenderer as
      | Record<string, unknown>
      | undefined;
    if (!renderer) return [];
    const tracks = renderer.captionTracks as CaptionTrack[] | undefined;
    return Array.isArray(tracks) ? tracks : [];
  } catch {
    return [];
  }
}

function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const manualEn = tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr');
  if (manualEn) return manualEn;
  const autoEn = tracks.find((t) => t.languageCode?.startsWith('en'));
  if (autoEn) return autoEn;
  return tracks[0];
}

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
};

function parseJson3Events(events: Json3Event[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const event of events) {
    if (!event.segs) continue;
    const text = event.segs
      .map((s) => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .trim();
    if (text && event.tStartMs !== undefined) {
      cues.push({
        text,
        start: (event.tStartMs ?? 0) / 1000,
        duration: (event.dDurationMs ?? 2000) / 1000,
      });
    }
  }
  return cues;
}

function parseXmlCaptions(xml: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const regex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const raw = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/<[^>]+>/g, '')
      .trim();
    if (raw) {
      cues.push({ text: raw, start: parseFloat(match[1]), duration: parseFloat(match[2]) });
    }
  }
  return cues;
}

async function fetchCaptionTrack(
  track: CaptionTrack,
  videoId?: string,
  cookies?: string
): Promise<SubtitleCue[]> {
  const resolvedBase = track.baseUrl.startsWith('/')
    ? 'https://www.youtube.com' + track.baseUrl
    : track.baseUrl;
  const jsonUrl = resolvedBase + '&fmt=json3';

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  };
  if (videoId) headers['Referer'] = `https://www.youtube.com/watch?v=${videoId}`;
  if (cookies) headers['Cookie'] = cookies;

  const response = await fetch(jsonUrl, { headers });

  if (response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      try {
        const json = (await response.json()) as { events?: Json3Event[] };
        const cues = parseJson3Events(json.events ?? []);
        if (cues.length > 0) return cues;
      } catch {
        // fall through to XML
      }
    }
    const text = await response.text();
    const xmlCues = parseXmlCaptions(text);
    if (xmlCues.length > 0) return xmlCues;
  }

  // Retry without fmt param
  const xmlResponse = await fetch(resolvedBase, { headers });
  if (!xmlResponse.ok) throw new Error(`Failed to fetch captions: ${xmlResponse.status}`);
  return parseXmlCaptions(await xmlResponse.text());
}

export async function fetchYouTubeSubtitles(url: string): Promise<SubtitleCue[]> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('无效的 YouTube 链接，请输入正确的视频地址。');
  }

  const strategies = [
    fetchPlayerResponseViaAndroidTestsuite,
    fetchPlayerResponseViaTVHTML5,
    fetchPlayerResponseViaInnertube,
    fetchPlayerResponseViaAndroid,
  ];

  for (const strategy of strategies) {
    const playerResponse = await strategy(videoId).catch(() => null);
    if (!playerResponse) continue;

    const tracks = extractCaptionTracks(playerResponse);
    if (tracks.length === 0) continue;

    const track = selectBestTrack(tracks);
    if (!track) continue;

    const cues = await fetchCaptionTrack(track, videoId).catch(() => null);
    if (cues && cues.length > 0) return cues;
  }

  // HTML scrape strategy — passes session cookies to caption fetch
  const htmlResult = await fetchPlayerResponseViaHtml(videoId).catch(() => null);
  if (htmlResult) {
    const tracks = extractCaptionTracks(htmlResult.data);
    const track = selectBestTrack(tracks);
    if (track) {
      const cues = await fetchCaptionTrack(track, videoId, htmlResult.cookies || undefined).catch(() => null);
      if (cues && cues.length > 0) return cues;
    }
  }

  const timedtextCues = await fetchViaTimedtextApi(videoId);
  if (timedtextCues && timedtextCues.length > 0) return timedtextCues;

  throw new Error(
    '无法获取该视频的字幕。请确认：\n1. 视频有英文字幕（手动或自动生成）\n2. 视频不是私密视频\n3. 网络连接正常'
  );
}
