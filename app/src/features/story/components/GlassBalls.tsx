import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { lenis } from '@/shared/lib/lenis';
import { currentTone, paintBubble } from '@/features/chat/lib/bubble';

/* Glass balls floating behind the chapters, so scrolling is visible as depth.
 *
 * Each ball is painted once onto its own canvas (the same bubble as the Nexus
 * mark, with a clear core) and then only moved: on GSAP's ticker, which also
 * drives Lenis, every ball rises at its own rate with the scroll position and
 * wraps around the viewport, so there are always a few in view on a long page.
 * Far balls are smaller, slower and slightly blurred. Motion off → they stay
 * where they are; low-perf mode keeps only the near ones.
 *
 * The liquid theme hides the balls (seen through frosted glass they read as
 * smudges) and shows .ground-drift instead: its blue ribbons, taller than the
 * screen, slide up as the page scrolls, so the glass has moving light behind it. */

const BALLS = [
  { x: 6,  y: 18,  size: 220, depth: 0.55, blur: 0 },
  { x: 82, y: 8,   size: 120, depth: 0.32, blur: 1.5 },
  { x: 70, y: 62,  size: 280, depth: 0.7,  blur: 0 },
  { x: 30, y: 78,  size: 70,  depth: 0.2,  blur: 3 },
  { x: 48, y: 36,  size: 54,  depth: 0.15, blur: 4 },
  { x: 92, y: 92,  size: 160, depth: 0.45, blur: 1 },
];

export default function GlassBalls() {
  const layer = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLDivElement>('.glass-ball'));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const paint = () => nodes.forEach((node, i) => {
      const cv = node.firstElementChild as HTMLCanvasElement;
      cv.width = cv.height = Math.round(BALLS[i].size * dpr);
      const ctx = cv.getContext('2d');
      if (ctx) paintBubble(ctx, cv.width, i * 1.7, false, currentTone());
    });
    paint();
    // Repaint in the new theme's tone when the theme changes.
    const themeWatch = new MutationObserver(paint);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });

    const place = () => {
      const moving = document.documentElement.dataset.motion !== 'off';
      const scroll = moving ? lenis.scroll : 0;
      const vh = window.innerHeight;
      nodes.forEach((node, i) => {
        const b = BALLS[i];
        const span = vh + b.size * 2;
        const start = (b.y / 100) * vh + b.size;
        const y = ((((start - scroll * b.depth) % span) + span) % span) - b.size;
        node.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) rotate(${(scroll * b.depth * 0.04).toFixed(1)}deg)`;
      });
      if (ground.current) {
        const progress = lenis.limit > 0 ? Math.min(scroll / lenis.limit, 1) : 0;
        ground.current.style.transform = `translate3d(0, ${(-progress * 0.4 * vh).toFixed(1)}px, 0)`;
      }
    };

    place();
    gsap.ticker.add(place);
    window.addEventListener('resize', place);
    return () => {
      gsap.ticker.remove(place);
      themeWatch.disconnect();
      window.removeEventListener('resize', place);
    };
  }, []);

  return (
    <div ref={layer} className="glass-balls" aria-hidden>
      <div ref={ground} className="ground-drift" />
      {BALLS.map((b, i) => (
        <div
          key={i}
          className="glass-ball"
          data-far={b.depth < 0.4 || undefined}
          style={{ left: `${b.x}%`, width: b.size, height: b.size, marginLeft: -b.size / 2, filter: b.blur ? `blur(${b.blur}px)` : undefined }}
        >
          <canvas style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      ))}
    </div>
  );
}
