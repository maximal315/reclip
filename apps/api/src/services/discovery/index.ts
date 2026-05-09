import type { Channel, Video } from '@reclip/shared';
import { config } from '../../lib/config.js';
import { fetchTikTokVideos } from './tiktok.js';
import { fetchYouTubeVideos } from './youtube.js';

export async function discoverVideos(channel: Channel): Promise<Video[]> {
  if (channel.platform === 'youtube') {
    return fetchYouTubeVideos(channel.id, channel.handle, config.MAX_VIDEOS_PER_REFRESH);
  }

  return fetchTikTokVideos(channel.id, channel.handle, config.MAX_VIDEOS_PER_REFRESH);
}
