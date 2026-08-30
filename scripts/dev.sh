#!/usr/bin/env bash
# Development servers: Express on :3001, Vite on :3000 with /api proxied to it.
#
#   scripts/dev.sh up      start both, wait for health, print the logs
#   scripts/dev.sh down    stop both
#   scripts/dev.sh logs    tail both logs
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACK_LOG=/tmp/portfolio-backend.log
FRONT_LOG=/tmp/portfolio-frontend.log

case "${1:-up}" in
  down)
    free_port "$BACKEND_PORT"; free_port "$FRONTEND_PORT"
    ok "stopped :$FRONTEND_PORT and :$BACKEND_PORT"
    ;;

  logs)
    tail -f "$BACK_LOG" "$FRONT_LOG"
    ;;

  up)
    [ -f "$REPO/backend/.env" ] || warn "backend/.env is missing — copy backend/.env.example and add a key"
    free_port "$BACKEND_PORT"; free_port "$FRONTEND_PORT"; sleep 1

    log "backend  → :$BACKEND_PORT"
    (cd "$REPO/backend" && nohup node server.js > "$BACK_LOG" 2>&1 &)
    log "frontend → :$FRONTEND_PORT"
    (cd "$REPO/app" && nohup npm run dev > "$FRONT_LOG" 2>&1 &)

    b="$(wait_for "http://localhost:$BACKEND_PORT/api/health")"
    f="$(wait_for "http://localhost:$FRONTEND_PORT/")"
    printf '   backend  http://localhost:%s/api/health -> %s\n' "$BACKEND_PORT" "$b"
    printf '   frontend http://localhost:%s/           -> %s\n' "$FRONTEND_PORT" "$f"
    [ "$b" = 200 ] || { echo "--- backend log ---"; tail -20 "$BACK_LOG"; }
    [ "$f" = 200 ] || { echo "--- frontend log ---"; tail -20 "$FRONT_LOG"; }
    [ "$b$f" = "200200" ] && ok "dev up" || die "dev failed to come up"
    ;;

  *) die "usage: scripts/dev.sh [up|down|logs]" ;;
esac
