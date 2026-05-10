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
    // Step 1: Create download jobs for all YouTube URLs
    const downloadJobs = [];
    for (const url of parsed.data.urls) {
      // Check if this is a YouTube URL that needs downloading
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        // Find the video ID in our database
        const video = Array.from(db.videos.values()).find(v => v.sourceUrl === url);
        if (!video) {
          // Debug: show what videos are in the database
          const allVideos = Array.from(db.videos.values()).map(v => ({ id: v.id, sourceUrl: v.sourceUrl }));
          console.log('Available videos in DB:', allVideos);
          console.log('Looking for URL:', url);
          return res.status(400).json({
            error: `Video not found in database: ${url}`,
            availableVideos: allVideos.length,
            searchedUrl: url
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
        downloadJobs.push(job);
      }
    }

    // Step 2: Wait for all downloads to complete (with timeout)
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    while (downloadJobs.some(job => db.jobs.get(job.id)?.status !== 'done')) {
      if (Date.now() - startTime > maxWaitTime) {
        return res.status(408).json({ error: 'Download timeout - videos taking too long to download' });
      }
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    // Step 3: Generate downloadable URLs and handle CTA stitching
    const downloadableUrls = [];
    const ctaDownloadableUrl = parsed.data.ctaUrl;

    // If CTA is provided, we need to stitch each short individually with CTA
    if (parsed.data.ctaUrl) {
      // For each downloaded job, create individual stitch requests
      const stitchedBlobs = [];
      
      for (const job of downloadJobs) {
        const completedJob = db.jobs.get(job.id);
        if (completedJob?.status === 'done') {
          // Generate URL for the downloaded short
          const shortUrl = `${config.API_BASE_URL}/downloads/file/${job.id}/${0}`;
          
          // Call stitch API for this short + CTA
          const stitchPayload = {
            urls: [shortUrl, parsed.data.ctaUrl],
            audioUrl: parsed.data.audioUrl
          };

          const stitchResponse = await fetch(config.FFMPEG_API_URL, {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify(stitchPayload)
          });

          if (!stitchResponse.ok) {
            const errText = await stitchResponse.text().catch(() => '');
            return res.status(stitchResponse.status).json({ error: `Stitch failed for video ${job.id}: ${stitchResponse.status} ${errText}` });
          }

          const stitchedBuffer = Buffer.from(await stitchResponse.arrayBuffer());
          stitchedBlobs.push(stitchedBuffer);
        }
      }

      // Return multiple stitched videos as a JSON response with base64 encoded videos
      const stitchedVideos = stitchedBlobs.map((buffer, index) => ({
        filename: `stitched-short-${index + 1}.mp4`,
        data: buffer.toString('base64'),
        contentType: 'video/mp4'
      }));

      return res.json({ videos: stitchedVideos });
    } else {
      // No CTA - just return downloadable URLs for regular stitching
      for (const job of downloadJobs) {
        const completedJob = db.jobs.get(job.id);
        if (completedJob?.status === 'done') {
          for (let i = 0; i < completedJob.videoIds.length; i++) {
            const fileUrl = `${config.API_BASE_URL}/downloads/file/${job.id}/${i}`;
            downloadableUrls.push(fileUrl);
          }
        }
      }

      // Add any non-YouTube URLs directly
      for (const url of parsed.data.urls) {
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
          downloadableUrls.push(url);
        }
      }

      // Step 4: Send downloadable URLs to stitch API
      const headers: Record<string, string> = {
        'content-type': 'application/json'
      };
      if (config.FFMPEG_API_KEY) {
        headers.authorization = `Bearer ${config.FFMPEG_API_KEY}`;
      }

      const stitchPayload = {
        urls: downloadableUrls,
        audioUrl: parsed.data.audioUrl
      };

      const response = await fetch(config.FFMPEG_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(stitchPayload)
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
