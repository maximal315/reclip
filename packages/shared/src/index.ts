export type Platform = 'youtube' | 'tiktok';

export type ChannelStatus = 'active' | 'paused' | 'error';

export interface Channel {
  id: string;
  platform: Platform;
  handle: string;
  status: ChannelStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Video {
  id: string;
  channelId: string;
  platform: Platform;
  title: string;
  thumbnail: string;
  durationSeconds: number;
  publishedAt: string;
  sourceUrl: string;
}

export type JobType = 'single' | 'bulk';
export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface DownloadJob {
  id: string;
  type: JobType;
  videoIds: string[];
  status: JobStatus;
  progress: number;
  outputUrls: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StitchSubmission {
  videoUrls: string[];
  title?: string;
}
