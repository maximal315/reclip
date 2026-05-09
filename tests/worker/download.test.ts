import { describe, expect, test } from 'vitest';
import { processDownloadJob } from '../../apps/worker/src/jobs/download.js';

describe('worker job', () => {
  test('fails gracefully when ffmpeg input is invalid', async () => {
    const result = await processDownloadJob(
      {
        id: 'j1',
        type: 'single',
        videoIds: ['v1'],
        status: 'queued',
        progress: 0,
        outputUrls: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      [
        {
          id: 'v1',
          channelId: 'c1',
          platform: 'youtube',
          title: 'Demo',
          thumbnail: 'https://example.com/thumb.jpg',
          durationSeconds: 10,
          publishedAt: new Date().toISOString(),
          sourceUrl: 'https://invalid.example.com/video.mp4'
        }
      ]
    );

    expect(result.status).toBe('failed');
  });
});
