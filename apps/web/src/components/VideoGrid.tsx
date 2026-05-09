'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Video = {
  id: string;
  title: string;
  thumbnail: string;
  sourceUrl: string;
  platform: 'youtube' | 'tiktok';
};

type Props = {
  refreshToken: number;
  selectedVideoIds: string[];
  onSelectionChange: (videos: string[]) => void;
  onVideosLoaded: (videos: Video[]) => void;
};

export function VideoGrid({ refreshToken, selectedVideoIds, onSelectionChange, onVideosLoaded }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const data = await api<{ videos: Video[] }>('/videos');
      setVideos(data.videos);
      onVideosLoaded(data.videos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading videos');
    }
  }

  useEffect(() => {
    load();
  }, [refreshToken]);

  const onDownloadOne = async (videoId: string) => {
    await api('/downloads/single', {
      method: 'POST',
      body: JSON.stringify({ videoId })
    });
  };

  const onToggleSelect = (videoId: string) => {
    if (selectedVideoIds.includes(videoId)) {
      onSelectionChange(selectedVideoIds.filter((id) => id !== videoId));
      return;
    }

    onSelectionChange([...selectedVideoIds, videoId]);
  };

  if (error) {
    return <p style={{ color: '#b91c1c' }}>{error}</p>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
      {videos.map((video) => (
        <article key={video.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
          <label style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={selectedVideoIds.includes(video.id)}
              onChange={() => onToggleSelect(video.id)}
            />
            Select for stitch
          </label>
          <img src={video.thumbnail} alt={video.title} style={{ width: '100%', borderRadius: 6 }} />
          <h4>{video.title}</h4>
          <small>{video.platform.toUpperCase()}</small>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={() => onDownloadOne(video.id)}>Download</button>
            <a href={video.sourceUrl} target="_blank" rel="noreferrer">Open</a>
          </div>
        </article>
      ))}
    </div>
  );
}
