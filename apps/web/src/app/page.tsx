'use client';

import { useMemo, useState } from 'react';
import { TopCtaBanner } from '../components/TopCtaBanner';
import { ChannelForm } from '../components/ChannelForm';
import { DownloadAllButton } from '../components/DownloadAllButton';
import { VideoGrid } from '../components/VideoGrid';
import { StitchSelectedButton } from '../components/StitchSelectedButton';

type Video = {
  id: string;
  title: string;
  thumbnail: string;
  sourceUrl: string;
  platform: 'youtube' | 'tiktok';
};

export default function Page() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [ctaVideoUrl, setCtaVideoUrl] = useState<string | null>(null);

  const triggerRefresh = () => setRefreshToken((v) => v + 1);
  const ids = useMemo(() => videos.map((video) => video.id), [videos]);
  const selectedUrls = useMemo(
    () => videos.filter((video) => selectedVideoIds.includes(video.id)).map((video) => video.sourceUrl),
    [videos, selectedVideoIds]
  );
  const stitchUrls = useMemo(
    () => (ctaVideoUrl ? [...selectedUrls, ctaVideoUrl] : selectedUrls),
    [selectedUrls, ctaVideoUrl]
  );

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <TopCtaBanner onCtaChange={setCtaVideoUrl} />
      <h1>RECLIP Downloader</h1>
      <p>Add channels, preview videos, and bulk download clips.</p>
      <ChannelForm onAdded={triggerRefresh} />
      <DownloadAllButton videoIds={ids} />
      {ctaVideoUrl ? (
        selectedUrls.length > 0 ? (
          <StitchSelectedButton selectedUrls={stitchUrls} ctaUrl={ctaVideoUrl} />
        ) : (
          <p style={{ marginBottom: 16, opacity: 0.85 }}>
            Select the shorts you want to stitch together, and the CTA video button will appear.
          </p>
        )
      ) : (
        <p style={{ marginBottom: 16, opacity: 0.85 }}>
          Add a CTA video first, then select shorts to stitch them together.
        </p>
      )}
      <VideoGrid
        refreshToken={refreshToken}
        selectedVideoIds={selectedVideoIds}
        onSelectionChange={setSelectedVideoIds}
        onVideosLoaded={setVideos}
      />
    </main>
  );
}
