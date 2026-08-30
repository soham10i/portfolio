#!/usr/bin/env bash
# Which free-tier models are actually answering today?
#
# Free tiers churn: models go EOL, quotas move, endpoints 404 without warning.
# This replaces the pile of one-off per-vendor test scripts this repo used to
# carry. It reads backend/.env, calls each configured provider for real, and
# prints status and latency so the LLM_* values can be chosen from evidence
# rather than from a blog post.
#
#   scripts/probe-providers.sh                  # every provider in backend/.env
#   scripts/probe-providers.sh models groq      # list a provider's model ids
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ENV_FILE="$REPO/backend/.env"
[ -f "$ENV_FILE" ] || die "no backend/.env — copy backend/.env.example first"
set -a; . "$ENV_FILE"; set +a

GROQ_BASE="${GROQ_API_BASE:-https://api.groq.com/openai/v1}"
OR_BASE="${OPENROUTER_API_BASE:-https://openrouter.ai/api/v1}"
NV_BASE="${NVIDIA_API_BASE:-https://integrate.api.nvidia.com/v1}"

# name  base  key  model
probe() {
  local name="$1" base="$2" key="$3" model="$4"
  if [ -z "$key" ] || [ -z "$base" ]; then
    printf '  %-22s %-42s \033[33mskip\033[0m (no key)\n' "$name" "$model"; return
  fi
  local body t0 t1 code
  t0=$(date +%s%N)
  code=$(curl -s -o /tmp/probe.json -w '%{http_code}' --max-time 45 "$base/chat/completions" \
    -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: ok\"}],\"max_tokens\":256}")
  t1=$(date +%s%N)
  local ms=$(( (t1 - t0) / 1000000 ))

  # A 200 with empty content is a FAILURE in practice: reasoning models can
  # spend the whole token budget thinking and return nothing the user can see.
  local text
  text=$(python3 -c "import json,sys;d=json.load(open('/tmp/probe.json'));c=d.get('choices',[{}])[0].get('message',{}).get('content','');print((c if isinstance(c,str) else '')[:40].replace(chr(10),' '))" 2>/dev/null || echo '')
  if [ "$code" = 200 ] && [ -n "$text" ]; then
    printf '  %-22s %-42s \033[32mok\033[0m    %6sms  %s\n' "$name" "$model" "$ms" "$text"
  elif [ "$code" = 200 ]; then
    printf '  %-22s %-42s \033[33mempty\033[0m %6sms  200 but no content — budget eaten by reasoning tokens\n' "$name" "$model" "$ms"
  else
    printf '  %-22s %-42s \033[31m%s\033[0m %6sms  %s\n' "$name" "$model" "$code" "$ms" \
      "$(head -c 90 /tmp/probe.json | tr -d '\n')"
  fi
}

list_models() {
  local base key
  case "$1" in
    groq)       base="$GROQ_BASE"; key="${GROQ_API_KEY:-}" ;;
    openrouter) base="$OR_BASE";   key="${OPENROUTER_API_KEY:-}" ;;
    nvidia)     base="$NV_BASE";   key="${NVIDIA_API_KEY:-}" ;;
    *) die "usage: scripts/probe-providers.sh models [groq|openrouter|nvidia]" ;;
  esac
  [ -n "$key" ] || die "no key for $1 in backend/.env"
  curl -s --max-time 30 "$base/models" -H "Authorization: Bearer $key" \
    | python3 -c "import json,sys;print('\n'.join(sorted(m['id'] for m in json.load(sys.stdin)['data'])))"
}

if [ "${1:-}" = models ]; then list_models "${2:-groq}"; exit 0; fi

echo
echo "Provider probe — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "───────────────────────────────────────────────────────────────────────────────"
echo "TEXT"
probe "groq"        "$GROQ_BASE" "${GROQ_API_KEY:-}"       "${GROQ_MODEL:-qwen/qwen3.8-27b}"
probe "openrouter"  "$OR_BASE"   "${OPENROUTER_API_KEY:-}" "${OPENROUTER_MODEL:-openrouter/free}"
echo "VISION"
probe "nvidia"      "$NV_BASE"   "${NVIDIA_API_KEY:-}"     "${NVIDIA_VISION_MODEL:-meta/llama-3.2-90b-vision-instruct}"
echo "CONFIGURED (what backend/.env actually uses)"
probe "primary"     "${LLM_API_BASE:-}"          "${LLM_API_KEY:-}"          "${LLM_MODEL:-}"
probe "fallback"    "${LLM_FALLBACK_API_BASE:-}" "${LLM_FALLBACK_API_KEY:-}" "${LLM_FALLBACK_MODEL:-}"
echo "───────────────────────────────────────────────────────────────────────────────"
echo "Model ids:  scripts/probe-providers.sh models [groq|openrouter|nvidia]"
echo
