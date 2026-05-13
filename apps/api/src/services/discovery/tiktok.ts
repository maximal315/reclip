import type { Video } from '@reclip/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface YtDlpEntry {
  id?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  timestamp?: number;
  upload_date?: string;
  webpage_url?: string;
  url?: string;
}

function normalizeTikTokUrl(handleOrUrl: string): string {
  const value = handleOrUrl.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  
  const cleanHandle = value.replace(/^@/, '');
  return `https://www.tiktok.com/@${cleanHandle}`;
}

async function fetchTikTokEntries(url: string): Promise<YtDlpEntry[]> {
  const args = ['--flat-playlist', '--dump-single-json', '--playlist-end', '50', url];
  let stdout = '';

  try {
    ({ stdout } = await execFileAsync('yt-dlp', args));
  } catch (error) {
    // Fallback for environments where yt-dlp binary is not in PATH.
    try {
      ({ stdout } = await execFileAsync('python3', ['-m', 'yt_dlp', ...args]));
    } catch {
      throw new Error('TikTok discovery needs yt-dlp installed in the API runtime.');
    }
  }

  const payload = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
  return payload.entries || [];
}

export async function fetchTikTokVideos(channelId: string, handle: string, limit: number): Promise<Video[]> {
  const base = normalizeTikTokUrl(handle);
  
  try {
    const entries = await fetchTikTokEntries(base);
    const byId = new Map<string, Video>();
    
    for (const entry of entries) {
      if (!entry.id) {
        continue;
      }
      
      const sourceUrl = entry.webpage_url || (entry.url ? `https://www.tiktok.com/@${handle.replace('@', '')}/video/${entry.url}` : `https://www.tiktok.com/@${handle.replace('@', '')}/video/${entry.id}`);
      const publishedAt = 
        typeof entry.timestamp === 'number'
          ? new Date(entry.timestamp * 1000).toISOString()
          : (entry.upload_date
              ? new Date(`${entry.upload_date.slice(0, 4)}-${entry.upload_date.slice(4, 6)}-${entry.upload_date.slice(6, 8)}`).toISOString()
              : new Date().toISOString());
      
      byId.set(entry.id, {
        id: `tt_${entry.id}`,
        channelId,
        platform: 'tiktok',
        title: entry.title || `TikTok video ${entry.id}`,
        thumbnail: entry.thumbnail || `https://p16-sign.tiktokcdn.com/obj/tos-maliva-p-0068/tos-useast2a-ve-0068/88a2b7b8f39c4365b5f2f3b3b6d7c6b6`,
        durationSeconds: entry.duration || 0,
        publishedAt,
        sourceUrl
      });
    }
    
    return Array.from(byId.values()).slice(0, Math.max(1, limit));
  } catch (error) {
    console.error('Failed to fetch TikTok videos via yt-dlp', error);
    throw error instanceof Error ? error : new Error('Failed to fetch TikTok videos.');
  }
}
