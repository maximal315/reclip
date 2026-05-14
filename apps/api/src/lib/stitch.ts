import { z } from 'zod';

export const stitchJobSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  audioUrl: z.string().url().nullable().optional(),
  ctaUrl: z.string().url().optional(),
  cookies: z.string().optional()
});

export type StitchJobInput = z.infer<typeof stitchJobSchema>;

export interface StitchJob {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}