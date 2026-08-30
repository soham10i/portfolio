/* JARVIS — the portfolio assistant.
 *
 * Two endpoints for one job: /stream relays the model's SSE frames so tokens
 * appear as they generate (what the UI uses), and the plain POST returns a
 * whole answer (far easier to curl when something is wrong).
 *
 * Both accept `voice: true` when the visitor is talking by voice — the system
 * prompt then steers the model toward short, speakable prose. Model calls go
 * through callLLMWithFallback: if the primary provider answers 429/5xx (free
 * tiers rate-limit hard), the configured fallback provider takes over. */
const express = require('express');
const config = require('../config');
const { createLimiter } = require('../middleware/rateLimit');
const {
  buildMessages, callLLMWithFallback, extractText, extractDelta,
  isUnreachable, friendlyError, budgetFor, UNREACHABLE_MSG,
} = require('../services/llm');

const router = express.Router();
const limit = createLimiter({
  ...config.limits.chat,
  message: 'Easy there — JARVIS needs a breather. Try again in a few minutes.',
});

const NOT_CONFIGURED = 'Chat is not configured — the backend has no LLM_API_BASE pointing at a model server.';

function validate(req) {
  const { message, history = [], voice = false } = req.body || {};
  const { maxMessageChars, maxHistoryMessages } = config.limits;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { error: 'Message is required' };
  }
  if (message.length > maxMessageChars) {
    return { error: `Message too long (max ${maxMessageChars} characters)` };
  }
  const cleanHistory = (Array.isArray(history) ? history : [])
    .filter((h) => h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'assistant'))
    .slice(-maxHistoryMessages)
    .map((h) => ({ role: h.role, content: h.content.slice(0, maxMessageChars) }));
  return { message: message.trim(), history: cleanHistory, voice: voice === true };
}

router.post('/', limit, async (req, res) => {
  if (!config.llm.ready) return res.status(503).json({ error: NOT_CONFIGURED });
  const parsed = validate(req);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const budget = budgetFor(parsed.message, parsed.history);
    const messages = buildMessages(parsed.message, parsed.history, parsed.voice);
    let response = await callLLMWithFallback({ messages, maxTokens: budget.responseTokens });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('LLM error:', response.status, err?.error?.message || '');
      return res.status(502).json({ error: friendlyError(response.status) });
    }

    let { text, finishReason } = extractText(await response.json());

    /* A reasoning model can spend the whole cap on its own preamble and return
       nothing usable. One retry with a much larger cap, rather than failing. */
    if (!text && finishReason === 'length') {
      response = await callLLMWithFallback({ messages, maxTokens: 4096 });
      if (response.ok) ({ text } = extractText(await response.json()));
    }

    if (!text) return res.status(502).json({ error: 'The AI returned an empty response. Try rephrasing?' });
    res.json({ response: text });
  } catch (err) {
    console.error('Chat error:', err.message || err);
    if (isUnreachable(err)) return res.status(503).json({ error: UNREACHABLE_MSG });
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'That took too long — try again.' : 'Internal server error',
    });
  }
});

router.post('/stream', limit, async (req, res) => {
  if (!config.llm.ready) return res.status(503).json({ error: NOT_CONFIGURED });
  const parsed = validate(req);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const budget = budgetFor(parsed.message, parsed.history);
    const upstream = await callLLMWithFallback({
      messages: buildMessages(parsed.message, parsed.history, parsed.voice),
      maxTokens: budget.responseTokens,
      stream: true,
    });

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.json().catch(() => ({}));
      console.error('LLM stream error:', upstream.status, err?.error?.message || '');
      return res.status(502).json({ error: friendlyError(upstream.status) });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sentAny = false;
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenAI SSE frames: lines of "data: {json}", terminated by "data: [DONE]"
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const text = extractDelta(JSON.parse(payload));
          if (text) { sentAny = true; send({ delta: text }); }
        } catch {
          // partial JSON across chunk boundaries — rare with line-based SSE
        }
      }
    }

    if (!sentAny) send({ error: 'The AI returned an empty response. Try rephrasing?' });
    send({ done: true });
    res.end();
  } catch (err) {
    console.error('Stream error:', err.message || err);
    if (!res.headersSent) {
      if (isUnreachable(err)) return res.status(503).json({ error: UNREACHABLE_MSG });
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      res.status(timedOut ? 504 : 500).json({
        error: timedOut ? 'That took too long — try again.' : 'Internal server error',
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted — try again.' })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
