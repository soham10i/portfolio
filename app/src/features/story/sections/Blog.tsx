import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock } from 'lucide-react';
import SectionHead from '../components/SectionHead';
import type { NoteMeta } from '@/features/notes/Notes';
import { STATIC_NOTES } from '@/features/notes/lib/staticNotes';

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* 07 — Blog. The latest engineering write-ups and study notes, each rendered
 * in a theme-adaptive liquid-glass panel with clear contrast across all themes. */
export default function Blog() {
  const [posts, setPosts] = useState<NoteMeta[]>(STATIC_NOTES.slice(0, 3));

  useEffect(() => {
    let dead = false;
    fetch(`${API_BASE}/notes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!dead && d.notes && d.notes.length > 0) {
          setPosts(d.notes.slice(0, 3));
        }
      })
      .catch(() => {
        // Retains STATIC_NOTES on network hiccups
      });
    return () => { dead = true; };
  }, []);

  return (
    <section
      id="blog"
      data-anchor-offset="0"
      className="chapter panel relative px-[var(--gutter)]"
      style={{
        '--t1': 'color-mix(in oklab, var(--p) 14%, transparent)',
        '--t2': 'color-mix(in oklab, var(--a) 10%, transparent)',
      } as React.CSSProperties}
    >
      <SectionHead label="Blog" aside={posts ? `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}` : undefined} />

      <div className="mb-[clamp(28px,4vh,48px)] flex flex-col items-center gap-4 text-center">
        <h2 data-reveal className="t-h2 max-w-[16ch]">
          Written out <span className="serif text-p">in full.</span>
        </h2>
        <p data-reveal className="t-body max-w-[56ch]">
          Longer write-ups from my studies, research, and robotics projects, with derivations and every step shown.
        </p>
      </div>

      <div data-reveal className="measure flex flex-col gap-4">
        {posts.map((p) => (
          <Link
            key={p.slug}
            to={`/blog/${p.slug}`}
            className="lg-panel group relative flex flex-col gap-3.5 p-6 sm:p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--p)_40%,transparent)] shadow-[var(--glass-shadow)]"
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
                {p.topic}
              </span>
              <span className="mono flex items-center gap-2 text-fg3 !text-[12.5px]">
                <Clock className="h-3.5 w-3.5" />
                <span>{p.readingMinutes} min read</span>
                {p.updated && <span>· {formatDate(p.updated)}</span>}
              </span>
            </div>

            <div>
              <h3 className="text-[clamp(20px,1.9vw,25px)] font-semibold tracking-[-.018em] text-fg transition-colors group-hover:text-p">
                {p.title}
              </h3>
              {p.summary && (
                <p className="mt-2.5 max-w-[76ch] text-[15px] sm:text-[15.5px] leading-relaxed text-fg2 font-normal">
                  {p.summary}
                </p>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-[13px] text-fg3">
              <div className="flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-[color:var(--line)] bg-[color:var(--surf2)] px-2.5 py-0.5 font-mono text-[11px] text-fg3"
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

      <div className="measure mt-8 flex justify-center">
        <Link to="/blog" className="lg-pill inline-flex h-11 items-center gap-2 px-6 text-[15px] sm:text-[15.5px] font-medium">
          All posts & derivations <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
