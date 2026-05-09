import { Router } from 'express';
import type { Channel, Platform } from '@reclip/shared';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { makeId } from '../lib/id.js';
import { discoverVideos } from '../services/discovery/index.js';

const createSchema = z.object({
  platform: z.enum(['youtube', 'tiktok']),
  handle: z.string().min(2)
});

export const channelsRouter = Router();

channelsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const now = new Date().toISOString();
  const channel: Channel = {
    id: makeId(),
    platform: parsed.data.platform as Platform,
    handle: parsed.data.handle,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };

  db.channels.set(channel.id, channel);
  const videos = await discoverVideos(channel);
  videos.forEach((v) => db.videos.set(v.id, v));

  return res.status(201).json({ channel, videosCount: videos.length });
});

channelsRouter.get('/', (_req, res) => {
  return res.json({ channels: Array.from(db.channels.values()) });
});

channelsRouter.delete('/:id', (req, res) => {
  const existing = db.channels.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  db.channels.delete(existing.id);
  for (const [videoId, video] of db.videos.entries()) {
    if (video.channelId === existing.id) {
      db.videos.delete(videoId);
    }
  }

  return res.status(204).send();
});

channelsRouter.post('/:id/refresh', async (req, res) => {
  const channel = db.channels.get(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const freshVideos = await discoverVideos(channel);
  freshVideos.forEach((video) => db.videos.set(video.id, video));
  channel.updatedAt = new Date().toISOString();
  db.channels.set(channel.id, channel);

  return res.json({ refreshed: freshVideos.length, videos: freshVideos });
});
