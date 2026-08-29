import { useEffect, useRef, useState, type ReactElement } from 'react';
import { loadMazeEngine, loadTwinEngine } from '@/features/factory-twin/lib/twin';
import type { PreviewKind } from '@/features/projects/lib/previews';

/* Animated preview that fills the header of a project card.

   The two projects that ship a real engine get a live miniature of it — the
   factory cell and the maze run, the same code the full-page viewers use.
   Those mount lazily: the engine script and its Three.js payload are only
   fetched once the card actually scrolls into view, so the home page still
   paints without them. Every other project gets a hand-drawn looping SVG
   motif, which costs nothing and never touches the GPU. */

/* ── live engine miniature ─────────────────────────────────────────────── */

function EngineMini({ kind, accent }: { kind: 'twin' | 'maze'; accent: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      /* No observer (older browsers, jsdom) — mount on the next tick rather
         than synchronously, so this effect never sets state in its body. */
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!visible || !el) return;
    let dead = false;
    const load = kind === 'twin' ? loadTwinEngine : loadMazeEngine;
    load()
      .then(() => {
        if (dead) return;
        const tag = kind === 'twin' ? 'factory-twin-3d' : 'webots-world-3d';
        const node = document.createElement(tag);
        node.setAttribute('accent', accent);
        node.setAttribute('playing', '1');
        node.setAttribute('speed', kind === 'twin' ? '1.4' : '2');
        node.setAttribute('grid', '0');
        if (kind === 'maze') {
          node.setAttribute('lidar', '1');
          node.setAttribute('path', '1');
          node.setAttribute('fpv', '0');
          node.setAttribute('src', '/worlds/maze3-world.json');
        }
        node.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        node.addEventListener('twin-error', () => setFailed(true));
        el.appendChild(node);
      })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; el.replaceChildren(); };
  }, [visible, kind, accent]);

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      {(!visible || failed) && <MotifFallback />}
    </>
  );
}

function MotifFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-a opacity-60" />
    </div>
  );
}

/* ── SVG motifs ────────────────────────────────────────────────────────── */

const VB = '0 0 340 190';

