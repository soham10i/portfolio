/* Portfolio backend.
 *
 * One Express process serves both the API and the built frontend, which is why
 * there is no CORS to configure in production: the page and its API share an
 * origin. Everything below is wiring — the behaviour lives in src/.
 *
 *   src/config      every environment-derived value, in one place
 *   src/middleware  security headers, rate limiting, admin auth
 *   src/services    llm (one transport), captioner, notesStore
 *   src/routes      chat, contact, scene, notes
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./src/config');
const { securityHeaders } = require('./src/middleware/security');
const { reachable, reachableVision } = require('./src/services/llm');

const app = express();

/* Behind Fly, Render or any reverse proxy, req.ip is the proxy's address
   unless this is set — which would put every visitor in the same rate-limit
   bucket and let one caller lock out the whole site. */
app.set('trust proxy', 1);
app.disable('x-powered-by');           // no need to advertise the stack

app.use(securityHeaders);
app.use(cors({ origin: config.allowedOrigins }));

/* Body limits are per-route, not global. Chat and contact are tiny; only the
   scene route carries base64 keyframes, and only it needs the headroom. */
const smallJson = express.json({ limit: '64kb' });
const notesJson = express.json({ limit: '1mb' });
const sceneJson = express.json({ limit: '3mb' });

/* Health is a deploy-debugging tool, so it reports which provider answered as
   well as whether one is configured. It deliberately names no keys or URLs —
   this endpoint is public. */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: config.llm.ready ? config.llm.model : null,
    provider: config.llm.provider,
    visionModel: config.llm.visionReady ? config.llm.visionModel : null,
    visionProvider: config.llm.visionProvider,
    llm: config.llm.ready,
    visionLlm: config.llm.visionReady,
    fallback: !!config.llm.fallback,
    medqa: config.medqa.enabled,
    scene: !!config.scene.baseUrl,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/chat', smallJson, require('./src/routes/chat'));
app.use('/api/contact', smallJson, require('./src/routes/contact'));
app.use('/api/scene', sceneJson, require('./src/routes/scene'));
app.use('/api/notes', notesJson, require('./src/routes/notes'));
app.use('/api/medqa', smallJson, require('./src/routes/medqa'));

// Unknown API routes → JSON 404, never the SPA shell
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Built frontend, then the SPA fallback for client-side routes
const dist = path.join(__dirname, '../app/dist');
app.use(express.static(dist));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

/* One boot banner that answers "why is the chat not working" without a second
   deploy. Reachability is probed after the listener is up so a slow or dead
   provider delays nothing that serves the site itself. */
const cors_ = config.allowedOrigins;
const server = app.listen(config.port, () => {
  const line = (k, v) => console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\nPortfolio backend listening on :${config.port}  (${config.isProd ? 'production' : 'development'})`);
  line('text', config.llm.ready
    ? `${config.llm.model} via ${config.llm.provider || config.llm.baseUrl}`
    : 'NOT CONFIGURED — set LLM_PROVIDER or LLM_API_BASE; /api/chat will answer 503');
  line('vision', config.llm.visionReady
    ? `${config.llm.visionModel} via ${config.llm.visionProvider || config.llm.visionBaseUrl}`
    : 'not configured');
  line('fallback', config.llm.fallback ? config.llm.fallback.baseUrl : 'none — a 429 from the primary is fatal');
  line('blip', config.scene.baseUrl || 'not configured (SceneLab falls back to the vision model)');
  line('medqa', config.medqa.enabled ? 'enabled (index loads on first request)' : 'disabled');
  line('notes', config.notes.adminToken ? 'editable' : 'read-only (no ADMIN_TOKEN)');
  line('cors', cors_ === true ? 'any origin (development)' : cors_ === false ? 'same-origin only' : cors_.join(', '));

  Promise.all([
    config.llm.ready ? reachable() : null,
    config.llm.visionReady ? reachableVision() : null,
  ]).then(([t, v]) => {
    if (t !== null) line('text reachable', t ? 'yes' : 'NO — the endpoint is not answering');
    if (v !== null) line('vision reachable', v ? 'yes' : 'NO — the endpoint is not answering');
    console.log('');
  }).catch(() => {});
});

/* Render sends SIGTERM on every deploy and when a free instance spins down.
   Closing the listener lets in-flight answers finish instead of being cut
   mid-stream, which a visitor sees as a truncated reply. */
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} received — draining connections`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
