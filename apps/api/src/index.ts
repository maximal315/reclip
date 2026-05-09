import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { channelsRouter } from './routes/channels.js';
import { videosRouter } from './routes/videos.js';
import { downloadsRouter } from './routes/downloads.js';
import { ctaRouter } from './routes/cta.js';
import { stitchRouter } from './routes/stitch.js';
import { simpleRateLimit } from './lib/limits.js';
import { startQueueProcessor } from './queue/processor.js';

const app = express();
app.use(cors({ origin: config.WEB_ORIGIN }));
app.use(express.json());
app.use(simpleRateLimit(120));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/channels', channelsRouter);
app.use('/videos', videosRouter);
app.use('/downloads', downloadsRouter);
app.use('/cta', ctaRouter);
app.use('/stitch', stitchRouter);

startQueueProcessor();

app.listen(config.PORT, () => {
  console.log(`API listening on ${config.PORT}`);
});
