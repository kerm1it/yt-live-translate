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

// Strategy 1: Innertube API with ANDROID_VR client (used by yt-dlp)
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
  };

  const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
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

// Strategy 2: Innertube API with ANDROID_EMBEDDED_PLAYER client
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

// Strategy 3: Scrape HTML page
async function fetchPlayerResponseViaHtml(
  videoId: string
): Promise<Record<string, unknown> | null> {
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
        return data;
      } catch {
        // try next
      }
    }
  }
  return null;
}

// Strategy 4: Direct timedtext API (no player response needed)
async function fetchViaTimedtextApi(videoId: string): Promise<SubtitleCue[] | null> {
  const langs = ['en', 'en-orig'];
  for (const lang of langs) {
    try {
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        },
      });
      if (!response.ok) continue;
      const json = (await response.json()) as {
        events?: Array<{
          tStartMs?: number;
          dDurationMs?: number;
          segs?: Array<{ utf8?: string }>;
        }>;
      };
      if (!json.events?.length) continue;
      const cues = parseJson3Events(json.events);
      if (cues.length > 0) return cues;
    } catch {
      // try next lang
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

async function fetchCaptionTrack(track: CaptionTrack): Promise<SubtitleCue[]> {
  const jsonUrl = track.baseUrl + '&fmt=json3';
  const response = await fetch(jsonUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
  });

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
  const xmlResponse = await fetch(track.baseUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
  });
  if (!xmlResponse.ok) throw new Error(`Failed to fetch captions: ${xmlResponse.status}`);
  return parseXmlCaptions(await xmlResponse.text());
}

export async function fetchYouTubeSubtitles(url: string): Promise<SubtitleCue[]> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('无效的 YouTube 链接，请输入正确的视频地址。');
  }

  // Try all strategies in order
  const strategies = [
    fetchPlayerResponseViaInnertube,
    fetchPlayerResponseViaAndroid,
    fetchPlayerResponseViaHtml,
  ];

  for (const strategy of strategies) {
    const playerResponse = await strategy(videoId).catch(() => null);
    if (!playerResponse) continue;

    const tracks = extractCaptionTracks(playerResponse);
    if (tracks.length === 0) continue;

    const track = selectBestTrack(tracks);
    if (!track) continue;

    const cues = await fetchCaptionTrack(track).catch(() => null);
    if (cues && cues.length > 0) return cues;
  }

  // Last resort: timedtext API
  const timedtextCues = await fetchViaTimedtextApi(videoId);
  if (timedtextCues && timedtextCues.length > 0) return timedtextCues;

  throw new Error(
    '无法获取该视频的字幕。请确认：\n1. 视频有英文字幕（手动或自动生成）\n2. 视频不是私密视频\n3. 网络连接正常'
  );
}
