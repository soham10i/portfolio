import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { lenis } from '@/shared/lib/lenis';

/* Background ground layer: handles scroll drift for themes with moving backgrounds
 * (e.g. liquid-ground ribbons). Background bubbles have been removed for a cleaner,
 * distraction-free surface and better readability. */
export default function GlassBalls() {
  const layer = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = layer.current;
    if (!root) return;

    let lastScroll = NaN;
    let lastVh = NaN;
    const place = () => {
      const moving = document.documentElement.dataset.motion !== 'off';
      const scroll = moving ? lenis.scroll : 0;
      const vh = window.innerHeight;
      if (scroll === lastScroll && vh === lastVh) return;
      lastScroll = scroll;
      lastVh = vh;

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
      window.removeEventListener('resize', place);
    };
  }, []);

  return (
    <div ref={layer} className="glass-balls pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div ref={ground} className="ground-drift" />
    </div>
  );
}
