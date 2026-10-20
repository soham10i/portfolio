/* Loads the <webots-world-3d> engine (public/webots-world-3d.js) once, on
   demand. It is a plain script that registers a custom element, so it is
   injected as a <script> rather than imported. */

let promise: Promise<void> | null = null;
const SRC = '/webots-world-3d.js';

export function loadMazeEngine(): Promise<void> {
  if (customElements.get('webots-world-3d')) return Promise.resolve();
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      const s = existing ?? document.createElement('script');
      s.addEventListener('load', () => resolve());
      s.addEventListener('error', () => {
        promise = null;
        reject(new Error(`failed to load ${SRC}`));
      });
      if (!existing) {
        s.src = SRC;
        s.async = true;
        document.head.appendChild(s);
      }
    });
  }
  return promise;
}
