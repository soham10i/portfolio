import { useEffect, useRef } from 'react';

/* The three blended background layers from the design: an aurora mesh, a faded
   grid + circuit traces, and a particle network on canvas. All of it sits under
   a --bg-tinted scrim so body copy keeps its contrast, and none of it takes
   pointer events. */

interface SiteBackgroundProps {
  /** Palette key — changing it re-reads --a so the particles follow the theme. */
  paletteKey?: string;
}

export default function SiteBackground({ paletteKey }: SiteBackgroundProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--a').trim() || '#22d3ee';

    let pts: { x: number; y: number; vx: number; vy: number }[] = [];
    let raf = 0;

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(70, Math.round((w * h) / 20000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
      }));
    };

    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const col = accent();
      ctx.clearRect(0, 0, w, h);

      if (!reduced) {
        for (const p of pts) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
      }

      ctx.strokeStyle = col;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 20000) {
            ctx.globalAlpha = (1 - d2 / 20000) * 0.16;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = col;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    seed();
    window.addEventListener('resize', seed);
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', seed);
    };
  }, [paletteKey]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Aurora mesh */}
      <div
        className="absolute -inset-[20%] animate-drift opacity-[.55] blur-[60px]"
        style={{ background: 'radial-gradient(60% 55% at 30% 20%, color-mix(in oklab,var(--p) 26%,transparent) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -inset-[20%] animate-drift2 opacity-50 blur-[70px]"
        style={{ background: 'radial-gradient(50% 50% at 75% 35%, color-mix(in oklab,var(--s) 24%,transparent) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -inset-[20%] animate-drift-slow opacity-45 blur-[80px]"
        style={{ background: 'radial-gradient(55% 45% at 55% 85%, color-mix(in oklab,var(--a) 18%,transparent) 0%, transparent 70%)' }}
      />

      {/* Fading grid */}
      <svg width="100%" height="100%" className="absolute inset-0 opacity-[.16]">
        <defs>
          <pattern id="sp-grid" width="72" height="72" patternUnits="userSpaceOnUse">
            <path d="M72 0H0V72" fill="none" stroke="var(--line)" strokeWidth="1" />
          </pattern>
          <linearGradient id="sp-gfade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity=".9" />
            <stop offset="60%" stopColor="#fff" stopOpacity=".25" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="sp-gm">
            <rect width="100%" height="100%" fill="url(#sp-gfade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#sp-grid)" mask="url(#sp-gm)" />
      </svg>

      {/* Circuit traces */}
      <svg
        width="100%" height="100%" viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 opacity-30"
      >
        <g
          fill="none" stroke="var(--a)" strokeWidth="1" strokeOpacity=".45"
          strokeDasharray="6 10" className="animate-dash"
        >
          <path d="M-40 140 H240 l40 40 H520 l30 -30 H900" />
          <path d="M1480 260 H1180 l-46 46 H860 l-28 28 H540" />
          <path d="M-40 640 H180 l52 -52 H520 l40 40 H980 l36 36 H1480" />
          <path d="M120 -40 V180 l44 44 V420" />
          <path d="M1320 940 V700 l-52 -52 V420" />
        </g>
        <g fill="var(--a)" fillOpacity=".5">
          <circle cx="240" cy="140" r="3" />
          <circle cx="900" cy="110" r="3" />
          <circle cx="1134" cy="306" r="3" />
          <circle cx="540" cy="334" r="3" />
          <circle cx="232" cy="588" r="3" />
          <circle cx="1016" cy="676" r="3" />
        </g>
      </svg>

      <canvas ref={canvas} className="absolute inset-0 h-full w-full opacity-60" />

      {/* Scrim — keeps body copy readable over everything above */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, transparent 40%, var(--bg) 100%)' }}
      />
    </div>
  );
}
