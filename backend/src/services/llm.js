/* One transport for every model call in this codebase.
 *
 * Chat, streaming chat, frame captions, clip summaries and Q&A all go through
 * callLLM, so swapping the backing model is an environment change rather than
 * a code change — which is the whole point of speaking the OpenAI wire format
 * instead of a vendor SDK. */
const config = require('../config');
const { SYSTEM_PROMPT } = require('../prompts/systemPrompt');

const LLM = config.llm;

/* Appended to the system prompt when the visitor is talking by voice.
   Answers should be conversational and concise, with standard markdown links
   and clean notation. A dedicated voice preprocessor handles speech conversion. */
const VOICE_SUFFIX = '\n\n[Voice mode] The visitor is speaking to you. Answer in concise, conversational sentences (around 50–70 words unless they explicitly ask for deep detail). Use standard markdown links [Label](url) for repositories, projects, or profiles, and clean notation for units and formulas. Do NOT spell out phonetic URLs (like "slash" or "dash") — the response is displayed visually in the chat UI while a dedicated audio module handles speech synthesis.';

function buildMessages(message, history, voice = false) {
  return [
    { role: 'system', content: voice ? SYSTEM_PROMPT + VOICE_SUFFIX : SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: message },
  ];
}

async function callLLM({ messages, maxTokens = 1024, temperature = 0.7, stream = false, model = LLM.model, timeoutMs = LLM.timeoutMs, baseUrl = LLM.baseUrl, apiKey = LLM.apiKey }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/* Retry the same request against the fallback providers in sequence when the
   current tier is rate-limited, quota-depleted, or down (429 / 5xx / 402 / 403 / 404).
   Fallback chain (e.g. Mercury -> Gemini -> GLM) ensures zero visitor downtime. */
async function callLLMWithFallback(opts) {
  const tiers = [
    {
      provider: LLM.provider || 'primary',
      label: LLM.label || LLM.provider || 'primary',
      baseUrl: opts.baseUrl || LLM.baseUrl,
      apiKey: opts.apiKey || LLM.apiKey,
      model: opts.model || LLM.model,
    },
    ...(Array.isArray(LLM.fallbacks) && LLM.fallbacks.length > 0
      ? LLM.fallbacks
      : (LLM.fallback ? [LLM.fallback] : [])),
  ].filter((t) => t && t.baseUrl);

  let lastResponse = null;
  let lastError = null;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    try {
      const callOpts = {
        ...opts,
        baseUrl: tier.baseUrl,
        apiKey: tier.apiKey,
        model: (i === 0 && opts.model) ? opts.model : (tier.model || opts.model || LLM.model),
      };

      const res = await callLLM(callOpts);
      if (res.ok) {
        if (i > 0) {
          console.log(`[LLM] Fallback tier ${i} (${tier.label || tier.provider}) succeeded`);
        }
        return res;
      }

      const status = res.status;
      const shouldFallback = status === 429 || status >= 500 || status === 402 || status === 403 || status === 404;
      if (!shouldFallback || i === tiers.length - 1) {
        return res;
      }

      console.warn(`[LLM] Tier ${i} (${tier.label || tier.provider}) answered ${status} — retrying via next fallback...`);
      lastResponse = res;
    } catch (err) {
      lastError = err;
      if (isUnreachable(err) && i < tiers.length - 1) {
        console.warn(`[LLM] Tier ${i} (${tier.label || tier.provider}) unreachable (${err.message}) — retrying via next fallback...`);
        continue;
      }
      if (i === tiers.length - 1) {
        throw err;
      }
    }
  }

  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  return callLLM(opts);
}

function extractText(data) {
  const choice = data?.choices?.[0];
  const c = choice?.message?.content;
  // Some servers return content as an array of parts rather than a string
  const text = typeof c === 'string'
    ? c
    : Array.isArray(c) ? c.map((p) => p?.text || '').join('') : '';
  return { text: text.trim(), finishReason: choice?.finish_reason };
}

function extractDelta(chunk) {
  const d = chunk?.choices?.[0]?.delta?.content;
  return typeof d === 'string' ? d : '';
}

function isUnreachable(err) {
  const code = err?.cause?.code || err?.code || '';
  return err?.name === 'TypeError'
    || ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET'].includes(code);
}

function friendlyError(status) {
  if (status === 429) return 'The AI service is briefly rate-limited. Give it a few seconds and try again.';
  if (status >= 500) return 'The AI service is having a moment. Try again shortly.';
  return 'Could not reach the AI service.';
}

function budgetFor(message, history) {
  const m = message.toLowerCase();
  const words = m.split(/\s+/).filter(Boolean).length;

  const isGreeting = words <= 6 && /^(hi|hii+|hey|hello|yo|sup|good (morning|afternoon|evening)|thanks|thank you|ok|okay|cool|nice|bye)\b/.test(m);
  const wantsDepth = /\b(explain|detail|deep|architecture|how (does|did|do)|compare|versus|vs\.?|walk me through|tell me (more|about|everything)|all (of )?(his|the|soham)|list|breakdown|why|thesis|algorithm|portfolio|projects?)\b/.test(m) || words > 25;
  const isComplexReasoning = /\b(compare|versus|vs\.?|trade-?offs?|best|strongest|rank|which (project|skill)|suited|fit for|why should|evaluate|benchmark|optimize|optimization)\b/.test(m);

  /* Diffusion LLMs (Mercury) and reasoning models generate internal reasoning
     tokens (~50–300 tokens) before answer tokens. We calibrate budgets so reasoning
     never exhausts the token allocation.
     All tiers (Mercury 131k, Gemini 8k, GLM 8k) comfortably handle these limits. */
  if (isGreeting) return { responseTokens: 1024 };
  if (isComplexReasoning) return { responseTokens: 3072 };
  if (wantsDepth) return { responseTokens: 3072 };
  const followUp = history.length > 4 ? 512 : 0;
  return { responseTokens: 1536 + followUp };
}

const UNREACHABLE_MSG = `No model server is answering at ${LLM.baseUrl || '(unset)'}. Start it (e.g. \`ollama serve\`) or point LLM_API_BASE somewhere that is running.`;

/* "Configured" and "answering" are different states, and the UI should show
   the second. Cached briefly so a page full of keyframes does not hammer
   /models on every request. */
let probe = { at: 0, up: false };
async function reachable() {
  if (!LLM.baseUrl) return false;
  if (Date.now() - probe.at < 15_000) return probe.up;
  try {
    const headers = LLM.apiKey ? { Authorization: `Bearer ${LLM.apiKey}` } : {};
    const r = await fetch(`${LLM.baseUrl}/models`, { headers, signal: AbortSignal.timeout(4000) });
    probe = { at: Date.now(), up: r.ok };
  } catch {
    probe = { at: Date.now(), up: false };
  }
  return probe.up;
}

let visionProbe = { at: 0, up: false };
async function reachableVision() {
  if (!LLM.visionBaseUrl) return false;
  if (Date.now() - visionProbe.at < 15_000) return visionProbe.up;
  try {
    const headers = LLM.visionApiKey ? { Authorization: `Bearer ${LLM.visionApiKey}` } : {};
    const r = await fetch(`${LLM.visionBaseUrl}/models`, { headers, signal: AbortSignal.timeout(4000) });
    visionProbe = { at: Date.now(), up: r.ok };
  } catch {
    visionProbe = { at: Date.now(), up: false };
  }
  return visionProbe.up;
}

module.exports = {
  buildMessages, callLLM, callLLMWithFallback, extractText, extractDelta,
  isUnreachable, friendlyError, budgetFor, reachable, reachableVision,
  UNREACHABLE_MSG,
};
