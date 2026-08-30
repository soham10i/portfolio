#!/usr/bin/env bash
# Shared shell prelude. Sourced by every script in this directory.
#
# The one job here is REPO: every script derives the repository root from its
# own location rather than hard-coding a path, so the same script works on a
# laptop, in CI and in a container.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# Kill whatever holds a TCP port, on macOS or Linux, without failing when the
# port is already free.
free_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
}

# Poll a URL until it answers 200, or give up. Returns the last status code.
wait_for() {
  local url="$1" tries="${2:-30}" code=000
  for _ in $(seq 1 "$tries"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$url" || true)"
    [ "$code" = "200" ] && break
    sleep 1
  done
  printf '%s' "$code"
}
