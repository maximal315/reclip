'use client';

import { FormEvent, useState } from 'react';
import { api, Platform } from '../lib/api';

export function ChannelForm({ onAdded }: { onAdded: () => void }) {
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      await api('/channels', {
        method: 'POST',
        body: JSON.stringify({ platform, handle })
      });
      setHandle('');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add channel');
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
      <label>
        Platform
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
        </select>
      </label>
      <label>
        Channel Handle or URL
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@creator or channel URL" required />
      </label>
      <button type="submit">Add Channel</button>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </form>
  );
}
