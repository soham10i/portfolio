#!/usr/bin/env bash
# Production topology, locally: build the SPA, then serve it from Express on a
# single origin — exactly what Render runs. Use this, not `vite preview`, to
# reproduce anything that only breaks in production (SPA fallback routes,
# same-origin /api, asset paths).
#
#   scripts/preview.sh        → http://localhost:3001
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BUILD_LOG=/tmp/portfolio-build.log
SERVE_LOG=/tmp/portfolio-preview.log

log "building frontend"
if ! (cd "$REPO/app" && npm run build > "$BUILD_LOG" 2>&1); then
  echo "--- build failed, last 30 lines ---"; tail -30 "$BUILD_LOG"; exit 1
fi
tail -6 "$BUILD_LOG" | sed 's/^/   /'

log "serving on :$BACKEND_PORT"
free_port "$BACKEND_PORT"; sleep 1
(cd "$REPO/backend" && NODE_ENV=production nohup node server.js > "$SERVE_LOG" 2>&1 &)

code="$(wait_for "http://localhost:$BACKEND_PORT/api/health" 25)"
[ "$code" = 200 ] || { echo "--- server log ---"; tail -30 "$SERVE_LOG"; die "backend did not come up"; }

log "route check"
for p in / /factory-twin /robot /scene /medqa /project/digital-twin \
         /factory-twin-3d.js /vendor/three.min.js /worlds/maze3-world.json \
         /videos/maze1.mp4 /api/health; do
  printf '   %-32s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 8 "http://localhost:$BACKEND_PORT$p")"
done

ok "preview live at http://localhost:$BACKEND_PORT   (stop: scripts/dev.sh down)"
