/* Free-tier provider registry.
 *
 * Every provider here speaks the OpenAI /chat/completions wire format, which
 * is the reason this codebase has no vendor SDK: switching provider is an
 * environment change, never a code change.
 *
 * The registry exists to collapse four environment variables into one. Setting
 *
 *     LLM_PROVIDER=gemini
 *     GEMINI_API_KEY=AIza...
 *
 * is equivalent to setting LLM_API_BASE and LLM_MODEL by hand, and it means the
 * Render dashboard holds secrets and a provider name rather than URLs that go
 * stale. Explicit LLM_API_BASE / LLM_MODEL always win, so nothing here can trap
 * you: point at a self-hosted vLLM or an Ollama on your desk and the registry
 * steps out of the way.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY model id below was called for real on 2026-08-30 and answered 200 with
 * non-empty content. That verification is not optional ceremony. On this date:
 *
 *   gemini-2.0-flash-lite            404  "no longer available"
 *   gemini-2.5-flash-lite            404  "no longer available to new users"
 *   llama-3.3-70b-versatile          absent from Groq's catalogue entirely
 *   nvidia/llama-3.1-nemotron-70b    404  for this account
 *   meta/llama-3.2-90b-vision        timed out at 90s
 *   google/gemma-4-31b-it:free       404  despite appearing in /models
 *
 * A model id in a catalogue is a claim, not a capability. Re-verify with
 * scripts/probe-providers.sh before changing anything here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PROVIDERS = {
  /* ── Default for chat ──────────────────────────────────────────────────────
     Chosen for quota, not raw speed: Google's free tier is measured in
     requests per day rather than tokens, which suits a portfolio whose traffic
     is bursty and mostly short turns. */
  gemini: {
    label: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash-lite',
    visionModel: 'gemini-3.5-flash-lite',
    keyEnv: 'GEMINI_API_KEY',
    console: 'https://aistudio.google.com/app/apikey',
    notes: 'Verified 2026-08-30: gemini-3.5-flash-lite 815ms text, 3663ms on a '
         + '19KB image. gemini-flash-lite-latest is the rolling alias and was '
         + '613ms — prefer the alias if you would rather not chase id changes, '
         + 'accepting that it can move under you.\n'
         + 'DO NOT use the reasoning tiers for chat. gemini-2.5-flash took '
         + '16.4s to return one word and returns EMPTY content when max_tokens '
         + 'is small, because hidden thinking consumes the whole budget. Google '
         + 'also retires dated -lite ids aggressively: 2.0-flash-lite and '
         + '2.5-flash-lite both answer 404 now.',
  },

  /* ── Fastest text ──────────────────────────────────────────────────────────
     Groq is the right primary when time-to-first-token is what you are being
     judged on. Note its catalogue is small and volatile — it is an inference
     shop, not a model zoo. */
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    visionModel: null,              // Groq serves no vision model — see notes
    keyEnv: 'GROQ_API_KEY',
    console: 'https://console.groq.com/keys',
    notes: 'Verified 2026-08-30 on a 14-model catalogue: gpt-oss-120b 611ms, '
         + 'gpt-oss-20b 219ms, qwen/qwen3.8-27b 285ms, groq/compound 527ms. '
         + 'Fastest free inference by a wide margin.\n'
         + 'Two traps. First, llama-3.3-70b-versatile — widely cited, including '
         + 'in this file until today — is NOT in the catalogue at all any more; '
         + 'Groq has dropped Llama chat models. Second, Groq serves NO '
         + 'vision-capable model, so it cannot back SceneLab captioning. '
         + 'visionModel is null on purpose rather than pointing at something '
         + 'that would 404 at the worst moment.\n'
         + 'Quota is metered in tokens per day, not requests, so a few long '
         + 'answers cost more than many short ones.',
  },

  /* ── Vision, and access to genuinely large models ──────────────────────────
     The only free tier here serving both a working vision model and models in
     the hundreds of billions of parameters. */
  nvidia: {
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    visionModel: 'meta/llama-3.2-11b-vision-instruct',
    keyEnv: 'NVIDIA_API_KEY',
    console: 'https://build.nvidia.com',
    notes: 'Verified 2026-08-30 on an 83-model catalogue.\n'
         + 'VISION: llama-3.2-11b-vision-instruct answered a 19KB JPEG in '
         + '1463ms with an accurate caption — the fastest working free vision '
         + 'model measured. The 90B sibling TIMED OUT at 90s and is unusable '
         + 'for keyframe captioning, whatever its benchmark scores say.\n'
         + 'LARGE TEXT: nemotron-3-super-120b-a12b 2321ms, and '
         + 'nemotron-3-ultra-550b-a55b (550B total / 55B active MoE) answered '
         + 'in 5850ms. Both free. That 5.8s is fine for MedQA and SceneLab clip '
         + 'summarisation, which are one-shot and already slow; it is too slow '
         + 'to sit behind an interactive chat box.\n'
         + 'Not every listed id is provisioned per account: nemotron-4-340b, '
         + 'llama-3.1-nemotron-ultra-253b and llama-3.1-nemotron-70b all '
         + 'answered 404 "Not found for account".',
  },

  /* Same endpoint as `nvidia`, pointed at the largest model that answers.
     A separate entry rather than a flag, so a route can opt into the slow big
     model by name without disturbing the vision configuration. */
  'nvidia-large': {
    label: 'NVIDIA NIM (550B)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    visionModel: 'meta/llama-3.2-11b-vision-instruct',
    keyEnv: 'NVIDIA_API_KEY',
    console: 'https://build.nvidia.com',
    notes: 'nemotron-3-ultra-550b-a55b, verified 5850ms. Use for reasoning-heavy '
         + 'one-shot work — MedQA generation, clip summarisation — never for '
         + 'interactive chat.',
  },

  /* ── Fallback only ────────────────────────────────────────────────────────
     Kept because the auto-router is a genuinely good fallback shape, but read
     the notes before relying on it. */
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    visionModel: 'openrouter/free',
    keyEnv: 'OPENROUTER_API_KEY',
    console: 'https://openrouter.ai/keys',
    notes: 'openrouter/free auto-routes across a pool of :free models, which is '
         + 'the right shape for a fallback — it survives any single model being '
         + 'retired. Measured 1515ms on 2026-08-30 at 14:31.\n'
         + 'BUT: the free pool is text-only. As of this date OpenRouter listed '
         + '53 Qwen models, 26 of them vision-capable, and ZERO of them free. '
         + 'Qwen-VL through OpenRouter requires a funded account — cheap '
         + '(qwen3-vl-8b-instruct is $0.117/M input, roughly $0.14 per thousand '
         + 'keyframe captions) but not free.\n'
         + 'The free tier is also capped around 50 requests/day until a one-time '
         + 'credit purchase raises it, which is why this is a fallback and not a '
         + 'primary.',
  },

  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b-instruct',
    visionModel: 'qwen2.5vl:7b',
    keyEnv: null,
    console: 'https://ollama.com',
    notes: 'For development without burning a hosted quota. Needs `ollama serve` '
         + 'running and the model pulled.',
  },
};

/* Resolve one role ("text" or "vision") into { baseUrl, model, apiKey }.
 *
 * Precedence, highest first:
 *   1. the role's explicit vars   (LLM_API_BASE / LLM_MODEL / LLM_API_KEY)
 *   2. the role's provider name   (LLM_PROVIDER=gemini → registry defaults)
 *   3. for vision only: whatever the text role resolved to
 *
 * Returning empty strings rather than throwing is deliberate: a deploy with no
 * model configured must still serve the site, with chat answering 503. */
function resolve({ providerEnv, baseEnv, modelEnv, keyEnv, role = 'text', env = process.env }) {
  const name = (env[providerEnv] || '').trim().toLowerCase();
  const preset = PROVIDERS[name] || null;

  const baseUrl = (env[baseEnv] || preset?.baseUrl || '').replace(/\/$/, '');
  const model = env[modelEnv] || (role === 'vision' ? preset?.visionModel : preset?.model) || '';
  const apiKey = env[keyEnv] || (preset?.keyEnv ? env[preset.keyEnv] : '') || '';

  return { provider: preset ? name : null, baseUrl, model, apiKey };
}

module.exports = { PROVIDERS, resolve };
