import type { Video } from '@reclip/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type YtDlpEntry = {
  id?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  timestamp?: number;
  upload_date?: string;
  webpage_url?: string;
  url?: string;
};

function normalizeYouTubeInput(handleOrUrl: string): string {
  const value = handleOrUrl.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const parsed = new URL(value);
      const cleanedPath = parsed.pathname
        .replace(/\/(videos|shorts|streams|featured)\/?$/i, '')
        .replace(/\/+$/, '');
      return `${parsed.origin}${cleanedPath}`;
    } catch {
      return value.replace(/\/+$/, '');
    }
  }

  const cleanHandle = value.replace(/^@/, '').replace(/\/(videos|shorts|streams|featured)$/i, '').replace(/\/+$/, '');
  return `https://www.youtube.com/@${cleanHandle}`;
}

export function normalizeYouTubeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split(/[/?#]/)[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }

    if (!hostname.endsWith('youtube.com')) {
      return url;
    }

    if (parsed.pathname.startsWith('/watch')) {
      const vParam = parsed.searchParams.get('v') || '';
      if (vParam.startsWith('http://') || vParam.startsWith('https://')) {
        return normalizeYouTubeUrl(vParam);
      }
      if (vParam) {
        return `https://www.youtube.com/watch?v=${vParam}`;
      }
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }

    if (parsed.pathname.startsWith('/v/')) {
      const id = parsed.pathname.split('/v/')[1]?.split('/')[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }

    const fallbackId = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return fallbackId ? `https://www.youtube.com/watch?v=${fallbackId}` : url;
  } catch {
    return url;
  }
}

async function fetchPlaylistEntries(url: string): Promise<YtDlpEntry[]> {
  const args = ['--flat-playlist', '--dump-single-json', '--playlist-end', '50', url];
  let stdout = '';

  try {
    ({ stdout } = await execFileAsync('yt-dlp', args));
  } catch (error) {
    // Fallback for environments where yt-dlp binary is not in PATH.
    try {
      ({ stdout } = await execFileAsync('python3', ['-m', 'yt_dlp', ...args]));
    } catch {
      throw new Error('YouTube discovery needs yt-dlp installed in the API runtime.');
    }
  }

  const payload = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
  return payload.entries || [];
}

function makeMockVideos(channelId: string, handle: string, limit: number): Video[] {
  const now = Date.now();
  return Array.from({ length: Math.min(limit, 6) }).map((_, i) => ({
    id: `yt_${channelId}_${i + 1}`,
    channelId,
    platform: 'youtube',
    title: `YouTube Video ${i + 1} from ${handle}`,
    thumbnail: `https://i.ytimg.com/vi/dummy${i + 1}/hqdefault.jpg`,
    durationSeconds: 90 + i * 25,
    publishedAt: new Date(now - i * 86400000).toISOString(),
    sourceUrl: `https://www.youtube.com/watch?v=dummy${i + 1}`
  }));
}

export async function fetchYouTubeVideos(channelId: string, handle: string, limit: number): Promise<Video[]> {
  if (process.env.NODE_ENV === 'test') {
    return makeMockVideos(channelId, handle, limit);
  }

  const base = normalizeYouTubeInput(handle);
  const shortsUrl = `${base}/shorts`;

  try {
    const shortsEntries = await fetchPlaylistEntries(shortsUrl);
    const byId = new Map<string, Video>();

    for (const entry of shortsEntries) {
      if (!entry.id) {
        continue;
      }
      const sourceUrl = normalizeYouTubeUrl(
        entry.webpage_url || (entry.url ? `https://www.youtube.com/watch?v=${entry.url}` : `https://www.youtube.com/watch?v=${entry.id}`)
      );
      const publishedAt =
        typeof entry.timestamp === 'number'
          ? new Date(entry.timestamp * 1000).toISOString()
          : (entry.upload_date
              ? new Date(
                  `${entry.upload_date.slice(0, 4)}-${entry.upload_date.slice(4, 6)}-${entry.upload_date.slice(6, 8)}`
                ).toISOString()
              : new Date().toISOString());

      byId.set(entry.id, {
        id: `yt_${entry.id}`,
        channelId,
        platform: 'youtube',
        title: entry.title || `YouTube video ${entry.id}`,
        thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
        durationSeconds: entry.duration || 0,
        publishedAt,
        sourceUrl
      });
    }

    return Array.from(byId.values()).slice(0, Math.max(1, limit));
  } catch (error) {
    console.error('Failed to fetch YouTube videos/shorts via yt-dlp', error);
    throw error instanceof Error ? error : new Error('Failed to fetch YouTube videos.');
  }
}
