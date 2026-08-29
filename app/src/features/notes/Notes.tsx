import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Plus, Search } from 'lucide-react';
import { PALETTES, applyPalette, readStoredPalette, storePalette, type PaletteKey } from '@/shared/lib/palettes';
import PaletteMenu from '@/shared/components/PaletteMenu';
import { getToken } from '@/features/notes/lib/notesApi';

/* Notes index.
 *
 * Deliberately plain: these are study notes, and the index's only job is to get
 * a reader into one quickly. Metadata comes from /api/notes, which reads the
 * frontmatter of each Markdown file on disk — no database. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

export interface NoteMeta {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  tags: string[];
  updated: string | null;
  words: number;
  readingMinutes: number;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Notes() {
  const [palette, setPalette] = useState<PaletteKey>(readStoredPalette);
  useEffect(() => { applyPalette(palette); }, [palette]);
  const accent = PALETTES[palette].a;
  const pickPalette = (k: PaletteKey) => { setPalette(k); storePalette(k); };

  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('All');
  const canEdit = !!getToken();

  useEffect(() => {
    let dead = false;
    fetch(`${API_BASE}/notes`)
      .then((r) => r.json())
      .then((d) => { if (!dead) setNotes(d.notes ?? []); })
      .catch(() => { if (!dead) setError('Could not load the notes index.'); });
    return () => { dead = true; };
  }, []);

  const topics = useMemo(() => {
    const set = new Set((notes ?? []).map((n) => n.topic).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [notes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (topic !== 'All' && n.topic !== topic) return false;
      if (!q) return true;
      return `${n.title} ${n.summary} ${n.tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [notes, query, topic]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-line" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto flex h-[62px] max-w-[1080px] items-center justify-between gap-4 px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-[13px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Portfolio
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg3">Study notes</p>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link to="/notes/new"
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
                <Plus className="h-3.5 w-3.5" /> New
              </Link>
            )}
            <PaletteMenu palette={palette} onPalette={pickPalette} compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-6 pb-24 pt-14">
        <h1 className="max-w-[22ch] text-[38px] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[46px]">
          Working through the maths
        </h1>
        <p className="mt-5 max-w-[62ch] text-[16.5px] leading-[1.7] text-fg2">
          Derivations written out in full while studying — every step shown, and each one
          followed through on a worked example with real numbers. These are the notes I
          keep for myself; they are here because a derivation you can follow is better
          evidence of understanding than a line on a CV.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3 border-y border-line py-3.5">
          <label className="flex min-w-[210px] flex-1 items-center gap-2.5">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-fg3" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and tags"
              className="w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg3"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button key={t} type="button" onClick={() => setTopic(t)}
                className={'rounded-[8px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ' +
                  (topic === t ? 'border-[color-mix(in_oklab,var(--a)_50%,transparent)] text-fg' : 'border-line text-fg3 hover:text-fg2')}
                style={topic === t ? { background: 'color-mix(in oklab,var(--a) 12%,transparent)' } : undefined}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-10 text-[14px] text-[#f87171]">{error}</p>}

        {notes === null && !error && (
          <div className="mt-10 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[86px] animate-pulse rounded-[14px] border border-line bg-surf2" />
            ))}
          </div>
        )}

        {notes !== null && shown.length === 0 && (
          <p className="mt-10 text-[14.5px] text-fg3">
            {notes.length === 0
              ? 'No notes published yet.'
              : 'Nothing matches that search.'}
          </p>
        )}

        <ul className="mt-4">
          {shown.map((n) => (
            <li key={n.slug}>
              <Link to={`/notes/${n.slug}`}
                className="group block border-b border-line py-7 transition-colors hover:bg-surf2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.13em]" style={{ color: accent }}>
                    {n.topic}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg3">
                    <Clock className="h-3 w-3" />{n.readingMinutes} min
                  </span>
                  {n.updated && <span className="font-mono text-[10px] text-fg3">{formatDate(n.updated)}</span>}
                </div>
                <h2 className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.015em] text-fg transition-colors group-hover:text-[color:var(--p)]">
                  {n.title}
                </h2>
                {n.summary && (
                  <p className="mt-2 max-w-[70ch] text-[15px] leading-[1.65] text-fg2">{n.summary}</p>
                )}
                {n.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {n.tags.map((t) => (
                      <span key={t} className="rounded-[7px] border border-line px-2 py-0.5 font-mono text-[10px] text-fg3">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
