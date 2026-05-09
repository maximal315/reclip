import { spawn } from 'node:child_process';
import type { DownloadJob, Video } from '@reclip/shared';

function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-y', '-i', input, '-c', 'copy', output]);
    ffmpeg.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    ffmpeg.on('error', reject);
  });
}

export async function processDownloadJob(job: DownloadJob, videos: Video[]): Promise<DownloadJob> {
  const next = { ...job, status: 'processing' as const, updatedAt: new Date().toISOString() };
  const outputs: string[] = [];

  for (let i = 0; i < videos.length; i += 1) {
    const video = videos[i];
    const out = `/tmp/${job.id}_${i + 1}.mp4`;

    try {
      await runFfmpeg(video.sourceUrl, out);
      outputs.push(out);
      next.progress = Math.round(((i + 1) / videos.length) * 100);
    } catch {
      next.status = 'failed';
      next.error = `Failed to process ${video.id}`;
      next.updatedAt = new Date().toISOString();
      return next;
    }
  }

  next.status = 'done';
  next.outputUrls = outputs.map((_, i) => `${config.API_BASE_URL}/downloads/file/${job.id}/${i + 1}`);
  next.updatedAt = new Date().toISOString();
  return next;
}
