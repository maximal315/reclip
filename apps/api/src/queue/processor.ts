import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { db } from '../lib/db.js';
import { dequeue } from './producer.js';
import { config } from '../lib/config.js';

const downloadedVideoIds = new Set<string>();

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['--js-runtimes', 'deno', '-f', 'best[ext=mp4]/best', '-o', outputPath, url];
    let process = spawn('yt-dlp', args);
    let binaryFailed = false;
    let stderr = '';

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    process.on('error', () => {
      binaryFailed = true;
      process = spawn('python3', ['-m', 'yt_dlp', ...args]);
      let fallbackStderr = '';

      process.stderr.on('data', (data: Buffer) => {
        fallbackStderr += data.toString();
      });

      process.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${fallbackStderr}`));
        }
      });

      process.on('error', (err: Error) => {
        reject(new Error(`Failed to run yt-dlp: ${err.message}`));
      });
    });

    if (!binaryFailed) {
      process.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          console.error(`yt-dlp error: ${stderr}`);
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });
    }
  });
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
  db.jobs.set(job.id, job);

  const outputs: string[] = [];
  for (let i = 0; i < job.videoIds.length; i += 1) {
    const videoId = job.videoIds[i];
    const video = db.videos.get(videoId);
    if (!video) {
      job.status = 'failed';
      job.error = `Missing video ${videoId}`;
      job.updatedAt = new Date().toISOString();
      db.jobs.set(job.id, job);
      return;
    }

    const outputPath = path.join('/tmp', `${job.id}_${i + 1}.mp4`);
    try {
      console.log(`[Processor] Downloading ${videoId} from ${video.sourceUrl} -> ${outputPath}`);
      await downloadVideo(video.sourceUrl, outputPath);
      downloadedVideoIds.add(videoId);
      outputs.push(outputPath);
      job.progress = Math.round(((i + 1) / job.videoIds.length) * 100);
      job.updatedAt = new Date().toISOString();
      db.jobs.set(job.id, job);
      console.log(`[Processor] ✓ Downloaded ${videoId}`);
    } catch (error) {
      console.error(`[Processor] ✗ Failed to download ${videoId}:`, error);
      job.status = 'failed';
      job.error = `Failed to download ${videoId}: ${error instanceof Error ? error.message : 'unknown'}`;
      job.updatedAt = new Date().toISOString();
      db.jobs.set(job.id, job);
      return;
    }
  }

  job.status = 'done';
  const base = (config.API_BASE_URL || '').replace(/\/$/, '');
  job.outputUrls = outputs.map((_, i) => `${base}/downloads/file/${job.id}/${i + 1}`);
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
