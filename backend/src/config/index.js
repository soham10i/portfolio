/* Every environment-derived value in one place.
 *
 * Nothing else in the codebase reads process.env, so what the service needs in
 * order to run is answerable by reading this file — and a missing variable
 * produces one clear warning at boot rather than a confusing 500 later.
 *
 * Model endpoints are resolved through ./providers, which lets a deploy say
 * LLM_PROVIDER=groq instead of spelling out a base URL and a model id. The
 * explicit LLM_API_BASE / LLM_MODEL variables still take precedence, so every
 * configuration that worked before this file gained a registry still works. */
const path = require('path');
const { resolve } = require('./providers');

const isProd = process.env.NODE_ENV === 'production';

/* Text and vision are resolved independently because they are routinely on
   different vendors — the free tiers are not good at the same things. When the
   vision role resolves to nothing it inherits the text role, which is the
   common single-provider case. */
const text = resolve({
  providerEnv: 'LLM_PROVIDER',
  baseEnv: 'LLM_API_BASE',
  modelEnv: 'LLM_MODEL',
  keyEnv: 'LLM_API_KEY',
});

const visionRaw = resolve({
  providerEnv: 'LLM_VISION_PROVIDER',
  baseEnv: 'LLM_VISION_API_BASE',
  modelEnv: 'LLM_VISION_MODEL',
  keyEnv: 'LLM_VISION_API_KEY',
  role: 'vision',
});
const vision = {
  baseUrl: visionRaw.baseUrl || text.baseUrl,
  model: visionRaw.model || text.model,
  apiKey: visionRaw.apiKey || (visionRaw.baseUrl ? '' : text.apiKey),
};

/* The fallback is tried when the primary answers 429 or 5xx. Free tiers
   rate-limit hard, and the whole value of a fallback is that it is a DIFFERENT
   vendor — pointing it at the same one buys nothing. */
const fallbackRaw = resolve({
  providerEnv: 'LLM_FALLBACK_PROVIDER',
  baseEnv: 'LLM_FALLBACK_API_BASE',
  modelEnv: 'LLM_FALLBACK_MODEL',
  keyEnv: 'LLM_FALLBACK_API_KEY',
});

const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,

  /* Language model: any OpenAI-compatible /chat/completions endpoint — Groq,
     OpenRouter, NVIDIA NIM, Gemini's compat layer, vLLM, Ollama, LM Studio.
     Deliberately not tied to one vendor. */
  llm: {
    provider: text.provider,
    baseUrl: text.baseUrl,
    model: text.model || 'qwen2.5:7b-instruct',
    apiKey: text.apiKey,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 120_000,
    get ready() { return !!this.baseUrl; },

    visionProvider: visionRaw.provider,
    visionBaseUrl: vision.baseUrl,
    visionModel: vision.model || 'qwen2.5vl:7b',
    visionApiKey: vision.apiKey,
    get visionReady() { return !!this.visionBaseUrl; },

    fallback: fallbackRaw.baseUrl
      ? { baseUrl: fallbackRaw.baseUrl, model: fallbackRaw.model, apiKey: fallbackRaw.apiKey }
      : null,
  },

  /* The project's own FastAPI + BLIP captioning service, when it is hosted. */
  scene: {
    baseUrl: (process.env.SCENE_API_BASE || '').replace(/\/$/, ''),
    timeoutMs: Number(process.env.SCENE_TIMEOUT_MS) || 120_000,
    maxImageBytes: 1_500_000,          // ~1.5 MB of JPEG is plenty at 512 px
  },

  notes: {
    dir: path.join(__dirname, '..', '..', 'notes'),
    adminToken: process.env.ADMIN_TOKEN || '',
    maxBytes: 400_000,
  },

  contact: {
    file: path.join(__dirname, '..', '..', 'messages.jsonl'),
    /* Hard ceiling on the mailbox file. Without it a rate-limited attacker can
       still append ~8,600 messages a day and eventually fill the disk. */
    maxFileBytes: 5_000_000,
  },

  /* MedQA's retrieval index loads a quantised embedding model into memory on
     first use. On a 512 MB free instance that is the single largest allocation
     in the process, so it is opt-out: set MEDQA_ENABLED=false to keep the rest
     of the site alive on a constrained host. */
  medqa: {
    enabled: process.env.MEDQA_ENABLED !== 'false',
    indexPath: path.join(__dirname, '..', '..', 'data', 'medqa-index.json'),
  },

  limits: {
    chat: { windowMs: 5 * 60 * 1000, max: 3000 },
    scene: { windowMs: 5 * 60 * 1000, max: 6000 },
    maxHistoryMessages: 20,
    maxMessageChars: 4000,
  },

  /* CORS. In production an unset ALLOWED_ORIGINS means same-origin only —
     the frontend is served by this same process, so it needs no CORS at all.
     Reflecting every origin (the old default) let any website on the internet
     call this API from a visitor's browser. */
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : (isProd ? false : true),
};

module.exports = config;
