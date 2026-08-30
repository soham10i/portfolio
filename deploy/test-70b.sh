#!/usr/bin/env bash
# test-70b.sh — Quick test of NVIDIA 70B model availability
set -e

API_KEY="${LLM_API_KEY:?Set LLM_API_KEY first}"

echo "Testing meta/llama-3.1-70b-instruct ..."
curl -s -w "\nHTTP %{http_code}\n" https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama-3.1-70b-instruct",
    "messages": [{"role":"user","content":"A 45-year-old has chest pain radiating to the left arm. Name the most likely diagnosis in 5 words."}],
    "max_tokens": 64,
    "temperature": 0.3
  }' | tee /tmp/70b-response.json

echo ""
echo "---"
if grep -q '"error"' /tmp/70b-response.json 2>/dev/null; then
  echo "❌ 70B FAILED — likely not on your free tier or key invalid"
  cat /tmp/70b-response.json | python3 -m json.tool 2>/dev/null || cat /tmp/70b-response.json
else
  echo "✅ 70B WORKS — you can switch LLM_MODEL to this"
fi
