import { Router } from 'express';
import { z } from 'zod';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';
import { makeId } from '../lib/id.js';
import { enqueue } from '../queue/producer.js';

const schema = z.object({
  urls: z.array(z.string().url()).min(1),
  audioUrl: z.string().url().nullable().optional(),
  ctaUrl: z.string().url().optional()
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

stitchRouter.post('/', async (req, res) => {
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

    const downloadJobs = [];
    for (const url of urls) {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const requestedVideoId = getYouTubeVideoId(url);
        const normalizedRequestedUrl = normalizeYouTubeUrl(url);

        const video = Array.from(db.videos.values()).find((v) => {
          const storedVideoId = getYouTubeVideoId(v.sourceUrl);
          const storedNormalizedUrl = normalizeYouTubeUrl(v.sourceUrl);

          if (requestedVideoId && storedVideoId) {
            return storedVideoId === requestedVideoId;
          }

          return storedNormalizedUrl === normalizedRequestedUrl || v.sourceUrl === url;
        }) || (requestedVideoId ? db.videos.get(`yt_${requestedVideoId}`) : undefined);

        if (!video) {
          const allVideos = Array.from(db.videos.values()).map(v => ({ id: v.id, sourceUrl: v.sourceUrl }));
          console.log('Available videos in DB:', allVideos);
          console.log('Looking for URL:', url);
          console.log('Normalized request URL:', normalizedRequestedUrl);
          console.log('Requested YouTube ID:', requestedVideoId);
          return res.status(400).json({
            error: `Video not found in database: ${url}`,
            searchedUrl: url,
            normalizedRequestedUrl,
            requestedVideoId,
            availableVideos: allVideos.length
          });
        }

        // Create download job
        const job = {
          id: makeId(),
          type: 'single' as const,
          videoIds: [video.id],
          status: 'queued' as const,
          progress: 0,
          outputUrls: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.jobs.set(job.id, job);
        enqueue(job);
        downloadJobs.push({ job, sourceUrl: url });
      }
    }

    const maxWaitTime = 5 * 60 * 1000;
    const startTime = Date.now();

    while (downloadJobs.some(({ job }) => db.jobs.get(job.id)?.status !== 'done')) {
      if (Date.now() - startTime > maxWaitTime) {
        return res.status(408).json({ error: 'Download timeout' });
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const downloadableUrls: string[] = [];
    for (const { job } of downloadJobs) {
      const completedJob = db.jobs.get(job.id);
      if (completedJob?.status === 'done') {
        const baseUrl = config.API_BASE_URL.replace(/\/$/, '');
        const fileUrl = `${baseUrl}/downloads/file/${job.id}/0`;
        downloadableUrls.push(fileUrl);
      }
    }

    for (const url of urls) {
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        downloadableUrls.push(url);
      }
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.FFMPEG_API_KEY) {
      headers.authorization = `Bearer ${config.FFMPEG_API_KEY}`;
    }

    if (ctaUrl) {
      const stitchedBlobs: Buffer[] = [];

      for (const shortUrl of downloadableUrls) {
        const stitchResponse = await fetch(config.FFMPEG_API_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ urls: [shortUrl, ctaUrl], audioUrl })
        });

        if (!stitchResponse.ok) {
          const errText = await stitchResponse.text().catch(() => '');
          return res.status(stitchResponse.status).json({
            error: `Stitch failed: ${stitchResponse.status} ${errText}`
          });
        }

        stitchedBlobs.push(Buffer.from(await stitchResponse.arrayBuffer()));
      }

      const stitchedVideos = stitchedBlobs.map((buffer, index) => ({
        filename: `stitched-short-${index + 1}.mp4`,
        data: buffer.toString('base64'),
        contentType: 'video/mp4'
      }));

      return res.json({ videos: stitchedVideos });
    } else {
      const response = await fetch(config.FFMPEG_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ urls: downloadableUrls, audioUrl })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.status(response.status).json({ error: `Stitch failed: ${response.status} ${errText}` });
      }

      const stitchedBuffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('content-type', response.headers.get('content-type') || 'video/mp4');
      res.setHeader('content-disposition', 'attachment; filename="stitched.mp4"');
      return res.status(200).send(stitchedBuffer);
    }
  } catch (error) {
    console.error('Stitch API unavailable', error);
    return res.status(502).json({ error: 'Stitch API unavailable' });
  }
});
