import type { Channel, DownloadJob, Video } from '@reclip/shared';

export const db = {
  channels: new Map<string, Channel>(),
  videos: new Map<string, Video>(),
  jobs: new Map<string, DownloadJob>(),
  ctaClicks: 0,
  stitchSubmissions: 0,
  ctaVideoUrl: '' as string
};
