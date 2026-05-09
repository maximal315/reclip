import { describe, expect, test } from 'vitest';
import { enqueue, dequeue, queuedCount } from '../../apps/api/src/queue/producer.js';

describe('queue producer', () => {
  test('enqueues and dequeues jobs', () => {
    const job = {
      id: 'job-1',
      type: 'single',
      videoIds: ['v1'],
      status: 'queued',
      progress: 0,
      outputUrls: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    enqueue(job);
    expect(queuedCount()).toBeGreaterThan(0);
    const pulled = dequeue();
    expect(pulled?.id).toBe('job-1');
  });
});
