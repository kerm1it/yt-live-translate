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

async function fetchYouTubePage(videoId: string): Promise<string> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube page: ${response.status}`);
  }
  return response.text();
}

function extractPlayerResponse(html: string): Record<string, unknown> | null {
  // Try multiple patterns for ytInitialPlayerResponse
  const patterns = [
    /var ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s,
    /ytInitialPlayerResponse":\s*(\{.+?\})(?:,"|\},")/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        return JSON.parse(match[1]) as Record<string, unknown>;
      } catch {
        // try next pattern
      }
    }
  }
  return null;
}

function extractCaptionTracks(playerResponse: Record<string, unknown>): CaptionTrack[] {
  try {
    const captions = playerResponse.captions as Record<string, unknown> | undefined;
    if (!captions) return [];
    const renderer = captions.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
    if (!renderer) return [];
    const tracks = renderer.captionTracks as CaptionTrack[] | undefined;
    return Array.isArray(tracks) ? tracks : [];
  } catch {
    return [];
  }
}

function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;

  // Prefer manual English captions
  const manualEn = tracks.find(
    (t) => t.languageCode === 'en' && t.kind !== 'asr'
  );
  if (manualEn) return manualEn;

  // Fallback to auto-generated English captions
  const autoEn = tracks.find((t) => t.languageCode === 'en');
  if (autoEn) return autoEn;

  // Fallback to any English-like
  const anyEn = tracks.find((t) => t.languageCode?.startsWith('en'));
  if (anyEn) return anyEn;

  // Last resort: first track
  return tracks[0];
}

function parseXmlCaptions(xml: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const regex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    // Decode HTML entities
    const raw = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#\d+;/g, (m) => {
        const code = parseInt(m.slice(2, -1), 10);
        return String.fromCharCode(code);
      })
      .replace(/<[^>]+>/g, '') // strip any inner tags
      .trim();

    if (raw) {
      cues.push({ text: raw, start, duration });
    }
  }

  return cues;
}

async function fetchCaptionXml(track: CaptionTrack): Promise<SubtitleCue[]> {
  // Request JSON format if available, otherwise XML
  const url = track.baseUrl + '&fmt=json3';
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    // Try without json format
    const xmlResponse = await fetch(track.baseUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!xmlResponse.ok) {
      throw new Error(`Failed to fetch captions: ${xmlResponse.status}`);
    }
    const xml = await xmlResponse.text();
    return parseXmlCaptions(xml);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    try {
      interface JsonCaption {
        events?: Array<{
          tStartMs?: number;
          dDurationMs?: number;
          segs?: Array<{ utf8?: string }>;
        }>;
      }
      const json = (await response.json()) as JsonCaption;
      const cues: SubtitleCue[] = [];
      for (const event of json.events ?? []) {
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
    } catch {
      const xml = await response.text();
      return parseXmlCaptions(xml);
    }
  }

  const xml = await response.text();
  return parseXmlCaptions(xml);
}

export async function fetchYouTubeSubtitles(url: string): Promise<SubtitleCue[]> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL. Please enter a valid YouTube video URL.');
  }

  const html = await fetchYouTubePage(videoId);
  const playerResponse = extractPlayerResponse(html);

  if (!playerResponse) {
    throw new Error(
      'Could not extract video data from YouTube. The video may be private or unavailable.'
    );
  }

  const tracks = extractCaptionTracks(playerResponse);

  if (tracks.length === 0) {
    throw new Error(
      'No captions available for this video. Please try a video with English captions enabled.'
    );
  }

  const selectedTrack = selectBestTrack(tracks);
  if (!selectedTrack) {
    throw new Error('Could not find a suitable caption track.');
  }

  const cues = await fetchCaptionXml(selectedTrack);

  if (cues.length === 0) {
    throw new Error('Captions were found but could not be parsed. Please try another video.');
  }

  return cues;
}
