import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useTheme } from '@/shared/lib/theme';
import { CHAPTERS } from '../lib/chapters';
import { useStory } from '../lib/store';
import type { PointCloud } from '../three/PointCloud';

/* Fixed WebGL layer behind the chapter panels: the scroll-morphing LIDAR point
 * cloud (../three). Loaded after first paint and only on devices that can run
 * it (quality tier ≥ 1); the panels above are slightly translucent so it shows
 * through. Motion off → it still follows the scroll but stops animating. */

const TIER = {
  1: { count: 2600, dpr: 1 },
  2: { count: 4500, dpr: 1.5 },
  3: { count: 7000, dpr: 2 },
} as const;

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

export default function CloudLayer() {
  const quality = useStory((s) => s.quality);
  const motion = useStory((s) => s.motion);
  const dark = useTheme((s) => s.theme) === 'dark';
  const canvas = useRef<HTMLCanvasElement>(null);
  const cloud = useRef<PointCloud | null>(null);
  const motionRef = useRef(motion);
  const [ready, setReady] = useState(false);

  useEffect(() => { motionRef.current = motion; }, [motion]);
  useEffect(() => { cloud.current?.setDark(dark); }, [dark]);

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
      cloud.current?.resize(window.innerWidth, window.innerHeight);
      measure();
      lastPos = -1;
    };
    const onPointer = (e: PointerEvent) => {
      cloud.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    const tick = (_t: number, deltaMs: number) => {
      const c = cloud.current;
      if (!c || document.hidden) return;
      const pos = chapterPosition(tops);
      c.setScroll(pos);
      const still = !motionRef.current;
      // Motion off: draw only when the scroll position changes.
      if (still && Math.abs(pos - lastPos) < 1e-4) return;
      lastPos = pos;
      c.frame(Math.min(deltaMs, 50) / 1000, !still);
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
        });
      } catch {
        return;   // WebGL refused at runtime — the page is complete without it
      }
      resize();
      gsap.ticker.add(tick);
      setReady(true);
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
    };
  }, [quality]);

  if (quality === 0) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full transition-opacity duration-[1500ms]"
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
}
