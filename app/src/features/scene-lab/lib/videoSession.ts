/* The session video library.
 *
 * There is no upload. A visitor's clip is held as a Blob in this tab's memory
 * and addressed through an object URL; it is never sent anywhere, never
 * written to disk, and never reaches the server — only sampled keyframes do,
 * and only while narration is on.
 *
 * That is a deliberate design choice, not a limitation. A server-side store
 * would mean an upload path, a retention policy, a cleanup job, a bucket to
 * secure and a promise about deletion that a visitor would have to take on
 * trust. Keeping the bytes in the tab makes the privacy claim structural: when
 * the tab closes, the data is gone because there is nowhere else it could be.
 *
 * `revoke()` releases the object URL, which drops the browser's last reference
 * to the Blob and makes it collectable — so "remove" here really does free the
 * memory rather than just hiding a row. */

export interface SessionVideo {
  id: string;
  name: string;
  bytes: number;
  durationSec: number;
  width: number;
  height: number;
  addedAt: number;
  url: string;
  keyframes: number;
  captioned: number;
  summarised: boolean;
  /** camera sessions have no file behind them */
  kind: 'file' | 'camera';
}

let seq = 0;
const items: SessionVideo[] = [];
const listeners = new Set<(v: SessionVideo[]) => void>();

const emit = () => { for (const fn of listeners) fn([...items]); };

export function subscribe(fn: (v: SessionVideo[]) => void) {
  listeners.add(fn);
  fn([...items]);
  return () => { listeners.delete(fn); };
}

export function add(v: Omit<SessionVideo, 'id' | 'addedAt' | 'keyframes' | 'captioned' | 'summarised'>): SessionVideo {
  const item: SessionVideo = {
    ...v,
    id: `v${++seq}`,
    addedAt: Date.now(),
    keyframes: 0,
    captioned: 0,
    summarised: false,
  };
  items.unshift(item);
  emit();
  return item;
}

export function update(id: string, patch: Partial<SessionVideo>) {
  const i = items.findIndex((x) => x.id === id);
  if (i === -1) return;
  items[i] = { ...items[i], ...patch };
  emit();
}

/** Drop one clip and release its memory. */
export function remove(id: string) {
  const i = items.findIndex((x) => x.id === id);
  if (i === -1) return;
  if (items[i].url) URL.revokeObjectURL(items[i].url);
  items.splice(i, 1);
  emit();
}

export function clear() {
  for (const v of items) if (v.url) URL.revokeObjectURL(v.url);
  items.length = 0;
  emit();
}

export const get = (id: string) => items.find((x) => x.id === id);
export const totalBytes = () => items.reduce((n, v) => n + v.bytes, 0);

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(s: number) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/* Releasing on unload is belt-and-braces: the browser frees everything when
   the tab dies anyway. It is here so that a reload during a long session does
   not leave object URLs pinned in the old document. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', clear);
}
