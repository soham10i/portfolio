import { useEffect, useRef } from 'react';
import { loadTwinEngine, type StationId } from '@/lib/twin';

/* React wrapper for the <factory-twin-3d> custom element.
   The engine (public/factory-twin-3d.js) owns the STF cell geometry, the
   production-cycle animation, hover labels and picking. The host page owns the
   phase clock and pushes it in as `t`, so the scrubber and the 3D scene can
   never drift apart. */

export interface FactoryTwinProps {
  /** Absolute sim time in seconds. The host owns the clock. */
  t: number;
  playing?: boolean;
  speed?: number;
  selected?: StationId | null;
  grid?: boolean;
  accent?: string;
  primary?: string;
  className?: string;
  onReady?: () => void;
  onError?: (err: Error) => void;
  onSelect?: (s: { id: StationId; name: string }) => void;
}

export default function FactoryTwin({
  t,
  playing = true,
  speed = 1,
  selected = null,
  grid = true,
  accent = '#22d3ee',
  primary = '#5ea2ff',
  className,
  onReady,
  onError,
  onSelect,
}: FactoryTwinProps) {
  const host = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLElement | null>(null);

  const cb = useRef({ onReady, onError, onSelect });
  cb.current = { onReady, onError, onSelect };

  useEffect(() => {
    let dead = false;
    loadTwinEngine()
      .then(() => {
        if (dead || !host.current) return;
        const node = document.createElement('factory-twin-3d');
        node.setAttribute('accent', accent);
        node.setAttribute('primary', primary);
        node.setAttribute('grid', grid ? '1' : '0');
        node.setAttribute('playing', playing ? '1' : '0');
        node.setAttribute('speed', String(speed));
        node.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        node.addEventListener('twin-ready', () => cb.current.onReady?.());
        node.addEventListener('twin-error', (e) =>
          cb.current.onError?.(new Error((e as CustomEvent<{ message: string }>).detail.message)),
        );
        node.addEventListener('twin-select', (e) =>
          cb.current.onSelect?.((e as CustomEvent<{ id: StationId; name: string }>).detail),
        );
        host.current.appendChild(node);
        el.current = node;
      })
      .catch((err: Error) => {
        if (!dead) cb.current.onError?.(err);
      });

    return () => {
      dead = true;
      el.current?.remove();
      el.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { el.current?.setAttribute('t', t.toFixed(3)); }, [t]);
  useEffect(() => { el.current?.setAttribute('playing', playing ? '1' : '0'); }, [playing]);
  useEffect(() => { el.current?.setAttribute('speed', String(speed)); }, [speed]);
  useEffect(() => { el.current?.setAttribute('grid', grid ? '1' : '0'); }, [grid]);
  useEffect(() => { el.current?.setAttribute('accent', accent); }, [accent]);
  useEffect(() => { el.current?.setAttribute('primary', primary); }, [primary]);
  useEffect(() => {
    if (selected) el.current?.setAttribute('selected', selected);
    else el.current?.removeAttribute('selected');
  }, [selected]);

  return <div ref={host} className={className ?? 'absolute inset-0'} />;
}
