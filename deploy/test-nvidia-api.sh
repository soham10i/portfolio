#!/usr/bin/env bash
# Test NVIDIA NIM API integration
# Usage: ./deploy/test-nvidia-api.sh [API_KEY]

API_KEY="${1:-${LLM_API_KEY:-}}"
BASE_URL="https://integrate.api.nvidia.com/v1"

if [ -z "$API_KEY" ]; then
    echo "❌ No API key provided."
    echo ""
    echo "Get your free API key at: https://build.nvidia.com/settings/api-keys"
    echo ""
    echo "Usage:"
    echo "  ./deploy/test-nvidia-api.sh sk-nvidia-xxx"
    echo "  or set LLM_API_KEY environment variable"
    exit 1
fi

echo "========================================"
echo "  NVIDIA NIM API Test"
echo "  URL: ${BASE_URL}"
echo "========================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test 1: List models
echo "[1/4] Listing available models..."
MODELS=$(curl -s "${BASE_URL}/models" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" 2>/dev/null)

if echo "$MODELS" | grep -q '"data"'; then
    echo -e "${GREEN}✓${NC} API key valid"
    MODEL_COUNT=$(echo "$MODELS" | grep -o '"id"' | wc -l)
    echo "      Found ~${MODEL_COUNT} models"
else
    echo -e "${RED}✗${NC} API key invalid or API unreachable"
    echo "      Response: $(echo "$MODELS" | head -c 200)"
    exit 1
fi
echo ""

# Test 2: Simple chat completion
echo "[2/4] Testing chat completion..."
CHAT=$(curl -s "${BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Say hello in one word"}],
    "max_tokens": 10,
    "temperature": 0.3
  }' 2>/dev/null)

if echo "$CHAT" | grep -q '"content"'; then
    echo -e "${GREEN}✓${NC} Chat working"
    CONTENT=$(echo "$CHAT" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "      Response: ${CONTENT}"
else
    echo -e "${RED}✗${NC} Chat failed"
    echo "      Error: $(echo "$CHAT" | grep -o '"message":"[^"]*"' | head -1 | cut -d'"' -f4)"
fi
echo ""

# Test 3: Medical QA style prompt
echo "[3/4] Testing medical reasoning..."
MED=$(curl -s "${BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama-3.1-8b-instruct",
    "messages": [
      {"role": "system", "content": "You are a medical expert. Answer with JSON: {\"answer\": \"A\", \"explanation\": \"...\", \"confidence\": 0.85}"},
      {"role": "user", "content": "Question: A 45-year-old man has chest pain. First line treatment?\nOptions:\nA. Aspirin\nB. Morphine\nC. Nitroglycerin\nD. Oxygen"}
    ],
    "max_tokens": 256,
    "temperature": 0.3
  }' 2>/dev/null)

if echo "$MED" | grep -q '"content"'; then
    echo -e "${GREEN}✓${NC} Medical reasoning working"
    CONTENT=$(echo "$MED" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 100)
    echo "      Response: ${CONTENT}..."
else
    echo -e "${RED}✗${NC} Medical reasoning failed"
fi
echo ""

# Test 4: Vision model (if available)
echo "[4/4] Testing vision model availability..."
if echo "$MODELS" | grep -q 'llama-3.2-11b-vision\|llama-3.2-90b-vision'; then
    echo -e "${GREEN}✓${NC} Vision models available"
    echo "      Ready for SceneLab VLM fallback"
else
    echo -e "${YELLOW}!${NC} No vision models found in free tier"
    echo "      SceneLab will use text-only fallback"
fi
echo ""

echo "========================================"
echo "  Test complete"
echo "========================================"
echo ""
echo "To use NVIDIA API in your portfolio:"
echo "  LLM_API_BASE=https://integrate.api.nvidia.com/v1"
echo "  LLM_MODEL=meta/llama-3.1-8b-instruct"
echo "  LLM_API_KEY=${API_KEY:0:10}..."
