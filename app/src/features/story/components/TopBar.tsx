import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { CONTACT } from '@/shared/data/portfolio';
import { lenis } from '@/shared/lib/lenis';
import { CHAPTERS } from '../lib/chapters';
import { useStory } from '../lib/store';
import { useScramble } from '../lib/useScramble';

/* The visitor's place, looked up from their IP (GeoJS, no key, CORS-open).
   The IP changes without a reload when a VPN connects or drops, so the lookup
   runs again whenever the network changes, the tab comes back into view, and
   every minute while it is visible. Paderborn is shown until the first answer;
   a failed lookup keeps whatever was shown last. */
type Place = { lat: number; lon: number; label: string; tz: string };
const HOME: Place = { lat: 51.7189, lon: 8.7575, label: 'Paderborn, DE', tz: 'Europe/Berlin' };
const RECHECK_MS = 60_000;

async function visitorPlace(): Promise<Place | null> {
  try {
    const r = await fetch('https://get.geojs.io/v1/ip/geo.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const g = await r.json();
    const lat = Number(g.latitude), lon = Number(g.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const tz = g.timezone && Intl.supportedValuesOf?.('timeZone').includes(g.timezone) ? g.timezone : HOME.tz;
    return { lat, lon, tz, label: [g.city || g.region || g.country, g.country_code].filter(Boolean).join(', ') };
  } catch {
    return null;
  }
}

function usePlace() {
  const [place, setPlace] = useState(HOME);
  useEffect(() => {
    let live = true;
    let busy = false;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      const p = await visitorPlace();
      busy = false;
      if (live && p) setPlace((old) => (old.lat === p.lat && old.lon === p.lon && old.tz === p.tz ? old : p));
    };
    // A VPN toggle drops the connection for a moment; wait for the new route.
    const soon = () => setTimeout(check, 1500);
    const net = (navigator as Navigator & { connection?: EventTarget }).connection;
    check();
    const t = setInterval(check, RECHECK_MS);
    window.addEventListener('online', soon);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    net?.addEventListener('change', soon);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener('online', soon);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      net?.removeEventListener('change', soon);
    };
  }, []);
  return place;
}

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;

/** Local time where the visitor is, ticking. Its own component so only it re-renders. */
function Clock({ tz }: { tz: string }) {
  const fmt = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short',
    }).formatToParts(new Date());
    const zone = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${parts.filter((p) => p.type !== 'timeZoneName').map((p) => p.value).join('').trim()} ${zone}`;
  };
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const t = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span className="tabular-nums">{now}</span>;
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
  const place = usePlace();
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
          <span className="hidden sm:inline">/ Software engineer</span>
        </span>
        <span className="hidden items-center gap-5 whitespace-nowrap md:flex">
          <span>{coord(place.lat, 'N', 'S')} {coord(place.lon, 'E', 'W')}</span>
          <span>{place.label}</span>
          <Clock key={place.tz} tz={place.tz} />
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
          </div>
        </div>
      </div>
    </header>
  );
}
