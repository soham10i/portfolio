/* Free-tier provider registry.
 *
 * Every provider here speaks the OpenAI /chat/completions wire format, which
 * is the reason this codebase has no vendor SDK: switching provider is an
 * environment change, never a code change.
 *
 * The registry exists to collapse four environment variables into one. Setting
 *
 *     LLM_PROVIDER=groq
 *     GROQ_API_KEY=gsk_...
 *
 * is equivalent to setting LLM_API_BASE and LLM_MODEL by hand, and it means the
 * Render dashboard holds secrets and a provider name rather than URLs that go
 * stale. Explicit LLM_API_BASE / LLM_MODEL always win, so nothing here can trap
 * you: point at a self-hosted vLLM or an Ollama on your desk and the registry
 * steps out of the way.
 *
 * `notes` is not decoration. Free tiers are a moving target and each of these
 * has a specific failure mode that has already cost this project a debugging
 * session; they are recorded so the next person does not rediscover them.
 */

const PROVIDERS = {
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    keyEnv: 'GROQ_API_KEY',
    console: 'https://console.groq.com/keys',
    notes: 'Fastest free inference by a wide margin — the reason it is the default '
         + 'for an interactive chat widget. Quota is token-based per day, not '
         + 'request-based, so a few long answers cost more than many short ones. '
         + 'Model ids are retired with little notice: verify with '
         + 'scripts/probe-providers.sh before trusting one.',
  },

  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    visionModel: 'openrouter/free',
    keyEnv: 'OPENROUTER_API_KEY',
    console: 'https://openrouter.ai/keys',
    notes: 'A rotating pool of :free models behind one auto-routing id, which is '
         + 'exactly what a fallback wants: it survives any single model being '
         + 'retired. The ceiling is low — roughly 50 requests/day until a '
         + 'one-time credit purchase raises it — so it is a second choice, not a '
         + 'primary.',
  },

  nvidia: {
    label: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.1-8b-instruct',
    visionModel: 'meta/llama-3.2-90b-vision-instruct',
    keyEnv: 'NVIDIA_API_KEY',
    console: 'https://build.nvidia.com',
    notes: 'Used here for VISION only. As of Aug 2026 the free-tier text models '
         + 'return 404 or are marked EOL while the vision models still answer, so '
         + 'pointing LLM_PROVIDER at nvidia will disappoint you and pointing '
         + 'LLM_VISION_PROVIDER at it will not.',
  },

  gemini: {
    label: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-flash-lite-latest',
    visionModel: 'gemini-flash-lite-latest',
    keyEnv: 'GEMINI_API_KEY',
    console: 'https://aistudio.google.com/app/apikey',
    notes: 'The most generous request-per-day quota of the four. Note that the '
         + 'model id is a rolling ALIAS, not a version: Google retires dated ids '
         + 'without warning (gemini-2.0-flash-lite now answers 404) and the alias '
         + 'is the only id that survives that. Avoid the reasoning "flash" tiers '
         + 'for chat — measured Aug 2026, gemini-2.5-flash took 16.4s to return '
         + 'one word and returns empty content outright when max_tokens is small, '
         + 'because hidden thinking consumes the budget. flash-lite: 0.65s.',
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
 *   2. the role's provider name   (LLM_PROVIDER=groq → registry defaults)
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
