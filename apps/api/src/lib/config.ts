import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      throw new Error(`Invalid URL: ${value}`);
    }
  }
}

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  API_BASE_URL: z.preprocess((val) => normalizeUrl(val), z.string().url()).default('http://localhost:4000'),
  CTA_TITLE: z.string().default('Create with RECLIP'),
  CTA_SUBTITLE: z.string().default('Turn clips into stitched stories.'),
  CTA_VIDEO_URL: z.string().url().optional(),
  FFMPEG_API_URL: z.preprocess((val) => normalizeUrl(val), z.string().url()).optional(),
  FFMPEG_API_KEY: z.string().optional(),
  MAX_VIDEOS_PER_REFRESH: z.coerce.number().default(50),
  MAX_BULK_DOWNLOAD: z.coerce.number().default(25)
});

export const config = schema.parse(process.env);
