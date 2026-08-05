import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useGSAP() {
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return scopeRef;
}

export function animateFadeUp(
  element: HTMLElement | null,
  delay: number = 0,
  duration: number = 0.8
) {
  if (!element) return;
  gsap.fromTo(
    element,
    { opacity: 0, y: 30 },
    { opacity: 1, y: 0, duration, delay, ease: 'power3.out' }
  );
}

export function animateFadeIn(
  element: HTMLElement | null,
  delay: number = 0,
  duration: number = 0.6
) {
  if (!element) return;
  gsap.fromTo(
    element,
    { opacity: 0 },
    { opacity: 1, duration, delay, ease: 'power2.out' }
  );
}

export function animateSlideIn(
  element: HTMLElement | null,
  direction: 'left' | 'right' = 'right',
  delay: number = 0
) {
  if (!element) return;
  const xOffset = direction === 'left' ? -50 : 50;
  gsap.fromTo(
    element,
    { opacity: 0, x: xOffset },
    { opacity: 1, x: 0, duration: 0.8, delay, ease: 'power3.out' }
  );
}

export function createScrollTrigger(
  element: HTMLElement | null,
  animation: gsap.TweenVars,
  triggerOptions?: ScrollTrigger.Vars
) {
  if (!element) return;

  return gsap.fromTo(
    element,
    { opacity: 0, y: 40, ...animation.from },
    {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: element,
        start: 'top 85%',
        toggleActions: 'play none none none',
        ...triggerOptions,
      },
      ...animation.to,
    }
  );
}
