# RECLIP Downloader V1

Monorepo containing:
- `apps/api`: channel ingestion, discovery, downloads, CTA/stitch integration
- `apps/worker`: ffmpeg-based job processor
- `apps/web`: UI for channels, previews, and bulk downloads
- `packages/shared`: shared types

## Quick Start
1. Copy `.env.example` to `.env` and set values.
2. Start dependencies: `docker compose up -d`.
3. Install packages: `npm install`.
4. Run all services: `npm run dev`.

## API Highlights
- `POST /channels`
- `GET /channels`
- `POST /channels/:id/refresh`
- `GET /videos`
- `POST /downloads/single`
- `POST /downloads/bulk`
- `GET /downloads/:jobId`
- `GET /cta/config`
- `POST /cta/click`
- `POST /stitch/submit`

## Deployment
- Deploy `apps/api`, `apps/worker`, and `apps/web` as separate services.
- Use managed Redis + Postgres + S3-compatible object storage.
- Configure environment variables from `.env.example`.
