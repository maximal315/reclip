import { Router } from 'express';
import { z } from 'zod';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';

const schema = z.object({
  urls: z.array(z.string().url()).min(1),
  audioUrl: z.string().url().nullable().optional()
});

export const stitchRouter = Router();

stitchRouter.post('/submit', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  db.stitchSubmissions += 1;

  if (!config.FFMPEG_API_URL) {
    return res.status(503).json({ error: 'Stitch API is not configured yet' });
  }

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (config.FFMPEG_API_KEY) {
      headers.authorization = `Bearer ${config.FFMPEG_API_KEY}`;
    }

    const response = await fetch(config.FFMPEG_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(parsed.data)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Stitch failed: ${response.status} ${errText}` });
    }

    const stitchedBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('content-type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('content-disposition', 'attachment; filename="stitched.mp4"');
    return res.status(200).send(stitchedBuffer);
  } catch (error) {
    console.error('Stitch API unavailable', error);
    return res.status(502).json({ error: 'Stitch API unavailable' });
  }
});
