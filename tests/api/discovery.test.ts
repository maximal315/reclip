import { describe, expect, test } from 'vitest';
import { fetchYouTubeVideos, normalizeYouTubeUrl } from '../../apps/api/src/services/discovery/youtube.js';
import { fetchTikTokVideos } from '../../apps/api/src/services/discovery/tiktok.js';

describe('discovery adapters', () => {
  test('normalizes youtube videos', async () => {
    const videos = await fetchYouTubeVideos('channel-1', '@creator', 3);
    expect(videos).toHaveLength(3);
    expect(videos[0].platform).toBe('youtube');
    expect(videos[0].sourceUrl).toContain('youtube.com');
  });

  test('normalizes malformed watch URL values from yt-dlp', () => {
    const sourceUrl = normalizeYouTubeUrl('https://www.youtube.com/watch?v=https://www.youtube.com/shorts/WROMyJAJmp4');
    expect(sourceUrl).toBe('https://www.youtube.com/watch?v=WROMyJAJmp4');
  });

  test('normalizes tiktok videos', async () => {
    const videos = await fetchTikTokVideos('channel-2', '@creator', 2);
    expect(videos).toHaveLength(2);
    expect(videos[0].platform).toBe('tiktok');
    expect(videos[0].sourceUrl).toContain('tiktok.com');
  });
});
