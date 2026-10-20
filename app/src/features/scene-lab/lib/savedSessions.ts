/* Saved SceneLab analyses — the browser half (backend: services/sceneStore.js).
 *
 * Saving is opt-in and text only: timestamps, labels, captions, the summary,
 * the scenario and the Q&A. Thumbnails and video never leave the tab. The
 * visitor's saved list is keyed by a random owner id kept in localStorage. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';
const KEY = 'scenelab-owner';

export interface SavedKeyframe { t: number; labels: string[]; caption: string | null; engine: 'blip' | 'vlm' | 'local' | null; confidence: number | null }
export interface SavedSummary {
  id: string; createdAt: string; title: string; source: 'camera' | 'file';
  durationSec: number | null; keyframes: number; objectCounts: Record<string, number>; excerpt: string;
}
export interface SavedSession {
  id: string; createdAt: string; title: string; source: 'camera' | 'file'; durationSec: number | null;
  scenario: string; summary: string; keyframes: SavedKeyframe[]; qa: { role: 'user' | 'assistant'; content: string }[];
}
export interface SavePayload {
  title: string; source: 'camera' | 'file'; durationSec: number | null; scenario: string; summary: string;
  keyframes: SavedKeyframe[]; qa: { role: 'user' | 'assistant'; content: string }[];
}

let owner: string | null = null;
export function ownerId(): string {
  if (owner) return owner;
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return (owner = v);
  } catch { /* storage blocked */ }
  owner = crypto.randomUUID();
  try { localStorage.setItem(KEY, owner); } catch { /* in-memory only */ }
  return owner;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}/scene/saved${path}`, init);
  if (r.status === 204) return undefined as T;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d as T;
}

export const saveSession = (p: SavePayload) =>
  call<{ id: string; createdAt: string }>('', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...p, clientId: ownerId() }),
  });

export const listSessions = () =>
  call<{ sessions: SavedSummary[] }>(`?client=${ownerId()}`).then((d) => d.sessions);

export const loadSession = (id: string) => call<SavedSession>(`/${id}?client=${ownerId()}`);

export const deleteSession = (id: string) => call<void>(`/${id}?client=${ownerId()}`, { method: 'DELETE' });
