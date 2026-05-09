import { Router } from 'express';
import { z } from 'zod';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';

export const ctaRouter = Router();
const updateVideoSchema = z.object({ videoUrl: z.string().url() });

ctaRouter.get('/config', (_req, res) => {
  return res.json({
    title: config.CTA_TITLE,
    subtitle: config.CTA_SUBTITLE,
    videoUrl: db.ctaVideoUrl || config.CTA_VIDEO_URL || ''
  });
});

ctaRouter.post('/video', (req, res) => {
  const parsed = updateVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  db.ctaVideoUrl = parsed.data.videoUrl;
  return res.status(200).json({ ok: true, videoUrl: db.ctaVideoUrl });
});

ctaRouter.post('/click', (_req, res) => {
  db.ctaClicks += 1;
  return res.status(204).send();
});

ctaRouter.get('/metrics', (_req, res) => {
  return res.json({ clicks: db.ctaClicks, stitchSubmissions: db.stitchSubmissions });
});
