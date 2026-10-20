/* The visitor's JARVIS conversation id.
 *
 * A random UUID kept in localStorage. The backend stores every turn in
 * Supabase under it, and returns the stored turns when the panel reopens, so a
 * conversation survives a reload. The id is the only key to those messages and
 * is never shown; "New chat" simply mints a new one. */

const KEY = 'jarvis-conversation';

export interface StoredMessage { role: 'user' | 'assistant'; content: string }

let memo: string | null = null;

export function conversationId(): string {
  if (memo) return memo;
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return (memo = v);
  } catch { /* storage blocked — fall through to an in-memory id */ }
  return newConversation();
}

export function newConversation(): string {
  memo = crypto.randomUUID();
  try { localStorage.setItem(KEY, memo); } catch { /* in-memory only */ }
  return memo;
}

/** Stored turns for the current conversation; [] when storage is off or empty. */
export async function fetchHistory(apiBase: string): Promise<StoredMessage[]> {
  try {
    const res = await fetch(`${apiBase}/chat/history?conversation=${encodeURIComponent(conversationId())}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.messages)
      ? data.messages.filter((m: StoredMessage) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      : [];
  } catch {
    return [];
  }
}
