#!/bin/bash
# Local production deploy: build the Vite app, then serve it from the Express
# backend on a single origin (the same topology as the real deployment, so the
# chat panel talks to /api with no proxy and no CORS).
#
#   bash scripts/deploy-local.sh        → http://localhost:3001
#
# Logs: /tmp/sp-local-build.log, /tmp/sp-local-server.log
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
REPO="/Users/sohampatel/workspace/Porfolio"

echo "▸ building frontend…"
cd "$REPO/app" || exit 1
if ! npm run build > /tmp/sp-local-build.log 2>&1; then
  echo "✗ build FAILED — last 25 lines:"
  tail -25 /tmp/sp-local-build.log
  exit 1
fi
tail -8 /tmp/sp-local-build.log | sed 's/^/   /'

echo "▸ restarting backend on :3001…"
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null
sleep 1
cd "$REPO/backend" || exit 1
nohup node server.js > /tmp/sp-local-server.log 2>&1 &
echo "   pid $!"

for i in $(seq 1 25); do
  sleep 1
  [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://localhost:3001/api/health)" = "200" ] && break
done

echo "▸ route check"
for p in / /factory-twin /robot /project/digital-twin /factory-twin-3d.js /vendor/three.min.js /worlds/maze3-world.json /api/health; do
  printf '   %-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 8 "http://localhost:3001$p")"
done

echo
echo "✓ local deploy live at http://localhost:3001"
echo "  (stop with: lsof -ti tcp:3001 | xargs kill -9)"
