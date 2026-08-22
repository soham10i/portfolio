/* Shared constants and engine loaders for the two 3D viewers.
   Kept out of the component files so those export components only — otherwise
   Vite's fast refresh gives up on them during development. */

export type StationId = 'hbw' | 'vgr1' | 'conveyor' | 'oven' | 'sensor' | 'sorter' | 'vgr2';

export const STATIONS: { id: StationId; name: string }[] = [
  { id: 'hbw', name: 'High-Bay Warehouse' },
  { id: 'vgr1', name: 'Vacuum Gripper Robot 1' },
  { id: 'conveyor', name: 'Conveyor Belt' },
  { id: 'oven', name: 'Processing Oven' },
  { id: 'sensor', name: 'Color Sensor' },
  { id: 'sorter', name: 'Sorting Station' },
  { id: 'vgr2', name: 'Sort Gripper Robot' },
];

/* Mirrors PHASES in public/factory-twin-3d.js so the page can render its
   timeline before the engine script has finished loading. Keep in sync. */
export const PHASES: [string, number][] = [
  ['idle', 1.5], ['picking', 2], ['moving', 3], ['baking', 4],
  ['cooling', 1.5], ['detecting', 1], ['sorting', 2], ['storing', 1.5],
];

export const CYCLE_TOTAL = PHASES.reduce((a, p) => a + p[1], 0); // 16.5 s

/** Phase boundaries as absolute offsets, for the footer segment bar. */
export const PHASE_SEGMENTS: { name: string; d: number; start: number }[] =
  PHASES.reduce<{ name: string; d: number; start: number }[]>((acc, [name, d]) => {
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].d : 0;
    return [...acc, { name, d, start }];
  }, []);

export function phaseAt(t: number): { name: string; p: number } {
  let x = ((t % CYCLE_TOTAL) + CYCLE_TOTAL) % CYCLE_TOTAL;
  for (const [name, d] of PHASES) {
    if (x < d) return { name, p: x / d };
    x -= d;
  }
  return { name: 'storing', p: 1 };
}

function scriptLoader(src: string) {
  let promise: Promise<void> | null = null;
  return (defined: () => boolean) => {
    if (defined()) return Promise.resolve();
    if (!promise) {
      promise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
        const s = existing ?? document.createElement('script');
        s.addEventListener('load', () => resolve());
        s.addEventListener('error', () => {
          promise = null;
          reject(new Error(`failed to load ${src}`));
        });
        if (!existing) {
          s.src = src;
          s.async = true;
          document.head.appendChild(s);
        }
      });
    }
    return promise;
  };
}

const twinLoader = scriptLoader('/factory-twin-3d.js');
const mazeLoader = scriptLoader('/webots-world-3d.js');

export const loadTwinEngine = () => twinLoader(() => !!customElements.get('factory-twin-3d'));
export const loadMazeEngine = () => mazeLoader(() => !!customElements.get('webots-world-3d'));
