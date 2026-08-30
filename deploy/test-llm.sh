#!/usr/bin/env bash
# Quick test script for LLM integration
# Usage: ./deploy/test-llm.sh [PORT]

PORT="${1:-3001}"
BASE="http://localhost:${PORT}"

echo "========================================"
echo "  LLM Integration Test"
echo "  Target: ${BASE}"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Health
echo "[1/4] Testing /api/health ..."
HEALTH=$(curl -s "${BASE}/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"llm":true'; then
    echo -e "${GREEN}✓${NC} LLM is configured and reachable"
    echo "      Model: $(echo "$HEALTH" | grep -o '"model":"[^"]*"' | cut -d'"' -f4)"
    echo "      Vision: $(echo "$HEALTH" | grep -o '"visionModel":"[^"]*"' | cut -d'"' -f4)"
elif echo "$HEALTH" | grep -q '"llm":false'; then
    echo -e "${RED}✗${NC} LLM is not reachable"
    echo "      Check LLM_API_BASE and LLM_API_KEY in backend/.env"
    exit 1
else
    echo -e "${RED}✗${NC} Backend not responding"
    echo "      Is the server running? cd backend && node server.js"
    exit 1
fi
echo ""

# Test 2: Chat
echo "[2/4] Testing /api/chat ..."
CHAT=$(curl -s -X POST "${BASE}/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Say hello in one word","history":[]}' 2>/dev/null)
if echo "$CHAT" | grep -q '"response"'; then
    echo -e "${GREEN}✓${NC} Chat working"
    echo "      Response: $(echo "$CHAT" | grep -o '"response":"[^"]*"' | cut -d'"' -f4 | head -c 80)"
else
    echo -e "${RED}✗${NC} Chat failed"
    echo "      Error: $(echo "$CHAT" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)"
fi
echo ""

# Test 3: MedQA
echo "[3/4] Testing /api/medqa/status ..."
MEDQA=$(curl -s "${BASE}/api/medqa/status" 2>/dev/null)
if echo "$MEDQA" | grep -q '"ready":true'; then
    echo -e "${GREEN}✓${NC} MedQA index loaded"
    echo "      Records: $(echo "$MEDQA" | grep -o '"count":[0-9]*' | cut -d':' -f2)"
else
    echo -e "${RED}✗${NC} MedQA not ready"
    echo "      $(echo "$MEDQA")"
fi
echo ""

# Test 4: MedQA Ask
echo "[4/4] Testing /api/medqa/ask ..."
ASK=$(curl -s -X POST "${BASE}/api/medqa/ask" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "A 45-year-old man has chest pain. What is the first line treatment?",
    "options": {"A": "Aspirin", "B": "Morphine", "C": "Nitroglycerin", "D": "Oxygen"}
  }' 2>/dev/null)
if echo "$ASK" | grep -q '"answer"'; then
    echo -e "${GREEN}✓${NC} MedQA RAG working"
    echo "      Answer: $(echo "$ASK" | grep -o '"answer":"[^"]*"' | cut -d'"' -f4)"
    echo "      Confidence: $(echo "$ASK" | grep -o '"confidence":[0-9.]*' | cut -d':' -f2)"
    echo "      Total time: $(echo "$ASK" | grep -o '"totalTime":[0-9]*' | cut -d':' -f2)ms"
else
    echo -e "${RED}✗${NC} MedQA ask failed"
    echo "      $(echo "$ASK" | head -c 200)"
fi
echo ""

echo "========================================"
echo "  Test complete"
echo "========================================"
