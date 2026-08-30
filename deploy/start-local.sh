#!/usr/bin/env bash
# Local development startup script
# Starts both the portfolio backend and the scene-api (if configured)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "========================================"
echo "  Portfolio Local Dev Launcher"
echo "========================================"
echo ""

# Check environment files
if [ ! -f "$ROOT/backend/.env" ]; then
    echo "⚠️  backend/.env not found. Copying from .env.example"
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    echo "📝 Please edit backend/.env with your values"
fi

if [ ! -f "$ROOT/scene-api/.env" ]; then
    echo "⚠️  scene-api/.env not found. Copying from .env.example"
    cp "$ROOT/scene-api/.env.example" "$ROOT/scene-api/.env"
    echo "📝 Please edit scene-api/.env with your values"
fi

# Option 1: Docker Compose (full stack)
if command -v docker-compose &> /dev/null || command -v docker &> /dev/null; then
    echo "🐳 Starting full stack with Docker Compose..."
    cd "$ROOT"
    docker compose up --build
    exit 0
fi

# Option 2: Manual start (backend only, no scene-api)
echo "🚀 Docker not found. Starting backend only..."
echo ""

cd "$ROOT/backend"
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm ci
fi

echo "🔧 Starting backend on http://localhost:3001"
echo ""
node server.js
