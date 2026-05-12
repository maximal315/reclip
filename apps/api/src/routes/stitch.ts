import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Video } from '@reclip/shared';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';
import { makeId } from '../lib/id.js';
import { enqueue } from '../queue/producer.js';

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

    if (hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split(/[/?#]/)[0] || null;
    }

    if (!hostname.endsWith('youtube.com')) {
      return null;
    }

    const v = parsed.searchParams.get('v');
    if (v) {
      if (v.startsWith('http://') || v.startsWith('https://')) {
        return getYouTubeVideoId(v);
      }
      return v;
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }

    if (parsed.pathname.startsWith('/v/')) {
      return parsed.pathname.split('/v/')[1]?.split('/')[0] || null;
    }

    return parsed.pathname.split('/').filter(Boolean).pop() || null;
  } catch {
    return null;
  }
}

function normalizeYouTubeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split(/[/?#]/)[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }

    if (!hostname.endsWith('youtube.com')) {
      return url;
    }

    const v = parsed.searchParams.get('v');
    if (v) {
      if (v.startsWith('http://') || v.startsWith('https://')) {
        return normalizeYouTubeUrl(v);
      }
      return `https://www.youtube.com/watch?v=${v}`;
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }

    if (parsed.pathname.startsWith('/v/')) {
      const id = parsed.pathname.split('/v/')[1]?.split('/')[0] || '';
      return id ? `https://www.youtube.com/watch?v=${id}` : url;
    }

    const fallbackId = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return fallbackId ? `https://www.youtube.com/watch?v=${fallbackId}` : url;
  } catch {
    return url;
  }
}

export const stitchRouter = Router();

stitchRouter.post('/', async (req: Request, res: Response) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  db.stitchSubmissions += 1;

  if (!config.FFMPEG_API_URL) {
    return res.status(503).json({ error: 'Stitch API is not configured yet' });
  }

  try {
    const { urls, ctaUrl, audioUrl } = parsed.data;

    // Map selected URLs to video IDs in the DB (or create temporary video entries)
    const selectedVideoIds: string[] = [];
    for (const url of urls) {
      // try exact match first
      let video = Array.from(db.videos.values()).find((v) => v.sourceUrl === url);

      // try YouTube id / normalized match
      if (!video) {
        const requestedVideoId = getYouTubeVideoId(url);
        const normalizedRequestedUrl = normalizeYouTubeUrl(url);
        if (requestedVideoId) {
          video = db.videos.get(`yt_${requestedVideoId}`) || Array.from(db.videos.values()).find((v) => getYouTubeVideoId(v.sourceUrl) === requestedVideoId);
        }
        if (!video) {
          video = Array.from(db.videos.values()).find((v) => normalizeYouTubeUrl(v.sourceUrl) === normalizedRequestedUrl);
        }
      }

      // If not found, create a temporary video record so the worker can download it
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
          sourceUrl: url
        };
        db.videos.set(newVideo.id, newVideo);
        video = newVideo;
      }

      if (video) {
        selectedVideoIds.push(video.id);
      }
    }

    if (selectedVideoIds.length === 0) {
      return res.status(400).json({ error: 'No valid videos to stitch' });
    }

    // Create a bulk download job for selected videos
    const jobsCreated: Array<{ id: string; type: string }> = [];
    const bulkJob = {
      id: makeId(),
      type: 'bulk' as const,
      videoIds: Array.from(new Set(selectedVideoIds)),
      status: 'queued' as const,
      progress: 0,
      outputUrls: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.jobs.set(bulkJob.id, bulkJob);
    enqueue(bulkJob);
    jobsCreated.push({ id: bulkJob.id, type: 'bulk' });

    // CTA: create/download via Reclip if provided
    let ctaJobId: string | null = null;
    if (ctaUrl) {
      // find or create video for CTA
      let ctaVideo = Array.from(db.videos.values()).find((v) => v.sourceUrl === ctaUrl);
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
          sourceUrl: ctaUrl
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
          updatedAt: new Date().toISOString()
        };
        db.jobs.set(cjob.id, cjob);
        enqueue(cjob);
        jobsCreated.push({ id: cjob.id, type: 'cta' });
        ctaJobId = cjob.id;
      }
    }

    // Wait for jobs to finish
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    while (jobsCreated.some((j) => db.jobs.get(j.id)?.status !== 'done')) {
      if (Date.now() - startTime > maxWaitTime) {
        return res.status(408).json({ error: 'Download timeout' });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Collect downloadable URLs from completed jobs
    const downloadableUrls: string[] = [];
    for (const j of jobsCreated) {
      const completed = db.jobs.get(j.id);
      if (completed?.status === 'done' && completed.outputUrls.length > 0) {
        downloadableUrls.push(...completed.outputUrls);
      } else if (completed?.status === 'failed') {
        return res.status(500).json({ error: `Download job failed: ${completed.error || 'unknown'}` });
      } else {
        return res.status(500).json({ error: 'Downloaded video was not available for stitching' });
      }
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.FFMPEG_API_KEY) {
      headers.authorization = `Bearer ${config.FFMPEG_API_KEY}`;
    }

    // Find outputs for bulk and CTA jobs
    const bulkEntry = jobsCreated.find((j) => j.type === 'bulk');
    const bulkOutputs = bulkEntry ? db.jobs.get(bulkEntry.id)?.outputUrls || [] : [];
    const ctaEntry = jobsCreated.find((j) => j.type === 'cta');
    const ctaOutput = ctaEntry ? db.jobs.get(ctaEntry.id)?.outputUrls?.[0] || null : null;

    if (ctaOutput) {
      const stitchedBlobs: Buffer[] = [];
      for (const shortUrl of bulkOutputs) {
        console.log(`Stitching: ${shortUrl} + ${ctaOutput}`);
        const stitchResponse = await fetch(config.FFMPEG_API_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ urls: [shortUrl, ctaOutput], audioUrl })
        });

        if (!stitchResponse.ok) {
          const errText = await stitchResponse.text().catch(() => '');
          return res.status(stitchResponse.status).json({ error: `Stitch failed: ${stitchResponse.status} ${errText}` });
        }

        const buf = Buffer.from(await stitchResponse.arrayBuffer());
        stitchedBlobs.push(buf);
        console.log('✓ Stitched');
      }

      const stitchedVideos = stitchedBlobs.map((buffer, index) => ({
        filename: `stitched-short-${index + 1}.mp4`,
        data: buffer.toString('base64'),
        contentType: 'video/mp4'
      }));

      return res.json({ videos: stitchedVideos });
    }

    console.log(`Stitching ${bulkOutputs.length} videos together`);
    const response = await fetch(config.FFMPEG_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ urls: bulkOutputs, audioUrl })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Stitch failed: ${response.status} ${errText}` });
    }

    const stitchedBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'video/mp4';
    res.setHeader('content-type', contentType);
    res.setHeader('content-disposition', 'attachment; filename="stitched.mp4"');
    return res.status(200).send(stitchedBuffer);
  } catch (error) {
    console.error('Stitch endpoint error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
