#!/bin/bash
# Starts the portfolio backend (:3001) and the Vite dev server (:3000) on this Mac.
# Logs: /tmp/sp-backend.log and /tmp/sp-frontend.log. Stop with dev-down.sh.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
REPO="/Users/sohampatel/workspace/Porfolio"

lsof -ti tcp:3001 | xargs kill -9 2>/dev/null
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
sleep 1

cd "$REPO/backend" || exit 1
nohup node server.js > /tmp/sp-backend.log 2>&1 &
echo "backend pid $!"

cd "$REPO/app" || exit 1
nohup npm run dev > /tmp/sp-frontend.log 2>&1 &
echo "frontend pid $!"

for i in $(seq 1 30); do
  sleep 1
  B=$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://localhost:3001/api/health)
  F=$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://localhost:3000/)
  [ "$B" = "200" ] && [ "$F" = "200" ] && break
done
echo "backend  http://localhost:3001/api/health -> $B"
echo "frontend http://localhost:3000/           -> $F"
echo "--- backend log ---"; tail -5 /tmp/sp-backend.log
echo "--- frontend log ---"; tail -8 /tmp/sp-frontend.log
