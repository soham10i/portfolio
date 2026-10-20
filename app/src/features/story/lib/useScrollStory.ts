import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { lenis } from '@/shared/lib/lenis';
import { CHAPTERS } from './chapters';
import { useStory } from './store';

/* Wires the page's scroll into the story store and runs the generic reveals.
 *
 *  - one trigger per chapter section → `chapter`
 *  - one trigger over the whole document → `progress`
 *  - every [data-reveal] element rises in once as it enters
 *
 * Everything is created inside a gsap.context scoped to `root`, so leaving the
 * page (or toggling motion, which rebuilds the reveals) reverts it cleanly. */
export function useScrollStory(root: RefObject<HTMLElement | null>) {
  const motion = useStory((s) => s.motion);

  /* Arriving from another route should start at the top, not wherever
     Lenis was left. Mount-only: a motion toggle must not move the page. */
  useLayoutEffect(() => {
    if (!window.location.hash) lenis.scrollTo(0, { immediate: true });
  }, []);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const { setChapter, setProgress } = useStory.getState();

    const ctx = gsap.context(() => {
      CHAPTERS.forEach((c, i) => {
        ScrollTrigger.create({
          trigger: `#${c.id}`,
          start: 'top center',
          end: 'bottom center',
          onToggle: (self) => { if (self.isActive) setChapter(i); },
        });
      });

      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => setProgress(self.progress),
      });

      const reveals = gsap.utils.toArray<HTMLElement>('[data-reveal]');
      if (motion) {
        reveals.forEach((r) => {
          gsap.to(r, {
            opacity: 1,
            y: 0,
            duration: 1.1,
            ease: 'expo.out',
            delay: Number(r.dataset.reveal) || 0,
            scrollTrigger: { trigger: r, start: 'top 90%', once: true },
          });
        });
      } else {
        gsap.set(reveals, { clearProps: 'opacity,transform' });
      }
    }, el);

    /* Fonts and images change section heights after first layout. */
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);

    return () => {
      window.removeEventListener('load', refresh);
      ctx.revert();
    };
  }, [root, motion]);
}
