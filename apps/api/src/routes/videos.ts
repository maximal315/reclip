import { Router } from 'express';
import { db } from '../lib/db.js';

export const videosRouter = Router();

videosRouter.get('/', (req, res) => {
  const channelId = req.query.channelId as string | undefined;
  const platform = req.query.platform as string | undefined;

  let videos = Array.from(db.videos.values());
  if (channelId) {
    videos = videos.filter((v) => v.channelId === channelId);
  }
  if (platform) {
    videos = videos.filter((v) => v.platform === platform);
  }

  return res.json({ videos });
});
