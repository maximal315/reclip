import { spawn } from 'node:child_process';
import type { DownloadJob, Video } from '@reclip/shared';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

function downloadSource(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['--js-runtimes', 'deno', '-f', 'best[ext=mp4]/best', '-o', output, input];
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
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });
    }
  });
}

export async function processDownloadJob(job: DownloadJob, videos: Video[]): Promise<DownloadJob> {
  const next: DownloadJob = { ...job, status: 'processing', updatedAt: new Date().toISOString() };
  const outputs: string[] = [];

  for (let i = 0; i < videos.length; i += 1) {
    const video = videos[i];
    const out = `/tmp/${job.id}_${i + 1}.mp4`;

    try {
      await downloadSource(video.sourceUrl, out);
      outputs.push(out);
      next.progress = Math.round(((i + 1) / videos.length) * 100);
    } catch (error) {
      next.status = 'failed';
      next.error = `Failed to process ${video.id}: ${error instanceof Error ? error.message : 'unknown'}`;
      next.updatedAt = new Date().toISOString();
      return next;
    }
  }

  next.status = 'done';
  next.outputUrls = outputs.map((_, i) => `${API_BASE_URL}/downloads/file/${job.id}/${i + 1}`);
  next.updatedAt = new Date().toISOString();
  return next;
}
