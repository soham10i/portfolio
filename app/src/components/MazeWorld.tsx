import { useEffect, useRef } from 'react';
import { loadMazeEngine } from '@/lib/twin';

/* React wrapper for the <webots-world-3d> custom element.
   The engine (public/webots-world-3d.js) owns all rendering, the exploration
   loop and the ROSBot POV viewport. This component only mounts it and mirrors
   React state onto attributes — the host page owns the HUD and control bar. */

export type MazeKey = 'maze1' | 'maze2' | 'maze3' | 'maze4' | 'maze5';

export interface SimState {
  state: string;
  simTime: number;
  dist: number;
  coverage: number;
  occ: number;
  pathLen: number;
  blue: boolean;
  yellow: boolean;
}

export interface MazeWorldProps {
  maze: MazeKey;
  playing?: boolean;
  speed?: number;
  lidar?: boolean;
  plan?: boolean;
  fpv?: boolean;
  /** Bump this number to reset the run in place. */
  resetToken?: number;
  accent?: string;
  className?: string;
  /** Fires once, when the renderer's first frame is up. */
  onReady?: () => void;
  /** Fires on every world load — including each `maze` switch. */
  onWorldLoaded?: () => void;
  onError?: (err: Error) => void;
  /** Live sim payload. Throttle in the host — the engine emits at ~5 Hz. */
  onState?: (s: SimState) => void;
}

export default function MazeWorld({
  maze,
  playing = true,
  speed = 1,
  lidar = true,
  plan = true,
  fpv = false,
  resetToken = 0,
  accent = '#22d3ee',
  className,
  onReady,
  onWorldLoaded,
  onError,
  onState,
}: MazeWorldProps) {
  const host = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLElement | null>(null);

  // Keep callbacks in refs so the element is mounted exactly once.
  const cb = useRef({ onReady, onWorldLoaded, onError, onState });
  cb.current = { onReady, onWorldLoaded, onError, onState };

  useEffect(() => {
    let dead = false;
    loadMazeEngine()
      .then(() => {
        if (dead || !host.current) return;
        const node = document.createElement('webots-world-3d');
        node.setAttribute('accent', accent);
        node.setAttribute('playing', playing ? '1' : '0');
        node.setAttribute('speed', String(speed));
        node.setAttribute('lidar', lidar ? '1' : '0');
        node.setAttribute('path', plan ? '1' : '0');
        node.setAttribute('fpv', fpv ? '1' : '0');
        node.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        node.addEventListener('twin-ready', () => cb.current.onReady?.());
        node.addEventListener('world-loaded', () => cb.current.onWorldLoaded?.());
        node.addEventListener('twin-error', (e) =>
          cb.current.onError?.(new Error((e as CustomEvent<{ message: string }>).detail.message)),
        );
        node.addEventListener('sim-state', (e) =>
          cb.current.onState?.((e as CustomEvent<SimState>).detail),
        );
        host.current.appendChild(node);
        el.current = node;
        node.setAttribute('src', `/worlds/${maze}-world.json`);
      })
      .catch((err: Error) => {
        if (!dead) cb.current.onError?.(err);
      });

    return () => {
      dead = true;
      el.current?.remove();
      el.current = null;
    };
    // Mount once; every prop below is mirrored by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { el.current?.setAttribute('src', `/worlds/${maze}-world.json`); }, [maze]);
  useEffect(() => { el.current?.setAttribute('playing', playing ? '1' : '0'); }, [playing]);
  useEffect(() => { el.current?.setAttribute('speed', String(speed)); }, [speed]);
  useEffect(() => { el.current?.setAttribute('lidar', lidar ? '1' : '0'); }, [lidar]);
  useEffect(() => { el.current?.setAttribute('path', plan ? '1' : '0'); }, [plan]);
  useEffect(() => { el.current?.setAttribute('fpv', fpv ? '1' : '0'); }, [fpv]);
  useEffect(() => { el.current?.setAttribute('accent', accent); }, [accent]);
  useEffect(() => {
    if (!resetToken) return;
    el.current?.setAttribute('reset', String(resetToken));
  }, [resetToken]);

  return <div ref={host} className={className ?? 'absolute inset-0'} />;
}
