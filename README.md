# RECLIP Downloader

This repo now runs a single modern UI experience using the Next.js app in `apps/web`.

Users can:
- Add YouTube and TikTok channels
- Preview fetched videos
- Download one video or all videos
- Use the top CTA to route into your stitching flow

## Stack

- Frontend: Next.js (`apps/web`)
- API: Express (`apps/api`)
- Worker: Node + ffmpeg job processor (`apps/worker`)
- Shared types: TypeScript package (`packages/shared`)

## Quick Start

```bash
cp .env.example .env
./reclip.sh
```

Or manually:

```bash
npm install
npm run dev
```

## Local URLs

- Web UI: `http://localhost:3000`
- API: `http://localhost:4000`

## Notes

- The legacy Flask template UI is retired and no longer the default product interface.
- Keep `ffmpeg` installed on your machine for download/transcode workflows.
