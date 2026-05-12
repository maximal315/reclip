import { Router } from 'express';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../lib/config.js';
import { db } from '../lib/db.js';
import { makeId } from '../lib/id.js';

const schema = z.object({
  urls: z.array(z.string().url()).min(1),
  audioUrl: z.string().url().nullable().optional(),
  ctaUrl: z.string().url().optional()
});

function downloadViaYtDlp(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'best[ext=mp4]',
      '-o', outputPath,
      '--socket-timeout', '30',
      '--retries', '3',
      '--fragment-retries', '3',
      '--http-headers', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      url
    ];
    
    // Try yt-dlp binary first
    let process = spawn('yt-dlp', args);
    let binaryFailed = false;
    let stderr = '';
    let stdout = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.on('error', () => {
      binaryFailed = true;
      // Fallback to python3 -m yt_dlp
      process = spawn('python3', ['-m', 'yt_dlp', ...args]);
      let fallbackStderr = '';
      let fallbackStdout = '';

      process.stderr.on('data', (data) => {
        fallbackStderr += data.toString();
      });

      process.stdout.on('data', (data) => {
        fallbackStdout += data.toString();
      });
      
      process.on('exit', (code: any) => {
        if (code === 0) {
          resolve();
        } else {
          console.error(`yt-dlp (python fallback) error: ${fallbackStderr}`);
          reject(new Error(`yt-dlp exited with code ${code}: ${fallbackStderr}`));
        }
      });
      
      process.on('error', (err: any) => {
        reject(new Error(`Failed to run yt-dlp: ${err.message}`));
      });
    });

    if (!binaryFailed) {
      process.on('exit', (code: any) => {
        if (code === 0) {
          resolve();
        } else {
          console.error(`yt-dlp error: ${stderr}`);
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });
    }
  });
}

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
    const { urls, ctaUrl, audioUrl } = parsed.data;
    const batchId = makeId();
    const downloadedFiles: string[] = [];
    let fileIndex = 0;

    // Download each YouTube URL directly
    for (const url of urls) {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        try {
          fileIndex += 1;
          const outputPath = path.join('/tmp', `${batchId}_${fileIndex}.mp4`);
          console.log(`Downloading: ${url} -> ${outputPath}`);
          await downloadViaYtDlp(url, outputPath);
          const fileUrl = `${config.API_BASE_URL}/downloads/file/${batchId}/${fileIndex}`;
          downloadedFiles.push(fileUrl);
          console.log(`✓ Downloaded ${url} -> ${fileUrl}`);
        } catch (error) {
          console.error(`✗ Failed to download ${url}:`, error);
          return res.status(400).json({
            error: `Failed to download video: ${url}`,
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      } else {
        // Non-YouTube URL, use directly
        downloadedFiles.push(url);
      }
    }

    if (downloadedFiles.length === 0) {
      return res.status(400).json({ error: 'No valid videos to stitch' });
    }

    // Download CTA video if it's a YouTube URL
    let ctaUrlToUse = ctaUrl;
    if (ctaUrl && (ctaUrl.includes('youtube.com') || ctaUrl.includes('youtu.be'))) {
      try {
        const ctaOutputPath = path.join('/tmp', `${batchId}_cta.mp4`);
        console.log(`Downloading CTA: ${ctaUrl} -> ${ctaOutputPath}`);
        await downloadViaYtDlp(ctaUrl, ctaOutputPath);
        ctaUrlToUse = `${config.API_BASE_URL}/downloads/file/${batchId}/cta`;
        console.log(`✓ Downloaded CTA -> ${ctaUrlToUse}`);
      } catch (error) {
        console.error(`✗ Failed to download CTA ${ctaUrl}:`, error);
        return res.status(400).json({
          error: `Failed to download CTA video: ${ctaUrl}`,
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.FFMPEG_API_KEY) {
      headers.authorization = `Bearer ${config.FFMPEG_API_KEY}`;
    }

    if (ctaUrlToUse) {
      const stitchedBlobs: Buffer[] = [];

      for (const shortUrl of downloadedFiles) {
        try {
          console.log(`Stitching: ${shortUrl} + ${ctaUrlToUse}`);
          const stitchResponse = await fetch(config.FFMPEG_API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ urls: [shortUrl, ctaUrlToUse], audioUrl })
          });

          if (!stitchResponse.ok) {
            const errText = await stitchResponse.text().catch(() => '');
            return res.status(stitchResponse.status).json({
              error: `Stitch failed: ${stitchResponse.status} ${errText}`
            });
          }

          stitchedBlobs.push(Buffer.from(await stitchResponse.arrayBuffer()));
          console.log(`✓ Stitched`);
        } catch (error) {
          console.error(`✗ Stitch failed:`, error);
          return res.status(502).json({ error: 'Stitch API error' });
        }
      }

      const stitchedVideos = stitchedBlobs.map((buffer, index) => ({
        filename: `stitched-short-${index + 1}.mp4`,
        data: buffer.toString('base64'),
        contentType: 'video/mp4'
      }));

      return res.json({ videos: stitchedVideos });
    } else {
      try {
        console.log(`Stitching ${downloadedFiles.length} videos together`);
        const response = await fetch(config.FFMPEG_API_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ urls: downloadedFiles, audioUrl })
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
        console.error('Stitch API error', error);
        return res.status(502).json({ error: 'Stitch API unavailable' });
      }
    }
  } catch (error) {
    console.error('Stitch endpoint error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
