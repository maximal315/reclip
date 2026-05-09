import type { DownloadJob, Video } from '@reclip/shared';
import { processDownloadJob } from './jobs/download.js';

// This file is intentionally minimal; in production it should consume a real queue.
export async function runWorker(job: DownloadJob, videos: Video[]): Promise<DownloadJob> {
  return processDownloadJob(job, videos);
}

if (process.env.NODE_ENV !== 'test') {
  console.log('RECLIP worker started (queue adapter not connected in scaffold).');
}
