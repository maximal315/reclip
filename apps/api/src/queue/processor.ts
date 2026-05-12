import { db } from '../lib/db.js';
import { dequeue } from './producer.js';
import { config } from '../lib/config.js';

const downloadedVideoIds = new Set<string>();

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function processNext() {
  const queued = dequeue();
  if (!queued) {
    return;
  }

  const job = db.jobs.get(queued.id);
  if (!job) {
    return;
  }

  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  const outputs: string[] = [];
  for (let i = 0; i < job.videoIds.length; i += 1) {
    const videoId = job.videoIds[i];
    if (!db.videos.has(videoId)) {
      job.status = 'failed';
      job.error = `Missing video ${videoId}`;
      job.updatedAt = new Date().toISOString();
      db.jobs.set(job.id, job);
      return;
    }

    await sleep(60);
    downloadedVideoIds.add(videoId);
    const base = (config.API_BASE_URL || '').replace(/\/$/, '');
    outputs.push(`${base}/downloads/file/${job.id}/${i + 1}`);
    job.progress = Math.round(((i + 1) / job.videoIds.length) * 100);
  }

  job.status = 'done';
  job.outputUrls = outputs;
  job.updatedAt = new Date().toISOString();
  db.jobs.set(job.id, job);
}

export function startQueueProcessor(): NodeJS.Timeout {
  return setInterval(() => {
    processNext().catch((error) => {
      console.error('Queue processor error', error);
    });
  }, 250);
}

export function hasVideoBeenDownloaded(videoId: string): boolean {
  return downloadedVideoIds.has(videoId);
}
