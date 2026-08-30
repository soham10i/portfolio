# Quick fix: Switch MedQA from NVIDIA (broken) to OpenRouter (works)
# No code changes needed — just edit backend/.env

cat << 'EOF'

1. Get free OpenRouter key: https://openrouter.ai/settings/keys

2. Edit backend/.env:

   # OLD (NVIDIA — text models broken)
   LLM_API_BASE=https://integrate.api.nvidia.com/v1
   LLM_MODEL=meta/llama-3.1-8b-instruct
   LLM_API_KEY=nvapi-xxx

   # NEW (OpenRouter — 70B works on free tier)
   LLM_API_BASE=https://openrouter.ai/api/v1
   LLM_MODEL=meta-llama/llama-3.1-70b-instruct
   LLM_API_KEY=sk-or-v1-your-openrouter-key

   # Keep NVIDIA for vision (SceneLab still works!)
   LLM_VISION_MODEL=meta/llama-3.2-90b-vision-instruct

3. Restart: cd backend && node server.js

4. Test:
   curl http://localhost:3001/api/health
   curl -X POST http://localhost:3001/api/medqa/ask \
     -H "Content-Type: application/json" \
     -d '{"question":"A 45yo has chest pain radiating to left arm. Most likely diagnosis?","options":{"A":"GERD","B":"MI","C":"Costochondritis","D":"Anxiety"}}'

EOF
