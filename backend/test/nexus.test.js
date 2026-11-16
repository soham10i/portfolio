/* The NEXUS proxy (nexus/docs/adr/0039-client-api.md) against a fake NEXUS.
 * The real server.js is spawned, so the mount, the config and the routes are
 * all exercised; only NEXUS itself is faked. */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const TOKEN = 'test-token-not-a-secret';

function fakeNexus({ me = { id: 'proxy', kind: 'agent', roles: ['requester'] } } = {}) {
  const seen = [];
  let sessions = 0;
  const known = new Set();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.url === '/v1/health') return json(200, { ok: true, version: '0.9.3' });
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      if (req.url === '/v1/me') return json(200, { ...me, keys: [] });
      if (req.url === '/v1/sessions' && req.method === 'POST') {
        const id = `00000000-0000-4000-8000-${String(++sessions).padStart(12, '0')}`;
        known.add(id);
        return json(201, { session_id: id });
      }
      const m = req.url.match(/^\/v1\/sessions\/([^/]+)\/(messages|education)$/);
      if (m) {
        if (!known.has(m[1])) return json(404, { error: { code: 'NOT_FOUND', message: 'no such session' } });
        const answer = {
          answer_id: 'a1', status: 'answered', points: 1, uncovered: [], model_calls: 2, mentions: [],
          sentences: [{ text: 'The roof vent closes above 30 C.', cites: [{ id: 'd1', kind: 'doc', ref: 'greenhouse:ops.md#vent' }], point: 1 }],
          dropped: [{ text: 'UNTRUSTED SENTENCE TEXT', cites: ['d9'], problem: 'CRITIC: model wrote this reason' }],
        };
        if (m[2] === 'messages') return json(200, { route: 'ask', requested_mode: 'ask', answer, executed: false });
        return json(200, { verdict: 'general', redirect: null, answer, attributions: ['Doc. NHS, https://www.nhs.uk/x'],
          notice: 'not medical advice', emergency: 'call 999', text_version: 'p9.2.1', executed: false });
      }
      if (req.url === '/v1/assets/health') {
        return json(200, { checks: [{ key: 'greenhouse.humidity_pct', status: 'critical', read: 'fresh', value: 88, unit: 'percent', side: 'high',
          ok: { min: 40, max: 80 }, critical: { min: 20, max: 85 }, out_since: 't', out_for_s: 1, source: 'docs', explanation: 'it is high' }],
        recommended: [{ secret: 'never shown' }], explanations: {} });
      }
      if (req.url.startsWith('/v1/quality')) return json(200, { answers: 3, rates: { answered: 1 } });
      return json(404, { error: { code: 'NOT_FOUND', message: req.url } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}`, seen, known, close: () => server.close() });
  }));
}

async function backend(t, env) {
  const port = 4000 + Math.floor(Math.random() * 900);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', LLM_API_BASE: '', NEXUS_URL: '', NEXUS_TOKEN: '', NEXUS_CLOUD: 'false', ...env },
    stdio: 'ignore',
  });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${base}/api/health`); return base; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('backend did not start');
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('unconfigured: status says so and every route answers 503', async (t) => {
  const base = await backend(t, {});
  assert.deepStrictEqual(await (await fetch(`${base}/api/nexus/status`)).json(), { configured: false, reachable: false, ready: false });
  const res = await post(`${base}/api/nexus/ask`, { text: 'hi' });
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).code, 'NEXUS_NOT_CONFIGURED');
});

