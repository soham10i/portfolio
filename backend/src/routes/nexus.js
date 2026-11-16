/* NEXUS copilot — a server-side proxy to the governed agent runtime in ../nexus.
 *
 *   GET  /api/nexus/status     configured? reachable? is the token safely scoped?
 *   POST /api/nexus/ask        a question about the packs (NEXUS mode "ask" only)
 *   POST /api/nexus/education  a general health-education question (P9.2 safety layers)
 *   GET  /api/nexus/health     asset health, read-only
 *   GET  /api/nexus/quality    answer-quality aggregates
 *
 * The rules come from nexus/docs/adr/0039-client-api.md:
 *  - The browser never sees the NEXUS token, and never talks to NEXUS.
 *  - The token belongs to an `agent` principal with the `requester` role only.
 *    If NEXUS reports anything more (approver, or a human kind), the proxy
 *    refuses to serve, so a wrongly scoped token fails closed.
 *  - Messages go as mode "ask". The proxy never sends "act", so nothing a
 *    visitor types can plan, propose, approve or execute.
 *  - Dropped sentences come back as problem codes, never their text.
 *
 * All visitors share one NEXUS principal, so each visitor gets an opaque,
 * random conversation handle mapped to a NEXUS session here. A handle cannot be
 * guessed, so one visitor cannot read or continue another visitor's session. */
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { createLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const MAX_TEXT_CHARS = 2000;
const MAX_HANDLES = 5000;
const HANDLE_TTL_MS = 2 * 60 * 60 * 1000;
const SCOPE_CACHE_MS = 60 * 1000;

/* Asking calls a model, so it shares the chat budget; reads are cheaper. */
const askLimit = createLimiter({ ...config.limits.chat, message: 'Too many Nexus questions — try again in a few minutes.' });
const readLimit = createLimiter({ windowMs: 5 * 60 * 1000, max: 120, message: 'Too many requests — try again shortly.' });

class UpstreamError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(method, path, body, { auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth) headers.Authorization = `Bearer ${config.nexus.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${config.nexus.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.nexus.timeoutMs),
      redirect: 'error',
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new UpstreamError(timedOut ? 504 : 503, timedOut ? 'NEXUS_TIMEOUT' : 'NEXUS_UNREACHABLE',
      timedOut ? 'Nexus took too long to answer.' : 'Nexus is not running or cannot be reached.');
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const code = data && data.error && data.error.code ? data.error.code : `HTTP_${res.status}`;
    throw new UpstreamError(res.status, code, (data && data.error && data.error.message) || 'Nexus refused the request.');
  }
  return data;
}

/* ── the token's scope: checked, cached, fail-closed ─────────────────────── */

let scope = { checkedAt: 0, ok: false, problem: null };

async function checkScope({ force = false } = {}) {
  if (!force && scope.checkedAt && Date.now() - scope.checkedAt < SCOPE_CACHE_MS) return scope;
  const me = await call('GET', '/v1/me');
  const roles = Array.isArray(me.roles) ? me.roles : [];
  let problem = null;
  if (me.kind !== 'agent') problem = 'The Nexus token must belong to an agent principal, not a human.';
  else if (roles.length !== 1 || roles[0] !== 'requester') problem = 'The Nexus token must have the requester role only.';
  scope = { checkedAt: Date.now(), ok: !problem, problem };
  if (problem) console.error(`[nexus] refusing to serve: ${problem}`);
  return scope;
}

/* ── visitor handles → NEXUS sessions ────────────────────────────────────── */

const handles = new Map(); // handle -> { session, expires }

function sweep(now) {
  for (const [h, v] of handles) if (v.expires < now) handles.delete(h);
  while (handles.size >= MAX_HANDLES) handles.delete(handles.keys().next().value);
}

async function sessionFor(handle) {
  const now = Date.now();
  const known = typeof handle === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(handle) ? handles.get(handle) : null;
  if (known && known.expires >= now) {
    known.expires = now + HANDLE_TTL_MS;
    return { handle, session: known.session };
  }
  const created = await call('POST', '/v1/sessions', {});
  sweep(now);
  const fresh = crypto.randomBytes(18).toString('base64url');
  handles.set(fresh, { session: created.session_id, expires: now + HANDLE_TTL_MS });
  return { handle: fresh, session: created.session_id };
}

/* ── what may leave the proxy ────────────────────────────────────────────── */

function cleanAnswer(a) {
  if (!a) return null;
  const out = {
    status: a.status,
    sentences: (a.sentences || []).map((s) => ({
      text: s.text,
      cites: (s.cites || []).map((c) => ({ id: c.id, kind: c.kind, ref: c.ref })),
    })),
    uncovered: (a.uncovered || []).map((u) => u.point),
    // The checks did not trust these sentences, so only their problem codes leave.
    dropped: (a.dropped || []).map((d) => String(d.problem || 'DROPPED').split(':')[0]),
  };
  if (a.status === 'abstained' || a.status === 'clarify') out.reason = a.reason || null;
  if (a.status === 'clarify') out.questions = a.questions || [];
  return out;
}

function cleanEducation(r) {
  return {
    verdict: r.verdict,
    redirect: r.redirect || null,
    answer: cleanAnswer(r.answer),
    attributions: r.attributions || [],
    notice: r.notice,
    emergency: r.emergency,
    textVersion: r.text_version,
  };
}

function cleanHealth(h) {
  return {
    checks: (h.checks || []).map((c) => ({
      key: c.key,
      status: c.status,
      read: c.read,
      value: c.value,
      unit: c.unit,
      side: c.side,
      ok: c.ok,
      critical: c.critical,
      outSince: c.out_since,
      outForS: c.out_for_s,
      source: c.source,
      explanation: c.explanation,
    })),
  };
}

/* ── routes ──────────────────────────────────────────────────────────────── */

function send(res, err) {
  if (err instanceof UpstreamError) {
    // 401/403 from NEXUS means this proxy's token is wrong; that is ours to fix, not the visitor's.
    if (err.status === 401 || err.status === 403) {
      console.error(`[nexus] upstream ${err.status} ${err.code}: ${err.message}`);
      return res.status(502).json({ error: 'Nexus is misconfigured on this server.', code: 'NEXUS_AUTH' });
    }
    const status = [400, 404, 422, 503, 504].includes(err.status) ? err.status : 502;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  console.error('[nexus] proxy error:', err && err.message);
  return res.status(500).json({ error: 'Internal server error' });
}

function guard(req, res, next) {
  if (!config.nexus.ready) {
    return res.status(503).json({ error: 'Nexus is not configured on this server.', code: 'NEXUS_NOT_CONFIGURED' });
  }
  checkScope().then((s) => {
    if (!s.ok) return res.status(503).json({ error: 'Nexus is misconfigured on this server.', code: 'NEXUS_SCOPE' });
    next();
  }, (err) => send(res, err));
}

function text(req, res) {
  const t = req.body && typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!t) { res.status(400).json({ error: 'A question is required.' }); return null; }
  if (t.length > MAX_TEXT_CHARS) { res.status(400).json({ error: `Questions are limited to ${MAX_TEXT_CHARS} characters.` }); return null; }
  return t;
}

/* Run against the visitor's session; if NEXUS forgot it (restarted on a fresh
   database), start a new one once. */
async function withSession(handle, fn) {
  let s = await sessionFor(handle);
  try {
    return { handle: s.handle, data: await fn(s.session) };
  } catch (err) {
    if (!(err instanceof UpstreamError) || err.status !== 404) throw err;
    handles.delete(s.handle);
    s = await sessionFor(null);
    return { handle: s.handle, data: await fn(s.session) };
  }
}

router.get('/status', readLimit, async (req, res) => {
  if (!config.nexus.ready) return res.json({ configured: false, reachable: false, ready: false });
  try {
    const health = await call('GET', '/v1/health', undefined, { auth: false });
    const s = await checkScope({ force: true });
    return res.json({ configured: true, reachable: true, ready: s.ok, version: health.version, cloud: config.nexus.cloud, problem: s.problem });
  } catch (err) {
    const reachable = err instanceof UpstreamError && err.code !== 'NEXUS_UNREACHABLE' && err.code !== 'NEXUS_TIMEOUT';
    return res.json({ configured: true, reachable, ready: false, problem: reachable ? 'The Nexus token was refused.' : 'Nexus is not running or cannot be reached.' });
  }
});

router.post('/ask', askLimit, guard, async (req, res) => {
  const t = text(req, res);
  if (t === null) return;
  try {
    const { handle, data } = await withSession(req.body.conversation, (sid) =>
      call('POST', `/v1/sessions/${sid}/messages`, { text: t, mode: 'ask', cloud: config.nexus.cloud }));
    return res.json({ conversation: handle, answer: cleanAnswer(data.answer), executed: false });
  } catch (err) { return send(res, err); }
});

router.post('/education', askLimit, guard, async (req, res) => {
  const t = text(req, res);
  if (t === null) return;
  try {
    const { handle, data } = await withSession(req.body.conversation, (sid) =>
      call('POST', `/v1/sessions/${sid}/education`, { text: t, cloud: config.nexus.cloud }));
    return res.json({ conversation: handle, ...cleanEducation(data) });
  } catch (err) { return send(res, err); }
});

router.get('/health', readLimit, guard, async (req, res) => {
  try { return res.json(cleanHealth(await call('GET', '/v1/assets/health'))); } catch (err) { return send(res, err); }
});

router.get('/quality', readLimit, guard, async (req, res) => {
  try { return res.json(await call('GET', '/v1/quality')); } catch (err) { return send(res, err); }
});

module.exports = router;
module.exports._internal = { cleanAnswer, cleanEducation, cleanHealth, handles, resetScope: () => { scope = { checkedAt: 0, ok: false, problem: null }; } };
