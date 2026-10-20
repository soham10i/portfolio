import { useEffect, useRef, useState } from 'react';

/* The localization project's interactive run viewer: the <ei-viewer> web
 * component from the project repository (public/ei-viewer.js), loaded on
 * demand. It replays a run — particles, estimate, beacons, RSSI and error
 * charts — and follows the site's light/dark theme via html[data-theme]. */

let loader: Promise<void> | null = null;
function loadViewer(): Promise<void> {
  if (customElements.get('ei-viewer')) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/ei-viewer.js';
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error('viewer failed to load')); };
    document.head.appendChild(s);
  });
  return loader;
}

export default function RunViewer({ runs }: { runs: { label: string; src: string }[] }) {
  const host = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    loadViewer().then(() => {
      if (dead || !host.current) return;
      const v = document.createElement('ei-viewer');
      v.setAttribute('src', runs[0].src);
      v.setAttribute('autoplay', '');
      v.style.setProperty('--ev-font', 'var(--font-display)');
      host.current.appendChild(v);
      el.current = v;
    }).catch(() => setFailed(true));
    return () => { dead = true; el.current?.remove(); el.current = null; };
  }, [runs]);

  const pick = (i: number) => { setActive(i); el.current?.setAttribute('src', runs[i].src); };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {runs.map((r, i) => (
          <button key={r.src} type="button" onClick={() => pick(i)} aria-pressed={i === active}
            className={'h-10 rounded-full border px-4 text-[13.5px] transition-colors ' +
              (i === active ? 'border-transparent bg-[color:var(--fg)] text-[color:var(--on-fg)]' : 'border-[color:var(--line)] text-fg2 hover:text-fg')}>
            {r.label}
          </button>
        ))}
      </div>
      {failed ? <p className="text-[14px] text-fg3">The viewer could not be loaded.</p> : <div ref={host} />}
    </div>
  );
}
