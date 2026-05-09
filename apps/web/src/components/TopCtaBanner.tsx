'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type CtaConfig = { title: string; subtitle: string; videoUrl: string };

export function TopCtaBanner({ onCtaChange }: { onCtaChange?: (videoUrl: string | null) => void }) {
  const [cta, setCta] = useState<CtaConfig | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<CtaConfig>('/cta/config')
      .then((data) => {
        setCta(data);
        setVideoUrlInput(data.videoUrl || '');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    onCtaChange?.(cta?.videoUrl ? cta.videoUrl : null);
  }, [cta, onCtaChange]);

  if (!cta) {
    return null;
  }

  const onClick = async () => {
    await api('/cta/click', { method: 'POST' });
  };

  const saveVideo = async () => {
    setError('');
    setStatus('');
    try {
      const data = await api<{ videoUrl: string }>('/cta/video', {
        method: 'POST',
        body: JSON.stringify({ videoUrl: videoUrlInput.trim() })
      });
      setCta((prev) =>
        prev
          ? {
              ...prev,
              videoUrl: data.videoUrl
            }
          : prev
      );
      setStatus('CTA video updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save CTA video');
    }
  };

  return (
    <div style={{ background: '#111827', color: '#fff', padding: 16, borderRadius: 8, marginBottom: 16 }}>
      <strong>{cta.title}</strong>
      <p style={{ margin: '8px 0 12px' }}>{cta.subtitle}</p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        <input
          value={videoUrlInput}
          onChange={(e) => setVideoUrlInput(e.target.value)}
          placeholder="Paste CTA video URL (mp4)"
        />
        <div>
          <button onClick={saveVideo}>Save CTA Video</button>
          {status ? <span style={{ marginLeft: 10 }}>{status}</span> : null}
        </div>
        {error ? <p style={{ color: '#fca5a5', margin: 0 }}>{error}</p> : null}
      </div>
      {cta.videoUrl ? (
        <video
          controls
          preload="metadata"
          style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: '#000' }}
          onPlay={onClick}
        >
          <source src={cta.videoUrl} type="video/mp4" />
          Your browser does not support the CTA video.
        </video>
      ) : (
        <p style={{ margin: 0, opacity: 0.9 }}>No CTA video set yet. Paste a video URL and save.</p>
      )}
    </div>
  );
}
