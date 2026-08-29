/* Notes API client.
 *
 * The admin token lives in localStorage on Soham's own browser and is sent as a
 * header on write calls only. It is not a session, not a cookie, and grants
 * nothing beyond editing these Markdown files — which is the whole point of
 * choosing files over an auth system for a personal notes section. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';
const TOKEN_KEY = 'sp-notes-token';

export interface Note {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  tags: string[];
  updated: string | null;
  words: number;
  readingMinutes: number;
  body: string;
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';                       // private mode, or storage blocked
  }
}

export function setToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to do — the editor will simply ask again next time */
  }
}

async function unwrap(r: Response) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export async function checkToken(token: string): Promise<boolean> {
  const r = await fetch(`${API_BASE}/notes/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const d = await r.json().catch(() => ({}));
  return !!d.ok;
}

export async function fetchNote(slug: string): Promise<Note> {
  return unwrap(await fetch(`${API_BASE}/notes/${slug}`));
}

type Draft = Pick<Note, 'title' | 'summary' | 'topic' | 'body'> & { slug: string; tags: string };

export async function createNote(d: Draft): Promise<Note> {
  return unwrap(await fetch(`${API_BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
    body: JSON.stringify(d),
  }));
}

export async function updateNote(slug: string, d: Omit<Draft, 'slug'>): Promise<Note> {
  return unwrap(await fetch(`${API_BASE}/notes/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
    body: JSON.stringify(d),
  }));
}

export async function deleteNote(slug: string): Promise<void> {
  await unwrap(await fetch(`${API_BASE}/notes/${slug}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': getToken() },
  }));
}
