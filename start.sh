#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "[Memory Reconstruction] Starting game environment..."

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not found in PATH." >&2
    echo "Please install Node.js 20+ from https://nodejs.org/" >&2
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "[ERROR] npm is not found in PATH." >&2
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[Memory Reconstruction] Installing dependencies..."
    npm install
fi

echo "[Memory Reconstruction] Launching development server on http://localhost:3000..."
npm run dev
