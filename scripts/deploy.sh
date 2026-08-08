#!/bin/bash
# Quick deploy script — builds frontend and deploys backend
# Usage: bash scripts/deploy.sh [render|fly]

set -e

PLATFORM=${1:-render}

echo "🔧 Building production frontend..."
cd app
npm run build 2>&1 | tail -3
cd ..

echo ""
echo "📦 Committing changes..."
git add -A
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')" || true

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main || git push origin master

echo ""
if [ "$PLATFORM" = "fly" ]; then
  echo "🚀 Deploying to Fly.io..."
  fly deploy
else
  echo "✅ Render will auto-deploy from GitHub push"
  echo "   Monitor at: https://dashboard.render.com"
fi

echo ""
echo "🎉 Deploy triggered!"
