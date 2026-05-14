# ────────────────────────────────────────────────────────────────
#  Builder stage - compile TS, install dev deps, install yt-dlp
# ────────────────────────────────────────────────────────────────
FROM node:24-bullseye-slim AS builder

# ---- System tools needed for the build and runtime ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    # git is handy for npm ci when a lockfile references a git URL
    git \
    && rm -rf /var/lib/apt/lists/*

# ---- yt‑dlp ----------------------------------------------------
# Debian 12 marks the system Python environment as "externally managed".
# Using the flag --allow-existing bypasses the PEP 668 guard.
RUN python3 -m pip install --no-cache-dir --allow-existing yt-dlp

# ---- Work directory -------------------------------------------------
WORKDIR /app

# ---- Copy only lockfiles first (speeds up caching) ------------------
COPY package.json package-lock.json ./
# In a workspace you also have a root lock for the shared packages
# If you use a `pnpm-lock.yaml` or `yarn.lock` adjust accordingly

# ---- Copy the whole source tree ------------------------------------
COPY . .

# ---- Install Node dependencies (including dev deps) ----------------
RUN npm ci --include=dev

# ---- Build the two workspace packages we need ----------------------
RUN npm run build -w @reclip/shared && \
    npm run build -w @reclip/api

# --------------------------------------------------------------------
#  Runtime stage - only the things needed to *run* the API
# --------------------------------------------------------------------
FROM node:24-bullseye-slim

ENV NODE_ENV=production

# ---- Runtime system deps (ffmpeg & Python for the yt-dlp binary) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# ---- Pull the Python site-packages (yt-dlp) from the builder ----------
COPY --from=builder /usr/local /usr/local

# ---- Application code ------------------------------------------------
WORKDIR /app

# Only copy the files the API actually needs at runtime.
# (dist folder, package.json, node_modules, and the shared lib)
COPY --from=builder /app/apps/api/dist   ./apps/api/dist
COPY --from=builder /app/apps/api/src    ./apps/api/src
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder /app/shared        ./shared
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# ---- Expose the port (Render injects $PORT, default 4000) ----------
EXPOSE ${PORT:-4000}

# ---- Entrypoint ------------------------------------------------------
CMD ["node", "apps/api/dist/index.js"]