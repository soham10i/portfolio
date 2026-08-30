#!/usr/bin/env bash
# test-med-models.sh — Test medical-grade models on NVIDIA NIM
set -e

API_KEY="${LLM_API_KEY:?Set LLM_API_KEY first}"
QUESTION='A 45-year-old male presents with crushing chest pain radiating to the left arm, diaphoresis, and nausea. ECG shows ST elevation in leads V1-V4. What is the most likely diagnosis?'

test_model() {
  local model=$1
  echo "=== Testing: $model ==="
  curl -s -w "\nHTTP %{http_code}\n" https://integrate.api.nvidia.com/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"$model\",
      \"messages\": [{\"role\":\"user\",\"content\":\"$QUESTION\"}],
      \"max_tokens\": 128,
      \"temperature\": 0.3
    }" | tee "/tmp/$(echo $model | tr '/' '_').json"
  echo ""
  echo "---"
}

test_model "meta/llama-3.1-8b-instruct"
test_model "nvidia/llama-3.1-nemotron-70b-instruct"
test_model "writer/palmyra-med-70b"
test_model "nvidia/llama-3.1-nemotron-ultra-253b-v1"

echo ""
echo "Done. Check /tmp/*.json for full responses."
