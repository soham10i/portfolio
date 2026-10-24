import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { isDarkTheme, useTheme } from '@/shared/lib/theme';
import { CHAPTERS } from '../lib/chapters';
import { useStory } from '../lib/store';
import type { PointCloud } from '../three/PointCloud';
import type { ShapeSet } from '../three/shapes';

/* Fixed WebGL layer behind the chapter panels: the scroll-morphing LIDAR point
 * cloud (../three). Loaded after first paint and only on devices that can run
 * it (quality tier ≥ 1); the panels above are slightly translucent so it shows
 * through. Motion off → it still follows the scroll but stops animating. */

const TIER = {
  1: { count: 1800, dpr: 1 },
  2: { count: 3000, dpr: 1.25 },
  3: { count: 4200, dpr: 1.5 },
} as const;

/** Continuous animation is drawn at ~30 fps; scrolling still redraws at once. */
const FRAME_MS = 33;

/** Continuous chapter index for the current scroll position. */
function chapterPosition(tops: number[]): number {
  const y = window.scrollY + window.innerHeight * 0.5;
  for (let i = tops.length - 1; i >= 0; i--) {
    if (y >= tops[i]) {
      const next = tops[i + 1] ?? document.documentElement.scrollHeight;
      return i + Math.min(1, (y - tops[i]) / Math.max(1, next - tops[i]));
    }
  }
  return 0;
}

/**
 * set       which morph targets to use (home chapters by default)
 * position  drive the morph directly (e.g. MedQA's pipeline state: 0 idle,
 *           1 running, 2 answered) instead of from the scroll position
 */
export default function CloudLayer({ set: requested = 'home', position }: { set?: ShapeSet; position?: number } = {}) {
  const quality = useStory((s) => s.quality);
  const motion = useStory((s) => s.motion);
  const theme = useTheme((s) => s.theme);
  const dark = isDarkTheme(theme);
  const tone = theme === 'editorial' ? 'warm' : undefined;
  const set: ShapeSet = requested;
  const canvas = useRef<HTMLCanvasElement>(null);
  const cloud = useRef<PointCloud | null>(null);
  const motionRef = useRef(motion);
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);
  const [ready, setReady] = useState(false);

  useEffect(() => { motionRef.current = motion; }, [motion]);
  useEffect(() => { cloud.current?.setDark(dark, tone); }, [dark, tone]);

  useEffect(() => {
    if (quality === 0 || !canvas.current) return;
    const el = canvas.current;
    const tier = TIER[quality];
    let disposed = false;
    let tops: number[] = [];
    let lastPos = -1;

    const measure = () => {
      tops = CHAPTERS.map((c) => {
        const s = document.getElementById(c.id);
        return s ? s.getBoundingClientRect().top + window.scrollY : 0;
      });
    };
    const resize = () => {
      cloud.current?.resize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
      measure();
      lastPos = -1;
    };
    const onPointer = (e: PointerEvent) => {
      cloud.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    let acc = 0;
    let samples = 0, slow = 0, lowPower = false;
    const tick = (_t: number, deltaMs: number) => {
      const c = cloud.current;
      if (!c || document.hidden) return;
      /* Auto low-power: if the first ~3 s of frames run long, stop the idle
         animation and drop all blurs (html[data-perf="low"], story.css). */
      if (!lowPower && samples < 180) {
        samples++;
        if (deltaMs > 28) slow++;
        if (samples === 180 && slow > 70) {
          lowPower = true;
          document.documentElement.dataset.perf = 'low';
        }
      }
      const pos = positionRef.current ?? chapterPosition(tops);
      c.setScroll(pos);
      const moved = Math.abs(pos - lastPos) > 1e-4;
      const still = !motionRef.current || lowPower;
      acc += deltaMs;
      // Still: draw only when the scroll position changes. Moving: ~30 fps,
      // or immediately when the visitor scrolls.
      if (still ? !moved : !moved && acc < FRAME_MS) return;
      const dt = Math.min(acc, 50) / 1000;
      acc = 0;
      lastPos = pos;
      c.frame(dt, !still);
    };

    const start = async () => {
      const { PointCloud } = await import('../three/PointCloud');
      if (disposed) return;
      try {
        cloud.current = new PointCloud({
          canvas: el,
          count: tier.count,
          dpr: Math.min(window.devicePixelRatio || 1, tier.dpr),
          dark: document.documentElement.dataset.theme === 'dark',
          set,
          dimAfterFirst: set === 'home',
        });
      } catch {
        return;   // WebGL refused at runtime — the page is complete without it
      }
      const style = document.documentElement.dataset.style;
      cloud.current.setDark(document.documentElement.dataset.theme === 'dark', style === 'editorial' ? 'warm' : undefined);
      resize();
      gsap.ticker.add(tick);
      setReady(true);
      /* Panels switch to frosted glass while a cloud is live (story.css). */
      document.documentElement.dataset.cloud = 'on';
    };

    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const handle = idle(() => { void start(); });
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.fonts?.ready.then(measure);
    window.addEventListener('load', measure);

    return () => {
      disposed = true;
      if (window.cancelIdleCallback && typeof handle === 'number') window.cancelIdleCallback(handle);
      gsap.ticker.remove(tick);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('load', measure);
      cloud.current?.dispose();
      cloud.current = null;
      delete document.documentElement.dataset.cloud;
    };
  }, [quality, set]);

  if (quality === 0) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="cloud-layer pointer-events-none fixed inset-0 z-0 h-full w-full transition-opacity duration-[1500ms]"
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
}
