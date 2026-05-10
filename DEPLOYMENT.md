# Deployment Notes

This app is a monorepo with two public services:

- Web UI: `apps/web` (Next.js)
- API: `apps/api` (Express)

Deploy them as separate services unless your host is explicitly configured to run both behind one domain.

## API Service

Build command:

```bash
npm ci --include=dev && python3 -m pip install yt-dlp && npm run build -w @reclip/shared && npm run build -w @reclip/api
```

Start command:

```bash
npm run start -w @reclip/api
```

Required production env:

```bash
NODE_ENV=production
PORT=<provided-by-host>
WEB_ORIGIN=https://your-web-domain.example
API_BASE_URL=https://your-api-domain.example
FFMPEG_API_URL=https://stitch-video-production-9afe.up.railway.app/stitch
FFMPEG_API_KEY=
MAX_VIDEOS_PER_REFRESH=50
MAX_BULK_DOWNLOAD=100
```

`WEB_ORIGIN` can be comma-separated if you have preview and production domains.

YouTube channel discovery requires `yt-dlp` in the API runtime. If the host does not install it, adding a YouTube channel will fail with:

```text
YouTube discovery needs yt-dlp installed in the API runtime.
```

On Render, `npm ci --include=dev` ensures TypeScript declaration packages are present during the build, and `python3 -m pip install yt-dlp` makes the `python3 -m yt_dlp` fallback available to the API.

## Web Service

Build command:

```bash
npm ci && npm run build -w @reclip/shared && npm run build -w @reclip/web
```

Start command:

```bash
npm run start -w @reclip/web -- -p $PORT
```

Required production env:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.example
```

Do not use `localhost` in production env vars. A deployed browser treats `localhost` as the visitor's machine, not your API service.

## Important

`DATABASE_URL`, `REDIS_URL`, and `STORAGE_*` are not wired into the current TypeScript app yet. The current API uses in-memory maps, so channels and jobs reset whenever the API restarts.

The root `Dockerfile` belongs to the retired Flask downloader. If your host auto-detects that Dockerfile, it will not run the current Next.js + Express app correctly.
