import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Pencil } from 'lucide-react';
import PaletteMenu from '@/shared/components/PaletteMenu';
import { PALETTES, applyPalette, readStoredPalette, storePalette, type PaletteKey } from '@/shared/lib/palettes';
import { fetchNote, getToken, type Note } from '@/features/notes/lib/notesApi';
import { outline, renderNote, type Heading } from '@/features/notes/lib/noteRender';

/* One note.
 *
 * The body is Markdown with LaTeX, rendered client-side (see lib/noteRender).
 * The rendered HTML is inserted with dangerouslySetInnerHTML on purpose: notes
 * carry inline SVG figures, and only a holder of ADMIN_TOKEN can write one, so
 * the author and the trust boundary are the same person. */

export default function NoteView() {
  const { slug = '' } = useParams();
  const [palette, setPalette] = useState<PaletteKey>(readStoredPalette);
  useEffect(() => { applyPalette(palette); }, [palette]);
  const accent = PALETTES[palette].a;
  const pickPalette = (k: PaletteKey) => { setPalette(k); storePalette(k); };

  /* One state object keyed by slug, rather than four independent pieces reset
     at the top of the effect. Navigating between notes then swaps the whole
     record in a single update, and nothing has to be cleared synchronously. */
  const [loaded, setLoaded] = useState<{ slug: string; note: Note | null; html: string; error: string }>(
    { slug: '', note: null, html: '', error: '' },
  );
  const fresh = loaded.slug === slug;
  const note = fresh ? loaded.note : null;
  const html = fresh ? loaded.html : '';
  const error = fresh ? loaded.error : '';
  const [active, setActive] = useState('');
  const article = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const canEdit = !!getToken();

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const n = await fetchNote(slug);
        let body = '';
        let err = '';
        try {
          body = await renderNote(n.body);
        } catch {
          err = 'The maths renderer could not load, so this note cannot be displayed.';
        }
        if (!dead) setLoaded({ slug, note: n, html: body, error: err });
      } catch (e) {
        if (!dead) {
          setLoaded({ slug, note: null, html: '', error: e instanceof Error ? e.message : 'Could not load this note.' });
        }
      }
    })();
    return () => { dead = true; };
  }, [slug]);

  const headings: Heading[] = useMemo(() => (note ? outline(note.body) : []), [note]);

  /* Scrolling.
   *
   * The first version called setState on every scroll event and read
   * getBoundingClientRect() from every heading inside the handler. On a note
   * with ~1,500 KaTeX nodes that is two React renders plus a forced synchronous
   * layout per event, which is exactly the stutter you feel.
   *
   * This version reads no geometry while scrolling at all. Heading offsets are
   * measured once after the article renders and cached as plain numbers; a
   * single requestAnimationFrame callback per painted frame compares
   * window.scrollY against that array, writes the progress bar's transform
   * directly to the DOM, and touches React state only when the current section
   * actually changes — a handful of times per note rather than sixty a second.
   *
   * (An IntersectionObserver was the obvious alternative, and it is wrong here:
   * it reports crossings, so a jump that skips over a heading — a click on the
   * table of contents, a PgDn — never fires and the highlight sticks.) */
  useEffect(() => {
    if (!html) return;
    const el = article.current;
    if (!el) return;

    let queued = false;
    let top = 0;
    let span = 1;
    let marks: { id: string; y: number }[] = [];
    let lastIdx = -2;

    const measure = () => {
      top = el.offsetTop;
      span = Math.max(1, el.offsetHeight - window.innerHeight * 0.6);
      marks = Array.from(el.querySelectorAll<HTMLElement>('h2, h3'))
        .map((h) => ({ id: h.id, y: h.getBoundingClientRect().top + window.scrollY }));
    };

    const paint = () => {
      queued = false;
      const y = window.scrollY;
      if (bar.current) {
        const p = Math.min(1, Math.max(0, (y - top + 120) / span));
        bar.current.style.transform = `scaleX(${p})`;
      }
      // last heading whose top has passed the reading line, by cached numbers
      let idx = -1;
      for (let i = 0; i < marks.length; i++) {
        if (marks[i].y - 150 <= y) idx = i; else break;
      }
      if (idx !== lastIdx) {
        lastIdx = idx;
        setActive(idx === -1 ? '' : marks[idx].id);
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };
    const onResize = () => { measure(); onScroll(); };

    measure();
    paint();
    /* KaTeX and the web fonts settle a beat after the HTML lands, and every
       heading below them moves when they do. Re-measure once they have. */
    const settle = window.setTimeout(onResize, 600);
    const settle2 = window.setTimeout(onResize, 1800);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(settle2);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [html]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Opaque, not frosted. A backdrop-filter on a sticky bar forces the
          compositor to re-blur that strip on every frame of every scroll, and
          over a note this long it is the single biggest source of stutter. */}
      <header className="sticky top-0 z-40 border-b border-line" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto flex h-[62px] max-w-[1180px] items-center justify-between gap-4 px-6">
          <Link to="/notes" className="inline-flex items-center gap-2 text-[13px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Notes
          </Link>
          <p className="hidden truncate font-mono text-[10px] uppercase tracking-[0.15em] text-fg3 sm:block">
            {note?.topic ?? ''}
          </p>
          <div className="flex items-center gap-2">
            {canEdit && note && (
              <Link to={`/notes/${slug}/edit`}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
                <Pencil className="h-3 w-3" /> Edit
              </Link>
            )}
            <PaletteMenu palette={palette} onPalette={pickPalette} compact />
          </div>
        </div>
        {/* transform, not width: a scaleX runs on the compositor and never
            triggers layout. No CSS transition — it is already frame-accurate. */}
        <div className="h-[2px] w-full overflow-hidden">
          <div ref={bar} className="h-full w-full origin-left"
            style={{ transform: 'scaleX(0)', background: accent }} />
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-[720px] px-6 pt-20">
          <p className="text-[15px] text-[#f87171]">{error}</p>
          <Link to="/notes" className="mt-4 inline-block text-[14px] text-fg2 underline">Back to the index</Link>
        </div>
      )}

      {!note && !error && (
        <div className="mx-auto max-w-[720px] space-y-4 px-6 pt-24">
          <div className="h-9 w-3/4 animate-pulse rounded bg-surf2" />
          <div className="h-4 w-full animate-pulse rounded bg-surf2" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-surf2" />
        </div>
      )}

      {note && (
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-12 px-6 pb-32 pt-16 lg:grid-cols-[minmax(0,1fr)_216px]">
          <div className="mx-auto w-full max-w-[720px]">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.15em]" style={{ color: accent }}>
              {note.topic}
            </p>
            <h1 className="mt-3 text-[34px] font-semibold leading-[1.14] tracking-[-0.03em] sm:text-[42px]">
              {note.title}
            </h1>
            {note.summary && (
              <p className="mt-5 max-w-[62ch] text-[17px] leading-[1.68] text-fg2">{note.summary}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-6 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg3">
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" />{note.readingMinutes} min read</span>
              <span>{note.words.toLocaleString()} words</span>
              {note.tags.map((t) => <span key={t} className="normal-case tracking-normal">#{t}</span>)}
            </div>

            {/* The note body is authored by the ADMIN_TOKEN holder and carries
                inline SVG figures, so it is inserted as HTML on purpose. */}
            <article ref={article} className="note-prose mt-10"
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>

          {headings.length > 2 && (
            <nav className="hidden lg:block">
              <div className="sticky top-[96px]">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-fg3">Contents</p>
                <ul className="mt-3 space-y-1.5 border-l border-line">
                  {headings.map((h) => {
                    const on = active === h.id;
                    return (
                      <li key={h.id + h.text}>
                        <a href={`#${h.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className={'-ml-px block border-l py-[3px] text-[12.5px] leading-snug transition-colors ' +
                            (h.level === 3 ? 'pl-[18px] ' : 'pl-3 ') +
                            (on ? 'text-fg' : 'border-transparent text-fg3 hover:text-fg2')}
                          style={on ? { borderColor: accent } : undefined}>
                          {h.text}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}