/* Typed client for the SceneLab backend.
 *
 * Every call the page makes to /api/scene lives here rather than inline in the
 * component, so the request shape has one definition and the component is
 * about rendering. The streaming ask is the reason this file earns its keep:
 * SSE parsing is fiddly and does not belong in a click handler.
 */
import type { ContactSheet } from './contactSheet';

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

/* ── Session ─────────────────────────────────────────────────────────────── */

export interface SceneSession {
  sessionId: string;
  scenario: string;
  frameCount: number;
  turnCount: number;
  summary: string;
  /** Always true today: the server holds this in memory with a 30-minute TTL
      and loses it on deploy. Surfaced so the UI can say so rather than imply
      the scenario is saved somewhere. */
  ephemeral: boolean;
  expiresInSec: number;
}

export interface LogFrame {
  t: number;
  labels: string[];
  caption?: string;
}

const SESSION_KEY = 'scenelab.sessionId';

export const storedSessionId = () => {
  try { return localStorage.getItem(SESSION_KEY) ?? undefined; } catch { return undefined; }
};
const rememberSession = (id: string) => {
  try { localStorage.setItem(SESSION_KEY, id); } catch { /* private mode */ }
};

export async function fetchSession(id?: string): Promise<SceneSession> {
  const q = id ? `?id=${encodeURIComponent(id)}` : '';
  const r = await fetch(`${API_BASE}/scene/session${q}`);
  if (!r.ok) throw new Error(`session ${r.status}`);
  const d: SceneSession = await r.json();
  rememberSession(d.sessionId);
  return d;
}

export async function saveSession(patch: {
  sessionId?: string;
  scenario?: string;
  frames?: LogFrame[];
  summary?: string;
}): Promise<SceneSession> {
  const r = await fetch(`${API_BASE}/scene/session`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `session ${r.status}`);
  }
  const d: SceneSession = await r.json();
  rememberSession(d.sessionId);
  return d;
}

/* ── Inspection ──────────────────────────────────────────────────────────── */

export interface Inspection {
  systemPrompt: string;
  userText: string;
  log: string;
  logFrames: LogFrame[];
  historyTurns: number;
  image:
    | { present: false }
    | {
        present: true;
        cols: number;
        rows: number;
        frameCount: number;
        timestamps: number[];
        bytes: number;
        width: number;
        height: number;
      };
  approxTokens: number;
  model?: string;
  provider?: string | null;
  /** Always false. No hosted VLM behind an OpenAI-compatible endpoint returns
      attention weights, so the panel shows the exact input instead of a
      heatmap it would have to invent. */
  attentionAvailable?: boolean;
  note?: string;
}

export interface AskPayload {
  question: string;
  sessionId?: string;
  scenario?: string;
  frames: LogFrame[];
  summary?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  contactSheet?: Pick<ContactSheet, 'dataUrl' | 'cols' | 'rows' | 'count' | 'width' | 'height' | 'timestamps'> | null;
}

/** What WOULD be sent, without spending a model call. Powers the inspector. */
export async function inspect(payload: AskPayload): Promise<Inspection> {
  const r = await fetch(`${API_BASE}/scene/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `inspect ${r.status}`);
  return d as Inspection;
}

/* ── Ask, streaming ──────────────────────────────────────────────────────── */

export interface AskHandlers {
  onInspect?: (i: Inspection) => void;
  onDelta?: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: (fullAnswer: string) => void;
  signal?: AbortSignal;
}

/* Streams the answer, falling back to the non-streaming route if the stream
   endpoint is unavailable — a proxy that buffers SSE, or an older deploy.
   Returns the complete answer either way. */
export async function askStream(payload: AskPayload, h: AskHandlers = {}): Promise<string> {
  let answer = '';
  try {
    const r = await fetch(`${API_BASE}/scene/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: h.signal,
    });

    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${r.status}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let ev: { delta?: string; inspect?: Inspection; error?: string; done?: boolean };
        try { ev = JSON.parse(raw); } catch { continue; }
        if (ev.inspect) h.onInspect?.(ev.inspect);
        if (ev.delta) { answer += ev.delta; h.onDelta?.(ev.delta); }
        if (ev.error) h.onError?.(ev.error);
      }
    }
    h.onDone?.(answer);
    return answer;
  } catch (err) {
    if (h.signal?.aborted) return answer;
    // Fall back to the whole-answer route before reporting failure.
    try {
      const r = await fetch(`${API_BASE}/scene/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: h.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.answer) throw new Error(d.error || `HTTP ${r.status}`);
      if (d.inspect) h.onInspect?.(d.inspect);
      h.onDelta?.(d.answer);
      h.onDone?.(d.answer);
      return d.answer as string;
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message
        : err instanceof Error ? err.message : 'Q&A failed';
      h.onError?.(msg);
      return '';
    }
  }
}
