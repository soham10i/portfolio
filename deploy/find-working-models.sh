#!/usr/bin/env bash
# find-working-models.sh — Brute-force test which NVIDIA models actually respond
set -e
API_KEY="${LLM_API_KEY:?Set LLM_API_KEY first}"

MODELS=(
  "meta/llama-3.2-11b-vision-instruct"
  "meta/llama-3.2-90b-vision-instruct"
  "mistralai/mistral-7b-instruct-v0.3"
  "mistralai/mistral-large"
  "mistralai/mistral-large-2-instruct"
  "nvidia/nemotron-4-340b-instruct"
  "google/gemma-3-12b-it"
  "google/gemma-3-4b-it"
  "google/gemma-4-31b-it"
  "deepseek-ai/deepseek-v4-flash-0731"
  "deepseek-ai/deepseek-v4-pro-0813"
  "moonshotai/kimi-k2.6"
  "moonshotai/kimi-k3"
  "meta/llama2-70b"
  "meta/codellama-70b"
  "mistralai/mixtral-8x22b-v0.1"
  "mistralai/mistral-nemotron"
)

for model in "${MODELS[@]}"; do
  echo -n "Testing $model ... "
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    https://integrate.api.nvidia.com/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"$model\",
      \"messages\": [{\"role\":\"user\",\"content\":\"Hi\"}],
      \"max_tokens\": 10
    }" 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "✅ WORKS"
  elif [ "$code" = "410" ]; then
    echo "❌ EOL (410)"
  elif [ "$code" = "404" ]; then
    echo "❌ NO ACCESS (404)"
  elif [ "$code" = "401" ]; then
    echo "❌ BAD KEY (401)"
  elif [ "$code" = "429" ]; then
    echo "⚠️ RATE LIMITED (429)"
  else
    echo "❌ HTTP $code"
  fi
  sleep 0.5
done
