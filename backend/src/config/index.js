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
const { resolve, resolveProvider, PROVIDERS } = require('./providers');

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

/* The fallback chain is tried when the primary answers 429, 5xx, or quota errors.
   Free tiers rate-limit hard, and the fallback chain tries secondary providers
   (e.g., Mercury -> Gemini -> GLM) before giving up. */
const fallbackRaw = resolve({
  providerEnv: 'LLM_FALLBACK_PROVIDER',
  baseEnv: 'LLM_FALLBACK_API_BASE',
  modelEnv: 'LLM_FALLBACK_MODEL',
  keyEnv: 'LLM_FALLBACK_API_KEY',
});

// Fallback provider sequence (default: Mercury -> Gemini -> GLM)
const fallbackNames = (process.env.LLM_FALLBACK_PROVIDERS
  ? process.env.LLM_FALLBACK_PROVIDERS.split(',')
  : (process.env.LLM_FALLBACK_PROVIDER ? [process.env.LLM_FALLBACK_PROVIDER] : (text.provider === 'mercury' ? ['gemini', 'glm'] : []))
).map((s) => s.trim().toLowerCase()).filter(Boolean);

const fallbacks = [];

// If multiple Mercury backup keys exist, include them right after primary Mercury
if (text.provider === 'mercury') {
  const extraKeys = [
    process.env.MERCURY_API_KEY_2,
    process.env.Mercury_API_KEY_2,
    process.env.MERCURY_API_KEY_3,
    process.env.Mercury_API_KEY_3,
  ].filter(Boolean);
  for (let i = 0; i < extraKeys.length; i++) {
    const k = extraKeys[i];
    if (k && k !== text.apiKey) {
      fallbacks.push({
        provider: 'mercury',
        label: `Inception Labs (Mercury backup key #${i + 2})`,
        baseUrl: text.baseUrl,
        model: text.model,
        apiKey: k,
        contextWindow: 1_000_000,
        maxOutputTokens: 131_072,
      });
    }
  }
}

for (const name of fallbackNames) {
  if (name === text.provider) continue;
  const p = resolveProvider(name, 'text', process.env);
  if (p && p.baseUrl) {
    fallbacks.push(p);
  }
}

if (fallbackRaw.baseUrl && !fallbacks.some((f) => f.baseUrl === fallbackRaw.baseUrl)) {
  fallbacks.push({
    provider: fallbackRaw.provider || 'custom',
    label: fallbackRaw.provider ? (PROVIDERS[fallbackRaw.provider]?.label || fallbackRaw.provider) : 'Custom Fallback',
    baseUrl: fallbackRaw.baseUrl,
    model: fallbackRaw.model,
    apiKey: fallbackRaw.apiKey,
    contextWindow: (fallbackRaw.provider && PROVIDERS[fallbackRaw.provider]?.contextWindow) || 128_000,
    maxOutputTokens: (fallbackRaw.provider && PROVIDERS[fallbackRaw.provider]?.maxOutputTokens) || 8_192,
  });
}

