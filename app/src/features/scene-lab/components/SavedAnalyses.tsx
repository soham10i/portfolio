import { useCallback, useEffect, useState } from 'react';
import { Camera, Database, Film, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { deleteSession, listSessions, type SavedSummary } from '@/features/scene-lab/lib/savedSessions';

/* The visitor's saved analyses, from the database. Text only — reopening one
   restores the timeline, summary, scenario and Q&A, not the video. */
export default function SavedAnalyses({ refreshKey, activeId, onOpen }: {
  refreshKey: number;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const [items, setItems] = useState<SavedSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listSessions()
      .then((s) => { setItems(s); setError(''); })
      .catch((e: Error) => { setItems([]); setError(e.message); });
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  const remove = async (id: string) => {
    setBusy(id);
    try { await deleteSession(id); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <section className="lg-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <p className="mono flex items-center gap-2 text-fg3"><Database className="h-3.5 w-3.5 text-a" /> Saved analyses</p>
        {items && items.length > 0 && <span className="mono !text-[10px] text-fg3">{items.length} saved</span>}
      </div>
      <p className="border-b border-[color:var(--line)] px-5 py-3 text-[13px] leading-relaxed text-fg2">
        Saved only when you press <strong className="text-fg">Save analysis</strong>, and only as text — captions,
        labels, timestamps, the summary and your Q&amp;A. No frame or video is ever stored.
      </p>
      {items === null ? (
        <p className="flex items-center justify-center gap-2 px-5 py-8 text-[13px] text-fg3"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
      ) : error && items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg3">{error}</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg3">Nothing saved yet.</p>
      ) : (
        <ul className="max-h-[340px] overflow-y-auto" data-lenis-prevent>
          {items.map((s) => {
            const top = Object.entries(s.objectCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
            const on = s.id === activeId;
            return (
              <li key={s.id} className="flex items-start gap-3 border-b border-[color:var(--line)] px-5 py-3.5 last:border-b-0"
                style={on ? { background: 'color-mix(in oklab, var(--a) 9%, transparent)' } : undefined}>
                <span className="mt-0.5 flex-none text-fg3">{s.source === 'camera' ? <Camera className="h-4 w-4" /> : <Film className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{s.title}</p>
                  <p className="mono mt-0.5 !text-[9.5px] text-fg3">
                    {new Date(s.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {s.keyframes} keyframes
                    {top.length > 0 && ` · ${top.join(', ')}`}
                  </p>
                  {s.excerpt && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-fg2">{s.excerpt}</p>}
                </div>
                <div className="flex flex-none items-center gap-1">
                  <button type="button" onClick={() => onOpen(s.id)} title="Open"
                    className="grid h-8 w-8 place-items-center rounded-full text-fg2 hover:bg-[color:var(--surf2)] hover:text-fg">
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void remove(s.id)} title="Delete" disabled={busy === s.id}
                    className="grid h-8 w-8 place-items-center rounded-full text-fg2 hover:bg-[color:var(--surf2)] hover:text-[#ef4444] disabled:opacity-40">
                    {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
