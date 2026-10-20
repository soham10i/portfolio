import { useEffect, type RefObject } from 'react';
import { useStory } from './store';

/* Pointer-driven 3D tilt. Writes --rx / --ry (degrees) and --mx / --my (0–1,
   pointer position for a moving highlight) onto the element; CSS does the
   transform (.tilt in story.css). Off for touch pointers and when motion is off. */
export function useTilt(ref: RefObject<HTMLElement | null>, max = 8) {
  const motion = useStory((s) => s.motion);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motion || window.matchMedia('(pointer: coarse)').matches) return;

    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${(x - 0.5) * 2 * max}deg`);
        el.style.setProperty('--rx', `${(0.5 - y) * 2 * max}deg`);
        el.style.setProperty('--mx', String(x));
        el.style.setProperty('--my', String(y));
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      leave();
    };
  }, [ref, motion, max]);
}
