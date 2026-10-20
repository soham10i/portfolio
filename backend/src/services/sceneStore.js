/* Saved SceneLab analyses, in Supabase.
 *
 * Only TEXT is stored, and only when the visitor presses "Save analysis":
 * the per-keyframe timestamp, detected labels and caption, the summary, the
 * scenario and the Q&A. No frame, thumbnail or video byte is ever written —
 * the page's on-device privacy promise holds for saved sessions too.
 *
 * Ownership is a random UUID the browser keeps (client_id). It is the only
 * key to a visitor's saved list; every read and delete is scoped to it.
 * Schema: supabase/migrations/20261021_scene_sessions.sql. */
const { db, isUuid } = require('./supabase');

const LIMITS = { keyframes: 60, qa: 40, caption: 600, summary: 6000, scenario: 600, title: 120, message: 4000 };

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/** Validate and trim a save request; returns { error } or the clean record. */
function clean(body) {
  const b = body || {};
  if (!isUuid(b.clientId)) return { error: 'Invalid client id' };
  const keyframes = (Array.isArray(b.keyframes) ? b.keyframes : []).slice(0, LIMITS.keyframes).map((k) => ({
    t: num(k && k.t) ?? 0,
    labels: (Array.isArray(k && k.labels) ? k.labels : []).filter((l) => typeof l === 'string').slice(0, 10).map((l) => l.slice(0, 40)),
    caption: str(k && k.caption, LIMITS.caption),
    engine: ['blip', 'vlm', 'local'].includes(k && k.engine) ? k.engine : null,
    confidence: num(k && k.confidence),
  }));
  if (!keyframes.length) return { error: 'Nothing to save yet — analyse a clip or camera session first' };
  const qa = (Array.isArray(b.qa) ? b.qa : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-LIMITS.qa)
    .map((m) => ({ role: m.role, content: m.content.slice(0, LIMITS.message) }));
  const counts = {};
  for (const k of keyframes) for (const l of k.labels) counts[l] = (counts[l] || 0) + 1;
  return {
    session: {
      client_id: b.clientId,
      title: str(b.title, LIMITS.title) || 'Untitled analysis',
      source: b.source === 'camera' ? 'camera' : 'file',
      duration_sec: num(b.durationSec),
      scenario: str(b.scenario, LIMITS.scenario),
      summary: str(b.summary, LIMITS.summary),
      object_counts: counts,
      keyframe_count: keyframes.length,
    },
    keyframes,
    qa,
  };
}

async function save(body) {
  const sb = db();
  if (!sb) return { status: 503, error: 'Saving is not configured on this server' };
  const c = clean(body);
  if (c.error) return { status: 400, error: c.error };
  const { data, error } = await sb.from('scene_sessions').insert(c.session).select('id, created_at').single();
  if (error) throw error;
  const id = data.id;
  const { error: kErr } = await sb.from('scene_keyframes').insert(c.keyframes.map((k, i) => ({ ...k, session_id: id, seq: i })));
  if (kErr) throw kErr;
  if (c.qa.length) {
    const { error: qErr } = await sb.from('scene_qa').insert(c.qa.map((m, i) => ({ ...m, session_id: id, seq: i })));
    if (qErr) throw qErr;
  }
  return { status: 201, body: { id, createdAt: data.created_at } };
}

async function list(clientId) {
  const sb = db();
  if (!sb) return { status: 503, error: 'Saving is not configured on this server' };
  if (!isUuid(clientId)) return { status: 400, error: 'Invalid client id' };
  const { data, error } = await sb
    .from('scene_sessions')
    .select('id, created_at, title, source, duration_sec, keyframe_count, object_counts, summary')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return {
    status: 200,
    body: {
      sessions: (data || []).map((s) => ({
        id: s.id, createdAt: s.created_at, title: s.title, source: s.source,
        durationSec: s.duration_sec, keyframes: s.keyframe_count, objectCounts: s.object_counts,
        excerpt: (s.summary || '').slice(0, 160),
      })),
    },
  };
}

async function load(id, clientId) {
  const sb = db();
  if (!sb) return { status: 503, error: 'Saving is not configured on this server' };
  if (!isUuid(id) || !isUuid(clientId)) return { status: 400, error: 'Invalid id' };
  const { data: s, error } = await sb.from('scene_sessions').select('*').eq('id', id).eq('client_id', clientId).maybeSingle();
  if (error) throw error;
  if (!s) return { status: 404, error: 'Not found' };
  const [{ data: kfs, error: kErr }, { data: qa, error: qErr }] = await Promise.all([
    sb.from('scene_keyframes').select('t, labels, caption, engine, confidence').eq('session_id', id).order('seq'),
    sb.from('scene_qa').select('role, content').eq('session_id', id).order('seq'),
  ]);
  if (kErr) throw kErr;
  if (qErr) throw qErr;
  return {
    status: 200,
    body: {
      id: s.id, createdAt: s.created_at, title: s.title, source: s.source, durationSec: s.duration_sec,
      scenario: s.scenario || '', summary: s.summary || '', keyframes: kfs || [], qa: qa || [],
    },
  };
}

async function remove(id, clientId) {
  const sb = db();
  if (!sb) return { status: 503, error: 'Saving is not configured on this server' };
  if (!isUuid(id) || !isUuid(clientId)) return { status: 400, error: 'Invalid id' };
  const { error, count } = await sb.from('scene_sessions').delete({ count: 'exact' }).eq('id', id).eq('client_id', clientId);
  if (error) throw error;
  return count ? { status: 204 } : { status: 404, error: 'Not found' };
}

module.exports = { save, list, load, remove, LIMITS };
