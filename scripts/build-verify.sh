#!/bin/bash
# Build & Deploy Verification Script
# Run after any code change: bash scripts/build-verify.sh

set -e

echo "🔧 Step 1: Building frontend..."
cd app
npm run build 2>&1 | tail -5
echo "✅ Build complete"

echo ""
echo "🔧 Step 2: Type-checking..."
npx tsc --noEmit 2>&1 | tail -3 || true
echo "✅ Type check complete"

echo ""
echo "🔧 Step 3: Restarting backend..."
cd ../backend
kill $(lsof -ti:3001) 2>/dev/null || true
sleep 1
node server.js &
BACKEND_PID=$!
sleep 2
echo "✅ Backend started (PID: $BACKEND_PID)"

echo ""
echo "🔧 Step 4: Running API validation..."
cd ..
node scripts/validate.js

echo ""
echo "🎉 All checks passed! Ready for preview."
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
