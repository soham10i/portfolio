/* Loads the maze engine on demand. The pure navigation math lives in
   /nav-core.js (unit-tested in app/test/nav-core.test.mjs) and must be on
   window before /webots-world-3d.js registers the custom element, so the two
   plain scripts are injected in order. */

let promise: Promise<void> | null = null;
const CORE_SRC = '/nav-core.js';
const SRC = '/webots-world-3d.js';

function loadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  });
}

export function loadMazeEngine(): Promise<void> {
  if (customElements.get('webots-world-3d')) return Promise.resolve();
  if (!promise) {
    promise = loadScript(CORE_SRC)
      .then(() => loadScript(SRC))
      .catch((err) => {
        promise = null;
        throw err;
      });
  }
  return promise;
}