function Vision() {
  // YOLO-style detection boxes locking on, then releasing
  return (
    <svg viewBox={VB} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="var(--a)" fill="none" strokeWidth="1.6">
        {[[60, 50, 78, 62, 0], [180, 84, 62, 52, 1.1], [116, 108, 54, 44, 2.2]].map(([x, y, w, h, d], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="3" opacity="0">
            <animate attributeName="opacity" values="0;.9;.9;0" dur="4s" begin={`${d}s`} repeatCount="indefinite" />
            <animate attributeName="width" values={`${(w as number) * 0.6};${w};${w};${w}`} dur="4s" begin={`${d}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </g>
      <g fill="var(--a)" fontFamily="JetBrains Mono, monospace" fontSize="8" opacity=".8">
        <text x="60" y="45">person 0.94<animate attributeName="opacity" values="0;1;1;0" dur="4s" repeatCount="indefinite" /></text>
        <text x="180" y="79">chair 0.87<animate attributeName="opacity" values="0;1;1;0" dur="4s" begin="1.1s" repeatCount="indefinite" /></text>
      </g>
      <line x1="0" y1="0" x2="340" y2="0" stroke="var(--p)" strokeWidth="2" opacity=".55">
        <animate attributeName="y1" values="0;190;0" dur="5s" repeatCount="indefinite" />
        <animate attributeName="y2" values="0;190;0" dur="5s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

function Rag() {
  // query → retrieve k docs → generate
  return (
    <svg viewBox={VB} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="var(--line)" strokeWidth="1" fill="none">
        <path d="M40 95 H120 M215 95 H300" />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={130} y={40 + i * 30} width="70" height="20" rx="4"
          fill="color-mix(in oklab,var(--p) 14%,transparent)" stroke="var(--p)" strokeWidth="1" opacity=".25">
          <animate attributeName="opacity" values=".25;.95;.25" dur="3.2s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
        </rect>
      ))}
      <circle cx="40" cy="95" r="7" fill="var(--a)" />
      <circle cx="300" cy="95" r="7" fill="var(--s)" />
      <circle r="3.5" fill="var(--a)">
        <animateMotion path="M40 95 H120" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle r="3.5" fill="var(--s)">
        <animateMotion path="M215 95 H300" dur="1.6s" begin="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* Condition-monitoring trace, the way a PdM dashboard actually reads: four
   channels plotted left-to-right as the window fills, a degradation signature
   developing in the vibration and gearbox-temperature channels, power output
   falling off, and a fused health index that crosses the alarm band before any
   of the raw channels look alarming on their own. That lead time is the whole
   point of predictive maintenance, so the motif shows it explicitly.

   Traces are deterministic (a sin-hash, not Math.random) so they are stable
   across renders and identical for every visitor. */

const PDM_VIB = 'M0.0 43.3 L7.4 41.0 L14.8 41.7 L22.2 42.2 L29.6 42.9 L37.0 40.7 L44.3 41.0 L51.7 42.0 L59.1 41.9 L66.5 41.9 L73.9 43.9 L81.3 41.6 L88.7 41.6 L96.1 42.4 L103.5 40.6 L110.9 42.6 L118.3 42.3 L125.7 43.0 L133.0 40.1 L140.4 41.2 L147.8 40.5 L155.2 40.6 L162.6 43.8 L170.0 41.3 L177.4 40.0 L184.8 42.6 L192.2 40.1 L199.6 42.3 L207.0 38.9 L214.3 41.4 L221.7 40.2 L229.1 38.8 L236.5 38.9 L243.9 38.1 L251.3 36.7 L258.7 37.8 L266.1 34.9 L273.5 32.7 L280.9 34.6 L288.3 33.5 L295.7 30.4 L303.0 29.0 L310.4 28.7 L317.8 29.7 L325.2 26.7 L332.6 24.2 L340.0 23.0';
const PDM_TEMP = 'M0.0 81.0 L7.4 80.7 L14.8 79.9 L22.2 79.8 L29.6 78.2 L37.0 78.9 L44.3 78.7 L51.7 78.5 L59.1 78.3 L66.5 78.1 L73.9 78.3 L81.3 76.9 L88.7 77.0 L96.1 78.1 L103.5 76.7 L110.9 76.7 L118.3 75.9 L125.7 76.8 L133.0 75.5 L140.4 76.3 L147.8 76.0 L155.2 75.9 L162.6 76.6 L170.0 76.4 L177.4 75.5 L184.8 74.3 L192.2 74.7 L199.6 75.5 L207.0 74.4 L214.3 73.7 L221.7 75.2 L229.1 73.6 L236.5 74.8 L243.9 73.8 L251.3 74.0 L258.7 72.7 L266.1 72.5 L273.5 72.1 L280.9 72.6 L288.3 72.5 L295.7 72.3 L303.0 72.2 L310.4 72.7 L317.8 71.6 L325.2 71.4 L332.6 70.2 L340.0 71.6';
const PDM_PWR = 'M0.0 114.7 L7.4 114.2 L14.8 114.6 L22.2 112.8 L29.6 113.6 L37.0 112.8 L44.3 113.4 L51.7 115.1 L59.1 113.0 L66.5 115.3 L73.9 114.6 L81.3 113.3 L88.7 113.6 L96.1 115.1 L103.5 115.3 L110.9 114.9 L118.3 114.0 L125.7 114.2 L133.0 115.0 L140.4 115.4 L147.8 115.1 L155.2 113.6 L162.6 113.1 L170.0 114.9 L177.4 115.0 L184.8 115.2 L192.2 112.5 L199.6 115.3 L207.0 113.1 L214.3 114.4 L221.7 113.6 L229.1 113.8 L236.5 115.4 L243.9 117.1 L251.3 117.1 L258.7 117.1 L266.1 117.3 L273.5 120.7 L280.9 120.2 L288.3 122.4 L295.7 123.6 L303.0 124.0 L310.4 127.1 L317.8 128.7 L325.2 129.6 L332.6 130.6 L340.0 132.6';
const PDM_HI = 'M0.0 176.4 L7.4 175.5 L14.8 175.9 L22.2 176.6 L29.6 176.4 L37.0 176.0 L44.3 174.9 L51.7 175.5 L59.1 175.9 L66.5 175.0 L73.9 174.7 L81.3 174.2 L88.7 174.0 L96.1 174.6 L103.5 173.6 L110.9 173.4 L118.3 173.1 L125.7 172.3 L133.0 172.1 L140.4 170.8 L147.8 170.3 L155.2 170.3 L162.6 169.0 L170.0 169.1 L177.4 167.9 L184.8 167.7 L192.2 166.3 L199.6 166.3 L207.0 165.4 L214.3 164.5 L221.7 164.1 L229.1 163.0 L236.5 161.3 L243.9 161.8 L251.3 159.6 L258.7 158.9 L266.1 157.7 L273.5 157.3 L280.9 155.8 L288.3 155.2 L295.7 153.2 L303.0 152.5 L310.4 151.1 L317.8 150.2 L325.2 149.2 L332.6 146.8 L340.0 145.7';

const PDM_SWEEP = '7s';
const PDM_ALARM_Y = 152;        // health-index alarm band
const PDM_CROSS = 0.895;        // fraction of the window where HI crosses it

const PDM_CHANNELS = [
  { d: PDM_VIB,  label: 'VIB RMS',  stroke: 'var(--fg2)', y: 32 },
  { d: PDM_TEMP, label: 'GEAR °C',  stroke: 'var(--fg2)', y: 70 },
  { d: PDM_PWR,  label: 'POWER kW', stroke: 'var(--fg2)', y: 106 },
];

function Maintenance() {
  return (
    <svg viewBox={VB} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      {/* Lift and compress slightly so the health-index lane and its alarm band
          clear the bottom edge of the card at every card width. */}
      <g transform="translate(0,-9) scale(1,0.93)">
      {/* lane baselines */}
      <g stroke="var(--line)" strokeWidth="0.8">
        {[54, 92, 138].map((y) => <line key={y} x1="0" y1={y} x2="340" y2={y} />)}
      </g>

      {/* alarm band on the fused health index */}
      <rect x="0" y={PDM_ALARM_Y - 9} width="340" height="9"
        fill="color-mix(in oklab,#f97316 16%,transparent)" />
      <line x1="0" y1={PDM_ALARM_Y} x2="340" y2={PDM_ALARM_Y}
        stroke="#f97316" strokeWidth="1" strokeDasharray="4 4" opacity=".8" />

      {/* raw sensor channels, plotted as the window fills */}
      {PDM_CHANNELS.map((c, i) => (
        <g key={c.label}>
          <path d={c.d} fill="none" stroke={c.stroke} strokeWidth="1.4" strokeOpacity=".75"
            strokeDasharray="900" strokeDashoffset="900">
            <animate attributeName="stroke-dashoffset" values="900;0;0" keyTimes="0;.86;1"
              dur={PDM_SWEEP} repeatCount="indefinite" />
          </path>
          <text x="5" y={c.y} fontFamily="JetBrains Mono, monospace" fontSize="7.5"
            letterSpacing="1" fill="var(--fg3)" opacity={0.9 - i * 0.05}>{c.label}</text>
        </g>
      ))}

      {/* fused health index — the channel that actually raises the alarm */}
      <path d={PDM_HI} fill="none" stroke="var(--a)" strokeWidth="2"
        strokeDasharray="900" strokeDashoffset="900">
        <animate attributeName="stroke-dashoffset" values="900;0;0" keyTimes="0;.86;1"
          dur={PDM_SWEEP} repeatCount="indefinite" />
      </path>
      <text x="5" y="170" fontFamily="JetBrains Mono, monospace" fontSize="7.5"
        letterSpacing="1" fill="var(--a)">HEALTH IDX</text>

      {/* acquisition cursor */}
      <line y1="14" y2="184" stroke="var(--p)" strokeWidth="1.2" opacity=".7">
        <animate attributeName="x1" values="0;340;340" keyTimes="0;.86;1" dur={PDM_SWEEP} repeatCount="indefinite" />
        <animate attributeName="x2" values="0;340;340" keyTimes="0;.86;1" dur={PDM_SWEEP} repeatCount="indefinite" />
      </line>

      {/* alarm fires once the index crosses, and holds to the end of the window */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;0;1;1" keyTimes={`0;${PDM_CROSS};${PDM_CROSS + 0.02};1`}
          dur={PDM_SWEEP} repeatCount="indefinite" />
        <circle cx="311" cy="151" r="4" fill="#f97316" />
        <circle cx="311" cy="151" r="4" fill="none" stroke="#f97316" strokeWidth="1.2">
          <animate attributeName="r" values="4;13" dur="1.3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".9;0" dur="1.3s" repeatCount="indefinite" />
        </circle>
        <text x="250" y="140" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="8"
          letterSpacing="1.1" fill="#fb923c">FAULT PREDICTED</text>
      </g>
      </g>
    </svg>
  );
}

function Beacon() {
  return (
    <svg viewBox={VB} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect x="30" y="30" width="280" height="130" rx="6" fill="none" stroke="var(--line)" strokeWidth="1" />
      {[[70, 60], [270, 60], [70, 140], [270, 140]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="4" fill="var(--p)" />
          <circle cx={cx} cy={cy} r="4" fill="none" stroke="var(--p)" strokeWidth="1">
            <animate attributeName="r" values="4;38" dur="2.8s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values=".7;0" dur="2.8s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      <circle r="6" fill="var(--a)">
        <animateMotion path="M110 100 Q170 60 230 100 Q170 145 110 100" dur="7s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* The real PDM inference loop, using this project's own output frames cropped
   from outputs/report_figures/best_pipeline_overview.png — a BraTS-PEDs test
   slice run end to end. Four stages cross-fade on the same timeline the
   pipeline actually follows: anomalous input → forward diffusion to T=250 →
   pseudo-healthy reconstruction → residual anomaly map. BraTS-PEDs is a public,
   de-identified research dataset. */

const PDM_STAGES = [
  { src: '/media/brats-input.webp', label: 'Input slice · anomalous' },
  { src: '/media/brats-noised.webp', label: 'Forward diffusion · T=250' },
  { src: '/media/brats-healthy.webp', label: 'Patch fusion · pseudo-healthy' },
  { src: '/media/brats-anomaly.webp', label: 'Residual · anomaly map' },
] as const;

const PDM_HOLD_MS = 1900;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Diffusion() {
  const [i, setI] = useState(0);
  /* Read the preference during initialisation rather than in an effect — no
     cascading render, and the first paint is already correct. */
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % PDM_STAGES.length), PDM_HOLD_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  /* Reduced motion still gets the point of the project: the scan and what the
     model found in it, side by side and still. */
  if (reduced) {
    return (
      <div className="absolute inset-0 grid grid-cols-2">
        {[PDM_STAGES[0], PDM_STAGES[3]].map((st) => (
          <img key={st.src} src={st.src} alt={st.label} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      {PDM_STAGES.map((st, n) => (
        <img
          key={st.src}
          src={st.src}
          alt={n === 0 ? 'BraTS-PEDs test slice with a visible lesion' : ''}
          aria-hidden={n !== 0}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out"
          style={{ opacity: n === i ? 1 : 0 }}
        />
      ))}

      {/* Stage caption — names what the viewer is looking at. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5"
        style={{ background: 'linear-gradient(to top, rgba(3,6,15,.86), transparent)' }}>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-white/85">
          {PDM_STAGES[i].label}
        </span>
      </div>

      {/* Progress ticks for the four stages. */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 flex gap-1">
        {PDM_STAGES.map((st, n) => (
          <span key={st.src} className="h-1 w-4 rounded-full transition-colors duration-500"
            style={{ background: n === i ? 'var(--a)' : 'rgba(255,255,255,.28)' }} />
        ))}
      </div>
    </div>
  );
}

function Iot() {
  return (
    <svg viewBox={VB} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <g stroke="var(--line)" strokeWidth="1" fill="none">
        <path d="M50 150 h60 v-40 h60 v-45 h60 v85 h60" />
      </g>
      {[[50, 150], [110, 110], [170, 65], [230, 65], [290, 150]].map(([cx, cy], i) => (
        <g key={i}>
          <rect x={cx - 9} y={cy - 9} width="18" height="18" rx="4"
            fill="color-mix(in oklab,var(--s) 18%,transparent)" stroke="var(--s)" strokeWidth="1" />
          <circle cx={cx} cy={cy} r="2.5" fill="var(--a)">
            <animate attributeName="opacity" values=".2;1;.2" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      <circle r="3.5" fill="var(--a)">
        <animateMotion path="M50 150 h60 v-40 h60 v-45 h60 v85 h60" dur="5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

const MOTIFS: Record<string, () => ReactElement> = {
  vision: Vision, rag: Rag, maintenance: Maintenance, beacon: Beacon, diffusion: Diffusion, iot: Iot,
};

/* ── entry point ───────────────────────────────────────────────────────── */

export interface ProjectPreviewProps {
  kind: PreviewKind;
  accent: string;
  /** Fallback letter drawn behind the motif, as before. */
  initial: string;
}

export default function ProjectPreview({ kind, accent, initial }: ProjectPreviewProps) {
  const Motif = MOTIFS[kind];
  const live = kind === 'twin' || kind === 'maze';
  const photo = kind === 'diffusion';   // real imagery, not a tinted motif

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background: live || photo
          ? 'var(--canvas)'
          : 'linear-gradient(140deg,color-mix(in oklab,var(--p) 18%,transparent),color-mix(in oklab,var(--s) 12%,transparent))',
      }}
    >
      {!live && !photo && (
        <span
          className="absolute inset-0 grid place-items-center text-[74px] font-extrabold tracking-[-.05em]"
          style={{ color: 'color-mix(in oklab,var(--fg) 8%,transparent)' }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      {live ? <EngineMini kind={kind} accent={accent} /> : Motif ? <Motif /> : null}
    </div>
  );
}
