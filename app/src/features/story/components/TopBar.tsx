import { useEffect, useState } from 'react';
import { ArrowUpRight, Download } from 'lucide-react';
import { CONTACT } from '@/shared/data/portfolio';
import { STF_LIVE_URL } from '@/shared/lib/env';
import { lenis } from '@/shared/lib/lenis';
import { CHAPTERS } from '../lib/chapters';
import { useStory } from '../lib/store';
import { useScramble } from '../lib/useScramble';

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** Local time in Paderborn, ticking. Its own component so only it re-renders. */
function Clock() {
  const [now, setNow] = useState(() => clock.format(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(clock.format(new Date())), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{now} CET</span>;
}

/* Header, in two tiers that read as one instrument:
 *
 *   status line  a monospace readout — name decoding in, location, local
 *                time, availability. Folds away once you scroll.
 *   capsule      one glass bar: identity | chapters | actions.
 *
 * It replaces three separate pills that floated unrelated to each other. */
export default function TopBar() {
  const chapter = useStory((s) => s.chapter);
  const motion = useStory((s) => s.motion);
  const name = useScramble('SOHAM PATEL', motion);
  const [folded, setFolded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onScroll = ({ scroll }: { scroll: number }) => setFolded(scroll > 80);
    lenis.on('scroll', onScroll);
    return () => lenis.off('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(CONTACT.email); setCopied(true); }
    catch { window.location.href = `mailto:${CONTACT.email}`; }
  };

  return (
    <header
      className="story-top fixed inset-x-0 top-0 z-[60] transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
      style={{ transform: folded ? 'translateY(-32px)' : 'none' }}
    >
      {/* status line */}
      <div
        className="mono flex h-8 items-center justify-between gap-6 border-b border-[color:var(--line)] px-[var(--gutter)] !text-[10.5px] text-fg3"
        style={{ background: 'color-mix(in oklab, var(--bg) 70%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        <span className="flex items-center gap-4 whitespace-nowrap">
          <span className="text-fg" aria-label="Soham Patel">{name}</span>
          <span className="hidden sm:inline">/ Computer Engineer</span>
        </span>
        <span className="hidden items-center gap-5 whitespace-nowrap md:flex">
          <span>51.7189°N 8.7575°E</span>
          <span>Paderborn, DE</span>
          <Clock />
        </span>
        <button type="button" onClick={copyEmail} className="flex items-center gap-2 whitespace-nowrap hover:text-fg">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
          {copied ? 'Email copied' : 'Open to work'}
        </button>
      </div>

      {/* capsule */}
      <div className="px-[var(--gutter)] pt-3">
        <div className="lg-pill lg-chrome mx-auto flex h-[52px] max-w-[1180px] items-center justify-between gap-3 pl-2 pr-2">
          <a href="#hey" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3">
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-semibold tracking-[-.02em] text-white"
              style={{ background: 'conic-gradient(from 210deg, var(--p), var(--a), var(--s), var(--p))' }}
            >
              SP
            </span>
            <span className="leading-tight">
              <span className="block text-[14px] font-medium tracking-[-.01em]">Soham Patel</span>
              <span className="hidden text-[11.5px] text-fg3 sm:block">M.Sc. Computer Engineering</span>
            </span>
          </a>

          <nav aria-label="Chapters" className="hidden items-center gap-0.5 lg:flex">
            {CHAPTERS.map((c, i) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                aria-current={chapter === i ? 'true' : undefined}
                className={'rounded-full px-3 py-2 text-[13px] transition-colors ' +
                  (chapter === i ? 'bg-[color-mix(in_oklab,var(--fg)_9%,transparent)] text-fg' : 'text-fg2 hover:text-fg')}
              >
                {c.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <a href="/Soham_Patel_CV.pdf" download className="lg-btn !h-10 max-sm:!hidden">
              CV <Download className="h-3.5 w-3.5" />
            </a>
            {STF_LIVE_URL && (
              <a
                href="#lab"
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[color:var(--fg)] px-4 text-[13px] font-medium text-[color:var(--bg)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--a)]" />
                Live twin
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
