import { useEffect, useRef } from 'react';

/* A water surface.
 *
 * The previous version drew expanding circles along the cursor path. That is
 * not how water behaves — a real disturbance propagates outward as a wave,
 * reflects off boundaries, interferes with the waves already travelling, and
 * decays. Drawn rings can only ever look like drawn rings, so they are gone.
 *
 * This is the real thing: a height field integrating the 2-D wave equation.
 *
 *     ∂²h/∂t² = c² ∇²h
 *
 * discretised on a grid with the standard leapfrog stencil, which for unit
 * time step reduces to
 *
 *     h_next = (h_left + h_right + h_up + h_down) / 2 − h_prev
 *
 * and then multiplied by a damping factor slightly below 1 so energy bleeds
 * away instead of ringing forever. Two buffers ping-pong between frames.
 *
 * Nothing about the visible result is drawn as a shape. The surface is shaded
 * from the height field's own gradient: the gradient gives a surface normal,
 * the normal gives a specular highlight against a fixed light, and that is
 * what your eye reads as moving water. Interference patterns, the wake behind
 * a fast cursor, reflections off the edges of the viewport — none of those are
 * authored, they fall out of the equation.
 *
 * Two sources of motion:
 *   · the pointer, which presses a dip into the surface and drags it along,
 *     interpolated between frames so a fast sweep leaves a continuous wake
 *     rather than a dotted line;
 *   · a slow ambient swell, a pair of long low-amplitude directional waves
 *     summed in at shading time, so the surface is never perfectly still —
 *     the ocean look, well below the threshold where it competes with text.
 *
 * Cost: the field runs at a quarter of CSS resolution and is drawn scaled up
 * with smoothing, which is both much cheaper and softer than simulating at
 * full resolution. Roughly 30k cells, two passes per frame. */

interface SiteBackgroundProps {
  /** Palette key — changing it re-reads the colour tokens. */
  paletteKey?: string;
}

const CELL = 3;              // CSS pixels per simulation cell
const MAX_W = 500;           // hard cap on grid width, for very wide monitors
/* The three dials that set how thick the liquid is. Together these describe
   something closer to glycerine than to water: slow to move, quick to settle,
   and still when nothing is touching it. */
const C2 = 0.09;             // wave speed² — low, so disturbances crawl
const VISCOSITY = 0.91;     // velocity retained per step; 1 = inviscid
const DAMPING = 0.99;       // residual height decay, so it truly comes to rest

const TOUCH_RADIUS = 7;      // cells — a thicker fluid displaces a wider area
/* Deliberately gentle. An early version used 42 and produced a black trough
   that swallowed the hero text — a disturbance you can see is not the same as
   a disturbance you can read through. */
const TOUCH_FORCE = 18;
const AMBIENT_FORCE = 3.5;

/* A falling drop is not a finger press. A finger displaces a shallow bowl and
   holds it; a drop arrives with momentum, punches a narrow crater, and throws
   the displaced liquid up into a ring around the impact — the "crown". The
   crown is what makes the eye read it as something landing rather than
   something pressing, so it is modelled explicitly rather than left to the
   solver. Radii are in cells. */
