import Lenis from 'lenis'

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

function raf(time: number) {
  lenis.raf(time)
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)