const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,

  /* Language model: any OpenAI-compatible /chat/completions endpoint — Mercury,
     Gemini's compat layer, GLM, Groq, NVIDIA NIM, OpenRouter, Ollama. */
  llm: {
    provider: text.provider,
    label: text.provider ? (PROVIDERS[text.provider]?.label || text.provider) : 'Custom',
    baseUrl: text.baseUrl,
    model: text.model || 'mercury-3',
    apiKey: text.apiKey,
    contextWindow: (text.provider && PROVIDERS[text.provider]?.contextWindow) || 1_000_000,
    maxOutputTokens: (text.provider && PROVIDERS[text.provider]?.maxOutputTokens) || 131_072,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 120_000,
    get ready() { return !!this.baseUrl; },

    visionProvider: visionRaw.provider,
    visionBaseUrl: vision.baseUrl,
    visionModel: vision.model || 'gemini-3.5-flash-lite',
    visionApiKey: vision.apiKey,
    get visionReady() { return !!this.visionBaseUrl; },

    fallback: fallbacks[0] || (fallbackRaw.baseUrl
      ? { baseUrl: fallbackRaw.baseUrl, model: fallbackRaw.model, apiKey: fallbackRaw.apiKey }
      : null),
    fallbacks,
  },

  /* The project's own FastAPI + BLIP captioning service, when it is hosted. */
  scene: {
    baseUrl: (process.env.SCENE_API_BASE || '').replace(/\/$/, ''),
    timeoutMs: Number(process.env.SCENE_TIMEOUT_MS) || 120_000,
    maxImageBytes: 1_500_000,          // ~1.5 MB of JPEG is plenty at 512 px
    /* Shared secret the captioning service checks, so only this backend can
       spend its GPU. Sent as X-Scene-Token; unset means the service is open. */
    apiToken: process.env.SCENE_API_TOKEN || '',
    get headers() { return this.apiToken ? { 'X-Scene-Token': this.apiToken } : {}; },
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

  /* Supabase stores JARVIS conversations. Server-side only: the secret key
     bypasses row-level security and must never reach the browser (no VITE_
     prefix, no client import). Unset → chat works, nothing is stored. The
     publishable key and JWKS URL are kept for future visitor sign-in. */
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    secretKey: process.env.SUPABASE_SECRET_KEY || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    jwksUrl: process.env.SUPABASE_JWKS_URL || '',
    get ready() { return !!(this.url && this.secretKey); },
  },

  /* MedQA's retrieval index loads a quantised embedding model into memory on
     first use. On a 512 MB free instance that is the single largest allocation
     in the process, so it is opt-out: set MEDQA_ENABLED=false to keep the rest
     of the site alive on a constrained host. */
  medqa: {
    enabled: process.env.MEDQA_ENABLED !== 'false',
    indexPath: path.join(__dirname, '..', '..', 'data', 'medqa-index.json'),
  },

  /* ElevenLabs text-to-speech — JARVIS's voice. Unset → /api/tts answers 503
     and the frontend falls back to the browser's speechSynthesis. Charged per
     character, so the route caps text length and rate-limits per IP. */
  tts: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID_01 || process.env.ELEVENLABS_VOICE_ID || '',
    model: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
    timeoutMs: Number(process.env.ELEVENLABS_TIMEOUT_MS) || 30_000,
    maxChars: 1200,
    get ready() { return !!(this.apiKey && this.voiceId); },
  },

  /* NEXUS, the governed agent runtime in ../nexus (ADR-0039 there). It binds to
     loopback only, so it must run on this host. The token belongs to an
     `agent` principal with the `requester` role only: it can ask and read,
     never plan, approve or execute. Unset -> /api/nexus reports "not configured". */
  nexus: {
    baseUrl: (process.env.NEXUS_URL || '').replace(/\/$/, ''),
    token: process.env.NEXUS_TOKEN || '',
    /* false keeps every NEXUS model call on its private (local) providers. */
    cloud: process.env.NEXUS_CLOUD === 'true',
    timeoutMs: Number(process.env.NEXUS_TIMEOUT_MS) || 90_000,
    get ready() { return !!(this.baseUrl && this.token); },
  },

  limits: {
    /* Each of these endpoints fans out to a paid upstream (LLM API, ElevenLabs,
       vision model), so the per-IP ceilings are deliberately tight: a genuine
       visitor sends a handful of chat messages and one or two TTS requests per
       visit. The old values (thousands per 5 minutes) assumed the limits were
       per-instance DoS guards; with CF-Connecting-IP keying they are per-human
       and the paid-call surface needs real caps. */
    chat: { windowMs: 5 * 60 * 1000, max: 40 },
    scene: { windowMs: 5 * 60 * 1000, max: 60 },
    /* TTS costs real money per character — the tightest bucket of any endpoint. */
    tts: { windowMs: 5 * 60 * 1000, max: 30 },
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
