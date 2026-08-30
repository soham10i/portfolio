#!/usr/bin/env node
/* End-to-end smoke test. Runs against any deployment, not just localhost:
 *
 *   node scripts/smoke.js                             # http://localhost:3001
 *   node scripts/smoke.js https://your.onrender.com   # production
 *
 * Exit code is the number of failed checks, so it drops straight into CI.
 *
 * Every check is tagged with what its failure actually means, because "the
 * chat endpoint returned 503" is only useful if you know that 503 there means
 * "no LLM_API_BASE is set" rather than "the provider is down". Checks that
 * depend on optional services (BLIP, MedQA index) report SKIP, not FAIL —
 * a free-tier deploy without them is a valid deploy.
 */
const BASE = (process.argv[2] || process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS) || 90_000;

const PASS = 'PASS', FAIL = 'FAIL', SKIP = 'SKIP';
const results = [];

async function http(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { /* not JSON — fine */ }
  return { res, text, json };
}

function record(name, status, detail) { results.push({ name, status, detail }); }

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const { status = PASS, detail = '' } = (await fn()) || {};
    record(name, status, `${detail} (${Date.now() - t0}ms)`);
  } catch (err) {
    record(name, FAIL, `${err.message} (${Date.now() - t0}ms)`);
  }
}

/* ── Checks ──────────────────────────────────────────────────────────────── */

const checks = [
  ['health', async () => {
    const { res, json } = await http('/api/health');
    if (res.status !== 200) throw new Error(`HTTP ${res.status} — the process is not serving; check the Render logs`);
    if (json?.status !== 'ok') throw new Error('health payload missing status:ok');
    return { detail: `text=${json.model || 'none'} vision=${json.visionModel || 'none'}` };
  }],

  ['spa shell', async () => {
    const { res, text } = await http('/');
    if (res.status !== 200) throw new Error(`HTTP ${res.status} — app/dist was not built or not found`);
    if (!/<div id="root"/.test(text)) throw new Error('index.html served but has no #root — wrong build output');
    return { detail: `${text.length} bytes` };
  }],

  ['spa deep link', async () => {
    const { res } = await http('/project/digital-twin');
    if (res.status !== 200) throw new Error(`HTTP ${res.status} — the SPA fallback route is broken`);
  }],

  ['api 404 is json', async () => {
    const { res, json } = await http('/api/definitely-not-a-route');
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    if (!json?.error) throw new Error('unknown /api routes must return JSON, not the SPA shell');
  }],

  ['video asset', async () => {
    const { res, text } = await http('/videos/maze1.mp4', { method: 'GET', headers: { Range: 'bytes=0-255' } });
    if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    if (text.startsWith('version https://git-lfs')) {
      throw new Error('served a Git LFS POINTER, not video — the build host did not fetch LFS objects');
    }
    return { detail: `${res.headers.get('content-type')}` };
  }],

  ['onnx model asset', async () => {
    const { res } = await http('/models/yolov8n-seg.onnx', { method: 'HEAD' });
    if (res.status !== 200) throw new Error(`HTTP ${res.status} — in-browser detection will not load`);
    return { detail: `${Math.round(Number(res.headers.get('content-length') || 0) / 1e6)} MB` };
  }],

  ['chat', async () => {
    const { res, json } = await http('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'In one sentence, what does Soham build?' }),
    });
    if (res.status === 503) return { status: SKIP, detail: 'no LLM_API_BASE configured' };
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${json?.error || ''}`);
    const answer = json?.response || '';
    if (answer.length < 20) throw new Error(`suspiciously short answer: ${JSON.stringify(answer)}`);
    return { detail: `${answer.length} chars` };
  }],

  ['chat streaming', async () => {
    const res = await fetch(BASE + '/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Name one project.' }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 503) return { status: SKIP, detail: 'no LLM_API_BASE configured' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let deltas = 0, firstByteMs = null;
    const t0 = Date.now();
    for await (const chunk of res.body) {
      if (firstByteMs === null) firstByteMs = Date.now() - t0;
      deltas += (Buffer.from(chunk).toString().match(/"delta"/g) || []).length;
    }
    if (deltas === 0) throw new Error('stream produced no delta frames — the UI would show an empty bubble');
    return { detail: `${deltas} deltas, first token ${firstByteMs}ms` };
  }],

  ['chat rejects oversized input', async () => {
    const { res } = await http('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(5000) }),
    });
    if (res.status !== 400 && res.status !== 503) throw new Error(`expected 400, got ${res.status}`);
  }],

  ['scene status', async () => {
    const { res, json } = await http('/api/scene/status');
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!json.available) return { status: SKIP, detail: json.reason || 'no captioning engine' };
    return { detail: `engine=${json.engine}` };
  }],

  ['medqa status', async () => {
    const { res, json } = await http('/api/medqa/status');
    if (res.status === 503) return { status: SKIP, detail: json?.error || 'index not built' };
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!json.ready) return { status: SKIP, detail: 'index present but not warmed' };
    return { detail: `${json.count} records, ${json.dims}d` };
  }],

  ['security headers', async () => {
    const { res } = await http('/');
    const missing = ['x-content-type-options', 'referrer-policy']
      .filter((h) => !res.headers.get(h));
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    if (res.headers.get('x-powered-by')) throw new Error('x-powered-by is still advertised');
  }],
];

/* ── Runner ──────────────────────────────────────────────────────────────── */

(async () => {
  console.log(`\nSmoke test → ${BASE}\n${'─'.repeat(72)}`);
  for (const [name, fn] of checks) {
    await check(name, fn);
    const r = results[results.length - 1];
    const mark = r.status === PASS ? '\x1b[32m✓\x1b[0m' : r.status === SKIP ? '\x1b[33m–\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${mark} ${r.name.padEnd(28)} ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === FAIL);
  const skipped = results.filter((r) => r.status === SKIP);
  console.log('─'.repeat(72));
  console.log(`${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed\n`);
  process.exit(failed.length);
})();
