'use client';

import { useState } from 'react';
import { api } from '../lib/api';

export function DownloadAllButton({ videoIds }: { videoIds: string[] }) {
  const [state, setState] = useState('');

  const downloadAll = async () => {
    setState('Queueing bulk job...');
    const { jobId } = await api<{ jobId: string }>('/downloads/bulk', {
      method: 'POST',
      body: JSON.stringify({ videoIds })
    });

    setState(`Job queued: ${jobId}`);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={downloadAll} disabled={!videoIds.length}>
        Download All ({videoIds.length})
      </button>
      {state ? <span style={{ marginLeft: 10 }}>{state}</span> : null}
    </div>
  );
}
