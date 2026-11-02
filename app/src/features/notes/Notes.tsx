import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Clock, Plus, Search } from 'lucide-react';
import '@/features/story/story.css';
import ThemeToggle from '@/features/story/components/ThemeToggle';
import { getToken } from '@/features/notes/lib/notesApi';
import { STATIC_NOTES } from '@/features/notes/lib/staticNotes';

/* Notes index.
 *
 * Deliberately plain: these are study notes, and the index's only job is to get
 * a reader into one quickly. Metadata comes from /api/notes, with static fallback
 * so the list renders immediately on any theme without loading delay. */

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
  const [notes, setNotes] = useState<NoteMeta[]>(STATIC_NOTES);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('All');
  const canEdit = !!getToken();

  useEffect(() => {
    let dead = false;
    fetch(`${API_BASE}/notes`)
      .then((r) => r.json())
      .then((d) => {
        if (!dead && d.notes && d.notes.length > 0) {
          setNotes(d.notes);
        }
      })
      .catch(() => {
        // Keeps STATIC_NOTES intact even if the local API is offline
      });
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
    <div className="story min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[color:var(--line)]" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto flex h-[62px] max-w-[1080px] items-center justify-between gap-4 px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-[14px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Portfolio
          </Link>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-fg3 font-semibold">Blog</p>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link to="/notes/new"
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-[color:var(--line)] px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
                <Plus className="h-3.5 w-3.5" /> New
              </Link>
            )}
            <ThemeToggle className="!h-9 !w-9" placement="down" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-4 sm:px-6 pb-24 pt-12 sm:pt-16">
        <h1 className="t-h2">Blog & Engineering Notes</h1>
        <p className="t-lead mt-4 max-w-[68ch]">
          Longer write-ups from my studies, research, and robotics projects. Derivations are worked through step by step and
          checked on concrete examples with real numbers.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-y border-[color:var(--line)] py-4">
          <label className="lg-panel flex min-w-[240px] flex-1 items-center gap-2.5 px-3.5 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-fg3" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and tags..."
              className="w-full bg-transparent text-[14.5px] sm:text-[15px] text-fg outline-none placeholder:text-fg3"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className={'rounded-full border px-3.5 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.08em] transition-all ' +
                  (topic === t
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-[color:var(--line)] bg-[color:var(--surf2)] text-fg3 hover:text-fg hover:bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]')}
                style={topic === t ? { background: 'var(--p)', color: 'var(--on-fg)' } : undefined}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 && (
          <p className="mt-10 text-[15px] text-fg3">
            {notes.length === 0
              ? 'No posts published yet.'
              : 'Nothing matches that search.'}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-4">
          {shown.map((n) => (
            <Link
              key={n.slug}
              to={`/blog/${n.slug}`}
              className="lg-panel group block p-6 sm:p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--p)_40%,transparent)] shadow-[var(--glass-shadow)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className="mono inline-flex items-center rounded-full px-3 py-1 !text-[12px] font-medium"
                  style={{
                    background: 'color-mix(in oklab, var(--p) 14%, transparent)',
                    color: 'var(--p)',
                    border: '1px solid color-mix(in oklab, var(--p) 25%, transparent)',
                  }}
                >
                  {n.topic}
                </span>
                <span className="mono flex items-center gap-2 text-fg3 !text-[12.5px]">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{n.readingMinutes} min read</span>
                  {n.updated && <span>· {formatDate(n.updated)}</span>}
                </span>
              </div>

              <h2 className="mt-3 text-[22px] sm:text-[24px] font-semibold leading-snug tracking-[-0.015em] text-fg transition-colors group-hover:text-p">
                {n.title}
              </h2>

              {n.summary && (
                <p className="mt-2.5 max-w-[76ch] text-[15px] sm:text-[16px] leading-[1.65] text-fg2 font-normal">
                  {n.summary}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-[13px] text-fg3">
                <div className="flex flex-wrap gap-2">
                  {n.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-[color:var(--line)] bg-[color:var(--surf2)] px-2.5 py-0.5 font-mono text-[11.5px] text-fg3"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1 font-medium text-fg2 group-hover:text-p">
                  Read post
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
