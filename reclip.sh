#!/bin/bash
set -e
cd "$(dirname "$0")"

missing=""

if ! command -v node >/dev/null 2>&1; then
    missing="$missing node"
fi

if ! command -v npm >/dev/null 2>&1; then
    missing="$missing npm"
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    missing="$missing ffmpeg"
fi

if [ -n "$missing" ]; then
    echo "Missing required tools:$missing"
    echo ""
    if command -v brew >/dev/null 2>&1; then
        echo "Install with: brew install$missing"
    elif command -v apt >/dev/null 2>&1; then
        echo "Install with: sudo apt install$missing"
    else
        echo "Please install:$missing"
    fi
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

echo ""
echo "Starting RECLIP downloader stack..."
echo "Web UI: http://localhost:3000"
echo "API:    http://localhost:4000"
echo ""

npm run dev
