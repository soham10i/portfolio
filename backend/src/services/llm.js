/* One transport for every model call in this codebase.
 *
 * Chat, streaming chat, frame captions, clip summaries and Q&A all go through
 * callLLM, so swapping the backing model is an environment change rather than
 * a code change — which is the whole point of speaking the OpenAI wire format
 * instead of a vendor SDK. */
const config = require('../config');
const { SYSTEM_PROMPT } = require('../prompts/systemPrompt');

const LLM = config.llm;

/* Appended to the system prompt when the visitor is talking by voice: the
   reply is read aloud, so markdown and long answers actively hurt. */
const VOICE_SUFFIX = '\n\n[Voice mode] The visitor is speaking to you and will hear your reply read aloud by a speech synthesizer. Answer in plain, conversational sentences — no markdown, no bullet lists, no code blocks, no emojis — and keep it under about 60 words unless they explicitly ask for detail.';

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

/* Retry the same request against the fallback provider when the primary is
   rate-limited or down (429 / 5xx). Anything else — 400, 401 — is a caller
   or config bug that the fallback would reproduce, so it is not retried. */
async function callLLMWithFallback(opts) {
  const primary = await callLLM(opts);
  const fb = LLM.fallback;
  if (primary.ok || !fb || (primary.status !== 429 && primary.status < 500)) return primary;
  console.warn(`LLM primary answered ${primary.status} — retrying via fallback ${fb.baseUrl}`);
  return callLLM({ ...opts, baseUrl: fb.baseUrl, apiKey: fb.apiKey, model: fb.model || opts.model || LLM.model });
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
  const wantsDepth = /\b(explain|detail|deep|architecture|how (does|did|do)|compare|versus|vs\.?|walk me through|tell me (more|about|everything)|all (of )?(his|the|soham)|list|breakdown|why)\b/.test(m) || words > 30;
  const isComplexReasoning = /\b(compare|versus|vs\.?|trade-?offs?|best|strongest|rank|which (project|skill)|suited|fit for|why should|evaluate)\b/.test(m);

  if (isGreeting) return { responseTokens: 256 };
  if (isComplexReasoning) return { responseTokens: 2048 };
  if (wantsDepth) return { responseTokens: 2048 };
  const followUp = history.length > 4 ? 256 : 0; // a bit more room deeper into a conversation
  return { responseTokens: 1024 + followUp };
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
