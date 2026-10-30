import { useEffect, useRef } from 'react';
import { currentTone, paintBubble } from '../lib/bubble';
import { currentPalette, renderBlob } from '../lib/glassBlob';
import { isLowPerf } from '@/shared/lib/perf';

/* Nexus's mark: an iridescent liquid-glass blob — a softly wobbling outline,
 * folded surface waves and thin-film colour that shifts towards the rim. Its
 * hues follow the site theme (pastel blue/pink/lilac, liquid violet,
 * editorial peach, slate pearl).
 *
 * Rendered by a small WebGL shader (lib/glassBlob.ts) at the device's full
 * pixel density. Every orb on the page shares one requestAnimationFrame loop
 * and one GL context; the surface flows gently, faster and livelier while
 * Nexus is active, and holds still (drawn once) when motion is off or the
 * device is in low-power mode and Nexus is idle. Without
 * WebGL it falls back to the 2D glass bubble from lib/bubble.ts. */

interface Orb { cv: HTMLCanvasElement; size: number; active: boolean; speed: number; energy: number; time: number }

const orbs = new Set<Orb>();
let raf = 0;
let last = 0;

const motionOn = () => document.documentElement.dataset.motion !== 'off';
function draw(o: Orb) {
  const ctx = o.cv.getContext('2d');
  if (!ctx) return;
  if (!renderBlob(ctx, o.cv.width, o.time, o.energy, currentPalette())) {
    paintBubble(ctx, o.cv.width, o.time, true, currentTone());
  }
}

function tick(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  const moving = motionOn();
  const lowPerf = isLowPerf();
  let animating = false;
  for (const o of orbs) {
    const ease = Math.min(1, dt * 3);
    o.speed += ((o.active ? 2.4 : 0.8) - o.speed) * ease;   // flow rate
    o.energy += ((o.active ? 1 : 0) - o.energy) * ease;
    if (moving) o.time += o.speed * dt;
    draw(o);
    // Low power: keep flowing only while Nexus is active or settling back down.
    if (!lowPerf || o.active || o.energy > 0.02) animating = true;
  }
  raf = orbs.size && moving && animating ? requestAnimationFrame(tick) : 0;
}

function start() {
  if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
}

/* Motion toggled on again → resume the shared loop; theme changed → repaint
   (needed when motion is off and nothing else redraws). */
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    orbs.forEach(draw);
    if (motionOn() && orbs.size) start();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-style'] });
}

export default function JarvisOrb({ size, active = false, className = '' }: {
  size: number;
  active?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const orb = useRef<Orb | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, isLowPerf() ? 2 : 3);
    cv.width = Math.round(size * dpr * (isLowPerf() ? 1 : 1.25));   // a little supersampling for clean edges
    cv.height = cv.width;
    const o: Orb = { cv, size, active: false, speed: 0.8, energy: 0, time: Math.random() * 100 };
    orb.current = o;
    orbs.add(o);
    draw(o);
    start();
    return () => { orbs.delete(o); orb.current = null; };
  }, [size]);

  useEffect(() => {
    if (!orb.current) return;
    orb.current.active = active;
    if (active && motionOn()) start();
  }, [active]);

  return (
    <span className={'jarvis-globe ' + className} data-active={active} style={{ width: size, height: size }} aria-hidden>
      <canvas ref={canvas} style={{ width: size, height: size, display: 'block' }} />
    </span>
  );
}