const DROP_RADIUS = 5;       // crater — narrow and deep
const DROP_FORCE = 50;       // ~3× a drag press; a drop carries kinetic energy
const CROWN_INNER = 5.3;     // where the crater ends
const CROWN_OUTER = 14.0;     // where the thrown-up ring fades out
const CROWN_FORCE = 20;      // upward, hence the sign flip below

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [80, 150, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function SiteBackground({ paletteKey }: SiteBackgroundProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const host = wrap.current;
    if (!cv || !host) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const readVar = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

    let deep = hexToRgb(readVar('--bg2', '#0a1424'));
    let glow = hexToRgb(readVar('--p', '#4d8dff'));
    let spec = hexToRgb(readVar('--a', '#2fe0f0'));
    /* Set by applyPalette. Decides whether the surface is shaded by adding
       light or by blending toward the accent — see the shading loop. */
    let light = document.documentElement.dataset.paletteLight === '1';

    // ── the field ──────────────────────────────────────────────────────────
    let W = 0, H = 0;                       // grid dimensions
    let cur: Float32Array = new Float32Array(0);
    let prev: Float32Array = new Float32Array(0);
    let img: ImageData | null = null;
    let buf: Uint8ClampedArray = new Uint8ClampedArray(0);

    // an offscreen canvas the size of the GRID; the upscale happens on draw
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d');

    let raf = 0;
    let t = 0;

    const resize = () => {
      const cw = cv.clientWidth || window.innerWidth;
      const ch = cv.clientHeight || window.innerHeight;
      W = Math.min(MAX_W, Math.max(24, Math.round(cw / CELL)));
      H = Math.max(24, Math.round((ch / cw) * W));
      cur = new Float32Array(W * H);
      prev = new Float32Array(W * H);
      small.width = W;
      small.height = H;
      if (sctx) {
        img = sctx.createImageData(W, H);
        buf = img.data;
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;   // alpha
        /* Seed every cell with the resting colour. Only interior cells are
           shaded each frame, so without this the untouched one-pixel border
           renders as a black frame around the viewport. */
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = light ? deep[0] : deep[0] + glow[0] * 0.13;
          buf[i + 1] = light ? deep[1] : deep[1] + glow[1] * 0.13;
          buf[i + 2] = light ? deep[2] : deep[2] + glow[2] * 0.13;
        }
      }
      allocSwell();

      // the visible canvas stays at CSS size; we upscale into it
      cv.width = Math.max(1, Math.round(cw / 2));
      cv.height = Math.max(1, Math.round(ch / 2));
    };

    /* Press a dip into the surface. Negative because a finger displaces water
       downward; the rebound is what launches the outgoing wave. */
    const touch = (gx: number, gy: number, force = TOUCH_FORCE) => {
      const x0 = Math.max(1, Math.round(gx) - TOUCH_RADIUS);
      const x1 = Math.min(W - 2, Math.round(gx) + TOUCH_RADIUS);
      const y0 = Math.max(1, Math.round(gy) - TOUCH_RADIUS);
      const y1 = Math.min(H - 2, Math.round(gy) + TOUCH_RADIUS);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - gx, dy = y - gy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > TOUCH_RADIUS) continue;
          const falloff = Math.cos((d / TOUCH_RADIUS) * Math.PI * 0.5);   // smooth edge
          cur[y * W + x] -= force * falloff * falloff;
        }
      }
    };

    // ── pointer, in grid coordinates ───────────────────────────────────────
    let px = -1, py = -1, hasLast = false;
    const onPointer = (e: PointerEvent) => {
      if (reduced) return;
      const gx = (e.clientX / (cv.clientWidth || 1)) * W;
      const gy = (e.clientY / (cv.clientHeight || 1)) * H;
      if (hasLast) {
        /* Interpolate along the segment travelled since the last event, so a
           quick sweep leaves one continuous trough instead of a dotted line —
           this is what makes it feel like dragging a finger rather than
           tapping repeatedly. */
        const dx = gx - px, dy = gy - py;
        const dist = Math.hypot(dx, dy);
        const steps = Math.min(24, Math.max(1, Math.round(dist)));
        // a fast drag presses less deeply per step, so total energy stays sane
        const per = TOUCH_FORCE / Math.max(1, Math.sqrt(steps));
        for (let i = 1; i <= steps; i++) {
          touch(px + (dx * i) / steps, py + (dy * i) / steps, per);
        }
      } else {
        touch(gx, gy);
      }
      px = gx; py = gy; hasLast = true;
    };
    const onLeave = () => { hasLast = false; };

    /* Crater plus crown. The crater uses cos² falloff like `touch`, so the two
       are continuous with each other; the crown is a raised annulus whose
       profile is a single sine lobe between the inner and outer radii, which
       goes to zero smoothly at both ends and therefore does not inject a
       discontinuity the solver would turn into a square ringing artefact. */
    const drop = (gx: number, gy: number, scale = 1) => {
      const R = Math.ceil(CROWN_OUTER) + 1;
      const x0 = Math.max(1, Math.round(gx) - R);
      const x1 = Math.min(W - 2, Math.round(gx) + R);
      const y0 = Math.max(1, Math.round(gy) - R);
      const y1 = Math.min(H - 2, Math.round(gy) + R);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - gx, dy = y - gy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= DROP_RADIUS) {
            const f = Math.cos((d / DROP_RADIUS) * Math.PI * 0.5);
            cur[y * W + x] -= DROP_FORCE * scale * f * f;
          } else if (d < CROWN_OUTER) {
            const u = (d - CROWN_INNER) / (CROWN_OUTER - CROWN_INNER);
            if (u < 0 || u > 1) continue;
            cur[y * W + x] += CROWN_FORCE * scale * Math.sin(u * Math.PI);
          }
        }
      }
    };

    /* Only fire on genuinely empty background. Anything the visitor could be
       aiming at — a link, a card, a control, a media surface — swallows the
       click, because a ripple under a button they just pressed reads as a
       glitch rather than as an effect. */
    const INTERACTIVE = 'a,button,input,textarea,select,label,summary,video,canvas,'
      + '[role="button"],[role="link"],[role="tab"],[contenteditable],.project-card,.glass,.glass-strong';
    const onDown = (e: PointerEvent) => {
      if (reduced || e.button !== 0) return;
      const t = e.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest(INTERACTIVE)) return;
      const gx = (e.clientX / (cv.clientWidth || 1)) * W;
      const gy = (e.clientY / (cv.clientHeight || 1)) * H;
      
      /* A finger tap: a single deep, forceful displacement.
         We don't need to fake a "crown" or secondary droplets; 
         the wave equation naturally expands this crater into 
         realistic outward-propagating rings. */
      touch(gx, gy, 65);
    };

    /* One step of a *damped* wave equation.
     *
     * The first version used the shorthand stencil
     *
     *     next = (left + right + up + down) / 2 − prev,  then × damping
     *
     * which is the wave equation with the propagation speed pinned at its
     * stability limit and no viscous term at all. That is why it behaved like
     * water on a shallow tray: everything travelled at maximum speed and rang
     * for a long time, so the surface never stopped moving.
     *
     * This is the general form, which exposes the two knobs a thicker liquid
     * actually needs:
     *
     *     v  ←  (h − h_prev)            velocity
     *     v  ←  v + C2 · ∇²h            acceleration from surface curvature
     *     v  ←  v · (1 − VISCOSITY)     viscous drag, proportional to velocity
     *     h' ←  h + v
     *
     * C2 is wave speed squared: lowering it makes disturbances travel slowly,
     * which is most of what reads as "heavy". VISCOSITY is real viscous drag
     * on the velocity — it is what makes the motion stop rather than ring.
     * (Stability for this stencil needs C2 ≤ 0.5.) */
    const step = () => {
      for (let y = 1; y < H - 1; y++) {
        const row = y * W;
        for (let x = 1; x < W - 1; x++) {
          const i = row + x;
          const h = cur[i];
          const lap = cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W] - 4 * h;
          let v = h - prev[i];
          v += C2 * lap;
          v *= VISCOSITY;
          prev[i] = (h + v) * DAMPING;
        }
      }
      // ping-pong
      const swap = cur; cur = prev; prev = swap;
    };

    /* Ambient swell, precomputed once per frame.
     *
     * The first version evaluated Math.sin six times per cell inside the
     * shading loop — about 180,000 transcendental calls a frame, which ran at
     * three frames per second. It is avoidable: a plane wave
     * sin(kx·x + ky·y + φ) is separable through
     *
     *     sin(u + v) = sin u · cos v + cos u · sin v
     *
     * with u = kx·x + φ and v = ky·y. So four small tables — sin/cos over the
     * W columns and over the H rows — reconstruct the whole field with two
     * multiplies and an add per cell, and the sin count per frame drops from
     * O(W·H) to O(W + H). Roughly 500 calls instead of 180,000. */
    const swell = new Float32Array(0);
    let sw: Float32Array = swell;
    let su1: Float32Array, cu1: Float32Array, sv1: Float32Array, cv1: Float32Array;
    let su2: Float32Array, cu2: Float32Array, sv2: Float32Array, cv2: Float32Array;

    const allocSwell = () => {
      sw = new Float32Array(W * H);
      su1 = new Float32Array(W); cu1 = new Float32Array(W);
      sv1 = new Float32Array(H); cv1 = new Float32Array(H);
      su2 = new Float32Array(W); cu2 = new Float32Array(W);
      sv2 = new Float32Array(H); cv2 = new Float32Array(H);
    };

    const buildSwell = () => {
      const p1 = t * 0.000115, p2 = t * 0.000072;   // a slow, heavy swell
      for (let x = 0; x < W; x++) {
        const u1 = x * 0.055 + p1; su1[x] = Math.sin(u1); cu1[x] = Math.cos(u1);
        const u2 = x * 0.018 + p2; su2[x] = Math.sin(u2); cu2[x] = Math.cos(u2);
      }
      for (let y = 0; y < H; y++) {
        const v1 = y * 0.021; sv1[y] = Math.sin(v1); cv1[y] = Math.cos(v1);
        const v2 = -y * 0.047; sv2[y] = Math.sin(v2); cv2[y] = Math.cos(v2);
      }
      for (let y = 0; y < H; y++) {
        const row = y * W;
        const a1 = cv1[y], b1 = sv1[y], a2 = cv2[y], b2 = sv2[y];
        for (let x = 0; x < W; x++) {
          sw[row + x] = (su1[x] * a1 + cu1[x] * b1) * 1.15 + (su2[x] * a2 + cu2[x] * b2) * 0.85;
        }
      }
    };

    const shade = () => {
      if (!img || !sctx) return;
      buildSwell();

      for (let y = 1; y < H - 1; y++) {
        const row = y * W;
        for (let x = 1; x < W - 1; x++) {
          const i = row + x;

          /* Total surface = simulated ripples + ambient swell. The gradient is
             central differences over that sum, so both contribute to the
             normal and therefore to the highlight — no special-casing. */
          const gx = (cur[i - 1] + sw[i - 1] - cur[i + 1] - sw[i + 1]) * 0.5;
          const gy = (cur[i - W] + sw[i - W] - cur[i + W] - sw[i + W]) * 0.5;

          // normalise a (gx, gy, 1) normal cheaply
          const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
          const nx = gx * inv, ny = gy * inv, nz = inv;

          // fixed light from upper-left, slightly in front
          const nl = nx * -0.48 + ny * -0.56 + nz * 0.68;
          const lam = nl > 0 ? nl : 0;

          // narrow specular lobe — the glint that reads as a wet surface
          const s2 = lam * lam;
          const sp = s2 * s2 * s2 * s2;              // ≈ pow(lam, 8)
          const sp2 = sp * sp;                        // ≈ pow(lam, 16), tighter core

          /* Depth tint, hard-bounded. Unbounded it drives troughs to pure
             black, which is what made the first attempt look like a hole
             rather than a surface. The floor is deliberately above zero: real
             water in shadow is still water-coloured. */
          const h = cur[i] + sw[i];
          let lift = h * 0.012;
          if (lift > 0.18) lift = 0.18;
          else if (lift < -0.09) lift = -0.09;

          const o = i << 2;

          if (light) {
            /* Light palettes need the opposite operator.
             *
             * Adding a highlight to a near-white ground just clips to white —
             * on the Paper and Daylight themes the surface was invisible,
             * every sample reading 255,255,255. On a light ground water reads
             * the way it actually does on paper-white: as faint darker
             * refraction where the surface is steep, not as glints. So the
             * same shading term drives a blend TOWARDS the accent instead of
             * an addition of it. */
            const k = (sp * 0.28 + sp2 * 0.35) - lift * 0.7;
            const a = k > 0.45 ? 0.45 : k < 0 ? 0 : k;
            buf[o] = deep[0] + (spec[0] - deep[0]) * a;
            buf[o + 1] = deep[1] + (spec[1] - deep[1]) * a;
            buf[o + 2] = deep[2] + (spec[2] - deep[2]) * a;
          } else {
            const base = 0.13 + lift;
            const hi = sp * 0.20 + sp2 * 0.35;
            buf[o] = deep[0] + glow[0] * base + spec[0] * hi;
            buf[o + 1] = deep[1] + glow[1] * base + spec[1] * hi;
            buf[o + 2] = deep[2] + glow[2] * base + spec[2] * hi;
          }
        }
      }
      sctx.putImageData(img, 0, 0);

      // upscale with smoothing — this is what makes it look like a surface
      // rather than a grid of cells
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(small, 0, 0, cv.width, cv.height);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      t = now;
      if (!reduced) {
        // Distant disturbance is now handled by the autoTapTimer below.
        step();
      }
      shade();
    };

    const readTokens = () => {
      deep = hexToRgb(readVar('--bg2', '#0a1424'));
      glow = hexToRgb(readVar('--p', '#4d8dff'));
      spec = hexToRgb(readVar('--a', '#2fe0f0'));
      light = document.documentElement.dataset.paletteLight === '1';
    };

    resize();
    readTokens();
    // seed a little motion so the first paint is already alive
    for (let k = 0; k < 3; k++) touch(2 + Math.random() * (W - 4), 2 + Math.random() * (H - 4), AMBIENT_FORCE);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown, { passive: true });
    const tokenTimer = window.setInterval(readTokens, 1000);
    
    // Showcase the animation with slow random drops (1 per second)
    const autoTapTimer = window.setInterval(() => {
      if (!reduced) {
        touch(2 + Math.random() * (W - 4), 2 + Math.random() * (H - 4), TOUCH_FORCE * 0.7);
      }
    }, 1000);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(tokenTimer);
      window.clearInterval(autoTapTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [paletteKey]);

  return (
    <div ref={wrap} className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* The water itself, furthest back. */}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ opacity: 0.82 }} />

      {/* An engineering grid, read through the water rather than over it —
          low enough to be a texture, present enough to keep the technical
          register the rest of the site is written in. */}
      <svg width="100%" height="100%" className="absolute inset-0 opacity-[.07]">
        <defs>
          <pattern id="sp-grid" width="72" height="72" patternUnits="userSpaceOnUse">
            <path d="M72 0H0V72" fill="none" stroke="var(--line)" strokeWidth="1" />
          </pattern>
          <linearGradient id="sp-gfade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity=".9" />
            <stop offset="60%" stopColor="#fff" stopOpacity=".25" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="sp-gm"><rect width="100%" height="100%" fill="url(#sp-gfade)" /></mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#sp-grid)" mask="url(#sp-gm)" />
      </svg>

      {/* Aurora, drifting above the surface — depth of colour, not of form. */}
      <div
        className="absolute -inset-[22%] animate-drift opacity-40 blur-[74px]"
        style={{ background: 'radial-gradient(58% 52% at 28% 18%, color-mix(in oklab,var(--p) 22%,transparent) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -inset-[22%] animate-drift-slow opacity-35 blur-[86px]"
        style={{ background: 'radial-gradient(54% 46% at 72% 78%, color-mix(in oklab,var(--s) 18%,transparent) 0%, transparent 70%)' }}
      />

      {/* Scrim — body copy keeps its contrast whatever the surface is doing. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(125% 85% at 50% 0%, transparent 34%, var(--bg) 100%)' }}
      />
    </div>
  );
}
