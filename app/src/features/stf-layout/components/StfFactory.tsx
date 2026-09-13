import { useEffect, useRef } from 'react';

/* React wrapper for the <stf-factory-3d> custom element.
   The engine (public/stf-factory-3d.js) owns the scene, the trajectory and the
   render loop; this page owns which run is loaded, transport state and which
   stations are visible. The engine loads its run once on connect, so changing
   `run` remounts it — that is deliberate, a run swap is a different model. */

export type StationId = 'hbw' | 'vgr' | 'mpo' | 'sld';

export interface StepEvent {
  t: number;
  station: string | null;
  step: number | null;
  note: string;
}
export interface RunReport {
  source: string;
  sim_seconds: number | null;
  events: StepEvent[];
  checks: { name: string; ok: boolean }[];
  moves: { label: string; axis?: string; error_mm?: number; ok?: boolean; skipped: boolean }[];
  passed: number;
  total: number;
}
export interface TrajMeta {
  source: string; fps: number; frames: number; width: number; duration: number;
  names: string[]; solver_frames: number; max_quant_error: number;
  max_quant_error_channel: string;
}
export interface ReadyDetail { meta: TrajMeta; joints: string[]; report: RunReport | null }
export interface TickDetail {
  t: number; duration: number; stepIndex: number; step: StepEvent | null; stepChanged: boolean;
}

interface FactoryElement extends HTMLElement {
  playing: boolean; speed: number; time: number; duration: number;
  setStationVisible(id: StationId, on: boolean): void;
  focusStation(id: StationId | null): void;
  seekStep(i: number): void;
}

export interface StfFactoryProps {
  run: string;
  dir?: string;
  playing?: boolean;
  speed?: number;
  seek?: { t: number } | null;
  seekStep?: { i: number } | null;
  focusOn?: { id: StationId | null } | null;
  hidden?: Partial<Record<StationId, boolean>>;
  className?: string;
  onReady?: (d: ReadyDetail) => void;
  onError?: (message: string) => void;
  onTick?: (d: TickDetail) => void;
  onSelect?: (station: StationId | null, body: string) => void;
}

let enginePromise: Promise<void> | null = null;
function loadEngine(): Promise<void> {
  if (customElements.get('stf-factory-3d')) return Promise.resolve();
  if (!enginePromise) {
    enginePromise = new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = '/stf-factory-3d.js';
      s.onload = () => res();
      s.onerror = () => rej(new Error('could not load /stf-factory-3d.js'));
      document.head.appendChild(s);
    });
  }
  return enginePromise;
}

export default function StfFactory({
  run, dir = '/sim/', playing = true, speed = 1,
  seek = null, seekStep = null, focusOn = null, hidden,
  className, onReady, onError, onTick, onSelect,
}: StfFactoryProps) {
  const host = useRef<HTMLDivElement>(null);
  const el = useRef<FactoryElement | null>(null);
  const cb = useRef({ onReady, onError, onTick, onSelect });
  cb.current = { onReady, onError, onTick, onSelect };

  useEffect(() => {
    let dead = false;
    loadEngine().then(() => {
      if (dead || !host.current) return;
      const node = document.createElement('stf-factory-3d') as unknown as FactoryElement;
      node.setAttribute('run', run);
      node.setAttribute('data-dir', dir);
      node.style.position = 'absolute';
      node.style.inset = '0';
      node.addEventListener('factory-ready', e =>
        cb.current.onReady?.((e as CustomEvent).detail));
      node.addEventListener('factory-error', e =>
        cb.current.onError?.((e as CustomEvent).detail.message));
      node.addEventListener('factory-tick', e =>
        cb.current.onTick?.((e as CustomEvent).detail));
      node.addEventListener('factory-select', e => {
        const d = (e as CustomEvent).detail;
        cb.current.onSelect?.(d.station, d.body);
      });
      host.current.appendChild(node);
      el.current = node;
    }).catch(err => cb.current.onError?.(String(err.message ?? err)));
    return () => { dead = true; el.current?.remove(); el.current = null; };
  }, [run, dir]);

  useEffect(() => { if (el.current) el.current.playing = playing; }, [playing]);
  useEffect(() => { if (el.current) el.current.speed = speed; }, [speed]);
  useEffect(() => { if (el.current && seek) el.current.time = seek.t; }, [seek]);
  useEffect(() => { if (el.current && seekStep) el.current.seekStep(seekStep.i); }, [seekStep]);
  useEffect(() => { if (el.current && focusOn) el.current.focusStation(focusOn.id); }, [focusOn]);
  useEffect(() => {
    if (!el.current) return;
    (['hbw', 'vgr', 'mpo', 'sld'] as StationId[])
      .forEach(id => el.current!.setStationVisible(id, !hidden?.[id]));
  }, [hidden]);

  /* No inline position: the caller positions this box with `className`, and an
     inline style would win over that class and collapse the canvas. */
  return <div ref={host} className={className} />;
}
