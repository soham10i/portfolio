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
const { reachable } = require('./src/services/llm');

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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    model: config.llm.ready ? config.llm.model : null,
    visionModel: config.llm.ready ? config.llm.visionModel : null,
    llm: config.llm.ready,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/chat', smallJson, require('./src/routes/chat'));
app.use('/api/contact', smallJson, require('./src/routes/contact'));
app.use('/api/scene', sceneJson, require('./src/routes/scene'));
app.use('/api/notes', notesJson, require('./src/routes/notes'));
app.use('/api/medqa', smallJson, require('./src/routes/medqa'));
app.use('/api/contact', smallJson, require('./src/routes/contact'));
app.use('/api/scene', sceneJson, require('./src/routes/scene'));
app.use('/api/notes', notesJson, require('./src/routes/notes'));

// Unknown API routes → JSON 404, never the SPA shell
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Built frontend, then the SPA fallback for client-side routes
const dist = path.join(__dirname, '../app/dist');
app.use(express.static(dist));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(config.port, async () => {
  console.log(`🚀 Portfolio backend on http://localhost:${config.port}`);
  console.log(`🤖 LLM endpoint: ${config.llm.baseUrl || 'MISSING — set LLM_API_BASE in .env'}`);
  console.log(`🧠 Text: ${config.llm.model}   Vision: ${config.llm.visionModel}`);
  console.log(`🖼️  BLIP service: ${config.scene.baseUrl || 'not configured'}`);
  console.log(`📝 Notes editing: ${config.notes.adminToken ? 'enabled' : 'read-only (no ADMIN_TOKEN)'}`);
  console.log(`🌐 CORS: ${config.allowedOrigins === true ? 'any origin (dev)' : config.allowedOrigins === false ? 'same-origin only' : config.allowedOrigins.join(', ')}`);
  if (config.llm.ready) console.log(`🔌 Model server reachable: ${await reachable()}`);
});
