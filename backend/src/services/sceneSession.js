/* Ephemeral scenario state for SceneLab.
 *
 * ── What this stores, and what it deliberately does not ──────────────────────
 * TEXT ONLY: the visitor's stated scenario, the keyframe log (timestamps,
 * detector labels, model captions) and the Q&A turns. Never an image, never a
 * frame, never a thumbnail. The page's privacy claim is that camera and clip
 * pixels do not leave the device except as transient captioning requests that
 * are not retained, and that claim has to survive this file existing.
 *
 * Everything lives in one process-local Map with a TTL. There is no database
 * and no disk, so a deploy or a free-instance spin-down loses every session —
 * which is the correct behaviour for demo state, and is stated in the API
 * response (`ephemeral: true`) rather than left for someone to discover.
 *
 * Sessions are client-identified. The id is opaque and unguessable, generated
 * by the server, and grants access to nothing but the text the same visitor
 * put in — there is no account, no cross-user data, and nothing worth stealing.
 */
const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;          // 30 minutes idle
const MAX_SESSIONS = 500;               // hard ceiling; oldest evicted first
const MAX_SCENARIO_CHARS = 600;
const MAX_LOG_FRAMES = 80;
const MAX_TURNS = 20;

const sessions = new Map();             // id → { scenario, frames, turns, createdAt, touchedAt }

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of sessions) if (s.touchedAt < cutoff) sessions.delete(id);

  /* A Map iterates in insertion order, and `touch` re-inserts, so the first
     entries are always the least recently used. */
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

/* Re-inserting on every access is what makes the Map an LRU. */
function touch(id, s) {
  s.touchedAt = Date.now();
  sessions.delete(id);
  sessions.set(id, s);
}

function create() {
  sweep();
  const id = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  sessions.set(id, { scenario: '', frames: [], turns: [], createdAt: now, touchedAt: now });
  return id;
}

function get(id) {
  if (typeof id !== 'string' || !id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.touchedAt > TTL_MS) { sessions.delete(id); return null; }
  touch(id, s);
  return s;
}

/* Accept a session id from the client, or mint one. Returning the id the
   caller should use from here on keeps the client from having to guess
   whether its id survived a server restart. */
function resolve(id) {
  const existing = get(id);
  if (existing) return { id, session: existing };
  const fresh = create();
  return { id: fresh, session: sessions.get(fresh) };
}

/* Frames arrive as the client's keyframe log. Only the four text fields are
   kept; anything else on the object — notably `thumb`, the data URI — is
   dropped here rather than trusted not to be sent. */
function sanitiseFrames(frames) {
  if (!Array.isArray(frames)) return [];
  return frames.slice(0, MAX_LOG_FRAMES).map((f) => ({
    t: Number.isFinite(Number(f?.t)) ? Number(f.t) : null,
    labels: Array.isArray(f?.labels) ? f.labels.filter((l) => typeof l === 'string').slice(0, 12) : [],
    caption: typeof f?.caption === 'string' ? f.caption.slice(0, 400) : '',
    engine: ['blip', 'vlm', 'local'].includes(f?.engine) ? f.engine : undefined,
  }));
}

function update(id, patch) {
  const { id: sid, session } = resolve(id);
  if (typeof patch.scenario === 'string') {
    session.scenario = patch.scenario.trim().slice(0, MAX_SCENARIO_CHARS);
  }
  if (patch.frames !== undefined) session.frames = sanitiseFrames(patch.frames);
  if (typeof patch.summary === 'string') session.summary = patch.summary.slice(0, 4000);
  touch(sid, session);
  return { id: sid, session };
}

function addTurn(id, role, content) {
  const s = get(id);
  if (!s) return;
  s.turns.push({ role: role === 'assistant' ? 'assistant' : 'user', content: String(content).slice(0, 4000) });
  if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS);
}

/* The client-facing shape. `ephemeral` is part of the contract, not a comment:
   a UI that knows this is in-memory can say so instead of implying durability. */
function toPublic(id, s) {
  return {
    sessionId: id,
    scenario: s.scenario,
    frameCount: s.frames.length,
    turnCount: s.turns.length,
    summary: s.summary || '',
    ephemeral: true,
    expiresInSec: Math.max(0, Math.round((s.touchedAt + TTL_MS - Date.now()) / 1000)),
  };
}

const stats = () => ({ sessions: sessions.size, ttlMinutes: TTL_MS / 60000 });

module.exports = {
  create, get, resolve, update, addTurn, toPublic, stats,
  MAX_SCENARIO_CHARS, MAX_LOG_FRAMES,
};
