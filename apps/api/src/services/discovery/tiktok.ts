import type { Video } from '@reclip/shared';

export async function fetchTikTokVideos(channelId: string, handle: string, limit: number): Promise<Video[]> {
  const now = Date.now();
  return Array.from({ length: Math.min(limit, 6) }).map((_, i) => ({
    id: `tt_${channelId}_${i + 1}`,
    channelId,
    platform: 'tiktok',
    title: `TikTok Clip ${i + 1} from ${handle}`,
    thumbnail: `https://p16-sign.tiktokcdn.com/obj/tos-maliva-p-0068/dummy${i + 1}.jpg`,
    durationSeconds: 30 + i * 10,
    publishedAt: new Date(now - i * 43200000).toISOString(),
    sourceUrl: `https://www.tiktok.com/@${handle.replace('@', '')}/video/${1000 + i}`
  }));
}
