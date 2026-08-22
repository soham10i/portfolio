#!/bin/bash
# Stops the portfolio dev servers started by dev-up.sh.
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null
echo "stopped :3000 and :3001"
