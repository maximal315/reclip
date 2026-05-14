// Replaced external FFMPEG API with local fluent-ffmpeg stitching
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Video } from '@reclip/shared';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';
import { makeId } from '../lib/id.js';
import { enqueue } from '../queue/producer.js';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import fetch from 'node-fetch';

const schema = z.object({
  urls: z.array(z.string().url()).min(1),
  audioUrl: z.string().url().nullable().optional(),
  ctaUrl: z.string().url().optional(),
  cookies: z.string().optional()
});

function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'youtu.be') return parsed.pathname.slice(1).split(/[/?#]/)[0] || null;
    if (!hostname.endsWith('youtube.com')) return null;
    const v = parsed.searchParams.get('v');
    if (v) return v.startsWith('http') ? getYouTubeVideoId(v) : v;
    if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    if (parsed.pathname.startsWith('/v/')) return parsed.pathname.split('/v/')[1]?.split('/')[0] || null;
    return parsed.pathname.split('/').filter(Boolean).pop() || null;
  } catch { return null; }
}

function normalizeYouTubeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split(/[/?#]/)[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }
    if (!hostname.endsWith('youtube.com')) return url;
    const v = parsed.searchParams.get('v');
    if (v) return v.startsWith('http') ? normalizeYouTubeUrl(v) : `https://www.youtube.com/watch?v=${v}`;
    if (parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }
    if (parsed.pathname.startsWith('/v/')) {
      const id = parsed.pathname.split('/v/')[1]?.split('/')[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }
    const fallback = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return fallback ? `https://www.youtube.com/watch?v=${fallback}` : url;
  } catch { return url; }
}

export const stitchRouter = Router();

stitchRouter.post('/', async (req: Request, res: Response) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  db.stitchSubmissions += 1;

  const { urls, ctaUrl, audioUrl } = parsed.data;

  const selectedVideoIds: string[] = [];
  for (const url of urls) {
    let video = Array.from(db.videos.values()).find(v => v.sourceUrl === url);
    if (!video) {
      const requestedVideoId = getYouTubeVideoId(url);
      const normalizedRequestedUrl = normalizeYouTubeUrl(url);
      if (requestedVideoId) {
        video = db.videos.get(`yt_${requestedVideoId}`) ||
                Array.from(db.videos.values()).find(v => getYouTubeVideoId(v.sourceUrl) === requestedVideoId);
      }
      if (!video) {
        video = Array.from(db.videos.values()).find(v => normalizeYouTubeUrl(v.sourceUrl) === normalizedRequestedUrl);
      }
    }
    if (!video) {
      const requestedVideoId = getYouTubeVideoId(url);
      const vid = requestedVideoId ? `yt_${requestedVideoId}` : makeId();
      const platform: 'youtube' | 'tiktok' = url.includes('tiktok') ? 'tiktok' : 'youtube';
      const newVideo: Video = {
        id: vid,
        channelId: '',
        platform,
        title: `Imported ${vid}`,
        thumbnail: '',
        durationSeconds: 0,
        publishedAt: new Date().toISOString(),
        sourceUrl: url,
      };
      db.videos.set(newVideo.id, newVideo);
      video = newVideo;
    }
    if (video) selectedVideoIds.push(video.id);
  }

  if (selectedVideoIds.length === 0) {
    return res.status(400).json({ error: 'No valid videos to stitch' });
  }

  const jobsCreated: Array<{ id: string; type: string }> = [];
  const bulkJob = {
    id: makeId(),
    type: 'bulk' as const,
    videoIds: Array.from(new Set(selectedVideoIds)),
    status: 'queued' as const,
    progress: 0,
    outputUrls: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.jobs.set(bulkJob.id, bulkJob);
  enqueue(bulkJob);
  jobsCreated.push({ id: bulkJob.id, type: 'bulk' });

  let ctaJobId: string | null = null;
  if (ctaUrl) {
    let ctaVideo = Array.from(db.videos.values()).find(v => v.sourceUrl === ctaUrl);
    if (!ctaVideo) {
      const requestedCtaId = getYouTubeVideoId(ctaUrl);
      const vid = requestedCtaId ? `yt_${requestedCtaId}` : makeId();
      const platform: 'youtube' | 'tiktok' = ctaUrl.includes('tiktok') ? 'tiktok' : 'youtube';
      const newVideo: Video = {
        id: vid,
        channelId: '',
        platform,
        title: `CTA ${vid}`,
        thumbnail: '',
        durationSeconds: 0,
        publishedAt: new Date().toISOString(),
        sourceUrl: ctaUrl,
      };
      db.videos.set(newVideo.id, newVideo);
      ctaVideo = newVideo;
    }
    if (ctaVideo) {
      const cjob = {
        id: makeId(),
        type: 'single' as const,
        videoIds: [ctaVideo.id],
        status: 'queued' as const,
        progress: 0,
        outputUrls: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.jobs.set(cjob.id, cjob);
      enqueue(cjob);
      jobsCreated.push({ id: cjob.id, type: 'cta' });
      ctaJobId = cjob.id;
    }
  }

  const maxWait = 5 * 60 * 1000;
  const start = Date.now();
  while (jobsCreated.some(j => db.jobs.get(j.id)?.status !== 'done')) {
    if (Date.now() - start > maxWait) {
      return res.status(408).json({ error: 'Download timeout' });
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // Collect local file paths from download URLs
  const inputFiles: string[] = [];
  for (const j of jobsCreated) {
    const job = db.jobs.get(j.id);
    if (!job?.outputUrls?.length) {
      return res.status(500).json({ error: 'Missing output URLs' });
    }
    for (const url of job.outputUrls) {
      const m = url.match(/\/downloads\/file\/([^/]+)\/(\d+)/);
      if (m) {
        const [, jobId, idx] = m;
        inputFiles.push(`${tmpdir()}/${jobId}_${idx}.mp4`);
      }
    }
  }

  // Download optional audio track
  let audioLocal: string | undefined;
  if (audioUrl) {
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) throw new Error('Failed to download audio');
    audioLocal = `${tmpdir()}/${randomUUID()}.mp3`;
    writeFileSync(audioLocal, Buffer.from(await audioResp.arrayBuffer()));
  }

  // Stitch locally with ffmpeg
  const outputFile = `${tmpdir()}/${randomUUID()}.mp4`;
  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg();
    inputFiles.forEach(f => cmd = cmd.input(f));
    if (audioLocal) cmd = cmd.input(audioLocal);
    cmd.output(outputFile).on('end', () => resolve()).on('error', reject).run();
  });

  // Cleanup temp files
  inputFiles.forEach(f => { if (existsSync(f)) unlinkSync(f); });
  if (audioLocal && existsSync(audioLocal)) unlinkSync(audioLocal);
  const stitchedBuffer = readFileSync(outputFile);
  unlinkSync(outputFile);

  res.setHeader('content-type', 'video/mp4');
  res.setHeader('content-disposition', 'attachment; filename="stitched.mp4"');
  return res.status(200).send(stitchedBuffer);
});