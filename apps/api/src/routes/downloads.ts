import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { DownloadJob, JobType } from '@reclip/shared';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { makeId } from '../lib/id.js';
import { config } from '../lib/config.js';
import { enqueue } from '../queue/producer.js';
import { requireTermsAccepted } from '../lib/limits.js';
import { hasVideoBeenDownloaded } from '../queue/processor.js';

const singleSchema = z.object({ videoId: z.string().min(1) });
const bulkSchema = z.object({ videoIds: z.array(z.string().min(1)).min(1) });

function newJob(type: JobType, videoIds: string[]): DownloadJob {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    type,
    videoIds,
    status: 'queued',
    progress: 0,
    outputUrls: [],
    createdAt: now,
    updatedAt: now
  };
}

export const downloadsRouter = Router();

downloadsRouter.post('/single', requireTermsAccepted, (req, res) => {
  const parsed = singleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!db.videos.has(parsed.data.videoId)) {
    return res.status(404).json({ error: 'Video not found' });
  }
  if (hasVideoBeenDownloaded(parsed.data.videoId)) {
    return res.status(409).json({ error: 'Video already downloaded' });
  }

  const job = newJob('single', [parsed.data.videoId]);
  db.jobs.set(job.id, job);
  enqueue(job);

  return res.status(202).json({ jobId: job.id });
});

downloadsRouter.post('/bulk', requireTermsAccepted, (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (parsed.data.videoIds.length > config.MAX_BULK_DOWNLOAD) {
    return res.status(400).json({ error: `Limit is ${config.MAX_BULK_DOWNLOAD} videos per bulk request` });
  }

  const missing = parsed.data.videoIds.filter((id) => !db.videos.has(id));
  if (missing.length > 0) {
    return res.status(404).json({ error: 'Some videos were not found', missing });
  }

  const deduped = Array.from(new Set(parsed.data.videoIds));
  const filtered = deduped.filter((videoId) => !hasVideoBeenDownloaded(videoId));
  if (filtered.length === 0) {
    return res.status(409).json({ error: 'All requested videos were already downloaded' });
  }
  const job = newJob('bulk', filtered);
  db.jobs.set(job.id, job);
  enqueue(job);

  return res.status(202).json({ jobId: job.id, queued: filtered.length });
});

downloadsRouter.get('/file/:jobId/:index', (req, res) => {
  const { jobId, index } = req.params;
  const filePath = path.join('/tmp', `${jobId}_${index}.mp4`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(filePath);
});

downloadsRouter.get('/:jobId', requireTermsAccepted, (req, res) => {
  const job = db.jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json({ job });
});
