'use client';

import { useState } from 'react';
import { api, apiBlob } from '../lib/api';

export function StitchSelectedButton({ selectedUrls, ctaUrl }: { selectedUrls: string[]; ctaUrl?: string | null }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const stitchUrls = ctaUrl ? [...selectedUrls, ctaUrl] : selectedUrls;

  const stitch = async () => {
    setError('');
    setStatus('Stitching selected shorts to CTA...');
    try {
      if (ctaUrl) {
        // When CTA is provided, expect multiple videos back
        const data = await api<{ videos: Array<{ filename: string; data: string; contentType: string }> }>('/stitch', {
          method: 'POST',
          body: JSON.stringify({
            urls: selectedUrls,
            ctaUrl: ctaUrl,
            audioUrl: audioUrl.trim() ? audioUrl.trim() : null
          })
        });
        
        // Download each stitched video
        data.videos.forEach((video: any, index: number) => {
          const byteCharacters = atob(video.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: video.contentType });
          
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = video.filename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.URL.revokeObjectURL(url);
        });
        
        setStatus(`Downloaded ${data.videos.length} stitched videos.`);
      } else {
        // No CTA - download single stitched video
        const blob = await apiBlob('/stitch', {
          method: 'POST',
          body: JSON.stringify({
            urls: selectedUrls,
            audioUrl: audioUrl.trim() ? audioUrl.trim() : null
          })
        });

        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `stitched-${Date.now()}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        setStatus('Stitched video downloaded.');
      }
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : 'Failed to stitch videos');
    }
  };

  return (
    <div style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
      <label>
        Optional audio URL
        <input
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          placeholder="https://example.com/narration.mp3"
        />
      </label>
      <div>
        <button onClick={stitch} disabled={selectedUrls.length === 0 || !ctaUrl}>
          Stitch Selected Shorts + CTA ({selectedUrls.length})
        </button>
        {status ? <span style={{ marginLeft: 10 }}>{status}</span> : null}
      </div>
      {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
    </div>
  );
}
