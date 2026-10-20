import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Single app-wide Lenis instance.
 *
 * Lenis intercepts wheel/touch globally and drives window scroll itself,
 * so any nested scrollable element needs `data-lenis-prevent` on it or
 * it will never receive those events (the page scrolls instead).
 *
 * Exported so overlays that behave like modals can call lenis.stop() /
 * lenis.start() to freeze the page behind them.
 */
export const lenis = new Lenis({
  duration: 1.2,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  touchMultiplier: 2,
})

/* Lenis runs on GSAP's ticker rather than its own requestAnimationFrame, so
   smooth scroll, ScrollTrigger and every tween advance in the same frame.
   With two loops the pinned sections lag the scroll by a frame and judder. */
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)

/** Motion off → native wheel scrolling; Lenis stays mounted so stop()/start()
    and scrollTo() keep working for the overlays that use them. */
export function setSmoothScroll(on: boolean) {
  lenis.options.smoothWheel = on
}
