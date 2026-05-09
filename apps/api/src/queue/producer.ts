import type { DownloadJob } from '@reclip/shared';

const queue: DownloadJob[] = [];

export function enqueue(job: DownloadJob): void {
  queue.push(job);
}

export function dequeue(): DownloadJob | undefined {
  return queue.shift();
}

export function queuedCount(): number {
  return queue.length;
}
