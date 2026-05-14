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

function normalizeOrigin(value: string): string | null {
  let origin = value.trim();
  const duplicatedScheme = origin.match(/^(https?:\/\/)(https?:\/\/.+)$/i);
  if (duplicatedScheme) {
    origin = duplicatedScheme[2];
  }

  try {
    return new URL(origin).origin;
  } catch {
    try {
      return new URL(`https://${origin}`).origin;
    } catch {
      return null;
    }
  }
}

const webOrigins = config.WEB_ORIGIN.split(',')
  .map(normalizeOrigin)
  .filter((origin): origin is string => Boolean(origin));

app.use(cors({ origin: 'https://moonlit-donut-e906dc.netlify.app', credentials: true }));
app.use(express.json());
app.use(simpleRateLimit(120));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'reclip-api' });
});

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
