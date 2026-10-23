import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock } from 'lucide-react';
import SectionHead from '../components/SectionHead';
import type { NoteMeta } from '@/features/notes/Notes';

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

/* 07 — Blog. The latest posts (Markdown files served by /api/notes), each a
   row in one reading box; the full list and the reader live at /blog. */
export default function Blog() {
  const [posts, setPosts] = useState<NoteMeta[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    fetch(`${API_BASE}/notes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!dead) setPosts((d.notes ?? []).slice(0, 3)); })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, []);

  return (
    <section id="blog" data-anchor-offset="0" className="chapter panel relative px-[var(--gutter)]"
      style={{ '--t1': 'rgba(37,99,235,.10)', '--t2': 'rgba(14,143,176,.08)' } as React.CSSProperties}>
      <SectionHead no="08" label="Blog" aside={posts ? `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}` : undefined} />

      <div className="mb-[clamp(28px,4vh,48px)] flex flex-wrap items-end justify-between gap-6">
        <h2 data-reveal className="t-h2 max-w-[16ch]">
          Written out <span className="serif text-p">in full.</span>
        </h2>
        <p data-reveal className="content-glass t-body max-w-[42ch]">
          Longer posts from my studies and projects, with every step shown.
        </p>
      </div>

      <div data-reveal className="content-glass content-list">
        {failed && <p className="t-body py-6">Posts could not be loaded right now. <Link to="/blog" className="underline">Open the blog</Link>.</p>}
        {!failed && posts === null && <div className="my-5 h-16 animate-pulse rounded-[12px] bg-[color:var(--surf2)]" />}
        {posts?.map((p) => (
          <Link key={p.slug} to={`/blog/${p.slug}`}
            className="group grid gap-2 border-b border-[color:var(--line)] py-6 last:border-b-0 md:grid-cols-[180px_1fr_auto] md:gap-8">
            <span className="mono pt-1 text-fg3">{p.topic}</span>
            <span>
              <span className="block text-[clamp(19px,1.7vw,23px)] font-medium tracking-[-.015em] text-fg">{p.title}</span>
              {p.summary && <span className="t-body mt-2 line-clamp-2 block max-w-[72ch]">{p.summary}</span>}
            </span>
            <span className="flex items-center gap-3 self-start text-fg3 md:pt-1">
              <span className="mono inline-flex items-center gap-1.5"><Clock className="h-3 w-3" />{p.readingMinutes} min</span>
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Link to="/blog" className="lg-pill inline-flex h-11 items-center gap-2 px-5 text-[14px]">
          All posts <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
