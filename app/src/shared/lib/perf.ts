/* Low-power mode for phones and modest hardware.
 *
 * The desktop look leans on effects a phone GPU pays for on every frame:
 * backdrop blur under the fixed bars, the shader-drawn Nexus orbs, glass
 * balls moving with the scroll and a blurred halo behind all body text.
 * On a touch device, a small screen, few cores, little memory or Data
 * Saver, html[data-perf="low"] is set before React mounts and story.css,
 * GlassBalls and JarvisOrb drop those effects. Content and layout stay the
 * same. CloudLayer can still switch it on later if it measures a slow frame
 * rate. */
export function detectLowPerf(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return (
    mq('(pointer: coarse)') ||
    mq('(max-width: 820px)') ||
    (nav.hardwareConcurrency ?? 8) <= 4 ||
    (nav.deviceMemory ?? 8) <= 4 ||
    nav.connection?.saveData === true
  );
}

export const isLowPerf = () => document.documentElement.dataset.perf === 'low';

export function applyPerfMode() {
  if (detectLowPerf()) document.documentElement.dataset.perf = 'low';
}
