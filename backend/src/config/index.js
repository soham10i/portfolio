/* Every environment-derived value in one place.
 *
 * Nothing else in the codebase reads process.env, so what the service needs in
 * order to run is answerable by reading this file — and a missing variable
 * produces one clear warning at boot rather than a confusing 500 later. */
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,

  /* Language model: any OpenAI-compatible /chat/completions endpoint —
     vLLM, llama.cpp --server, Ollama (/v1), LM Studio, HF Inference Endpoints.
     Deliberately not tied to one vendor. */
  llm: {
    baseUrl: (process.env.LLM_API_BASE || '').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'qwen2.5:7b-instruct',
    visionModel: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL || 'qwen2.5vl:7b',
    apiKey: process.env.LLM_API_KEY || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 30_000,
    get ready() { return !!this.baseUrl; },
  },

  /* The project's own FastAPI + BLIP captioning service, when it is hosted. */
  scene: {
    baseUrl: (process.env.SCENE_API_BASE || '').replace(/\/$/, ''),
    timeoutMs: Number(process.env.SCENE_TIMEOUT_MS) || 25_000,
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

  limits: {
    chat: { windowMs: 5 * 60 * 1000, max: 30 },
    scene: { windowMs: 5 * 60 * 1000, max: 60 },
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