test('ask: mode ask only, the token stays server-side, dropped text never leaves', async (t) => {
  const nexus = await fakeNexus();
  t.after(() => nexus.close());
  const base = await backend(t, { NEXUS_URL: nexus.url, NEXUS_TOKEN: TOKEN });

  const status = await (await fetch(`${base}/api/nexus/status`)).json();
  assert.strictEqual(status.ready, true);

  const res = await post(`${base}/api/nexus/ask`, { text: 'When does the vent close?', mode: 'act' });
  assert.strictEqual(res.status, 200);
  const raw = await res.text();
  assert.ok(!raw.includes(TOKEN));
  assert.ok(!raw.includes('UNTRUSTED SENTENCE TEXT'));
  assert.ok(!raw.includes('model wrote this reason'));
  const body = JSON.parse(raw);
  assert.deepStrictEqual(body.answer.dropped, ['CRITIC']);
  assert.strictEqual(body.answer.sentences[0].cites[0].ref, 'greenhouse:ops.md#vent');
  assert.strictEqual(body.executed, false);
  assert.match(body.conversation, /^[A-Za-z0-9_-]{22,64}$/);
  assert.ok(!('answer_id' in body.answer));

  const msg = nexus.seen.find((r) => r.url.endsWith('/messages'));
  assert.strictEqual(msg.body.mode, 'ask'); // the visitor's "act" is ignored
  assert.strictEqual(msg.body.cloud, false);
  assert.strictEqual(msg.auth, `Bearer ${TOKEN}`);

  // the same handle reuses the session; an unknown one gets a fresh session
  await post(`${base}/api/nexus/ask`, { text: 'again', conversation: body.conversation });
  assert.strictEqual(nexus.known.size, 1);
  await post(`${base}/api/nexus/ask`, { text: 'again', conversation: 'A'.repeat(24) });
  assert.strictEqual(nexus.known.size, 2);

  // NEXUS forgot the session (fresh database): the proxy starts a new one once
  nexus.known.clear();
  const again = await post(`${base}/api/nexus/ask`, { text: 'after restart', conversation: body.conversation });
  assert.strictEqual(again.status, 200);
  assert.notStrictEqual((await again.json()).conversation, body.conversation);
});

test('education, health and quality pass through the cleaned shapes', async (t) => {
  const nexus = await fakeNexus();
  t.after(() => nexus.close());
  const base = await backend(t, { NEXUS_URL: nexus.url, NEXUS_TOKEN: TOKEN });

  const edu = await (await post(`${base}/api/nexus/education`, { text: 'How is flu spread?' })).json();
  assert.strictEqual(edu.verdict, 'general');
  assert.strictEqual(edu.notice, 'not medical advice');
  assert.strictEqual(edu.emergency, 'call 999');
  assert.deepStrictEqual(edu.attributions, ['Doc. NHS, https://www.nhs.uk/x']);

  const health = await (await fetch(`${base}/api/nexus/health`)).json();
  assert.strictEqual(health.checks[0].status, 'critical');
  assert.ok(!JSON.stringify(health).includes('never shown'));

  const quality = await (await fetch(`${base}/api/nexus/quality`)).json();
  assert.strictEqual(quality.answers, 3);

  const empty = await post(`${base}/api/nexus/ask`, { text: '   ' });
  assert.strictEqual(empty.status, 400);
  const long = await post(`${base}/api/nexus/ask`, { text: 'x'.repeat(2001) });
  assert.strictEqual(long.status, 400);
});

test('a token with the approver role fails closed', async (t) => {
  const nexus = await fakeNexus({ me: { id: 'soham', kind: 'human', roles: ['approver', 'requester'] } });
  t.after(() => nexus.close());
  const base = await backend(t, { NEXUS_URL: nexus.url, NEXUS_TOKEN: TOKEN });

  const status = await (await fetch(`${base}/api/nexus/status`)).json();
  assert.strictEqual(status.ready, false);
  const res = await post(`${base}/api/nexus/ask`, { text: 'hi' });
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).code, 'NEXUS_SCOPE');
  assert.ok(!nexus.seen.some((r) => r.url.endsWith('/messages')));
});

test('NEXUS down: status reports unreachable, routes answer 503', async (t) => {
  const base = await backend(t, { NEXUS_URL: 'http://127.0.0.1:1', NEXUS_TOKEN: TOKEN });
  const status = await (await fetch(`${base}/api/nexus/status`)).json();
  assert.deepStrictEqual([status.configured, status.reachable, status.ready], [true, false, false]);
  const res = await post(`${base}/api/nexus/ask`, { text: 'hi' });
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).code, 'NEXUS_UNREACHABLE');
});
