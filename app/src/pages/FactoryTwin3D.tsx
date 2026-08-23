import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pause, Play, RotateCcw, X } from 'lucide-react';
import FactoryTwin from '@/components/FactoryTwin';
import {
  CYCLE_TOTAL,
  PHASE_SEGMENTS,
  STATIONS,
  phaseAt,
  type StationId,
} from '@/lib/twin';
import { PALETTES, applyPalette, readStoredPalette, type PaletteKey } from '@/lib/palettes';

/* Full-page Smart Tabletop Factory cell viewer.
   The <factory-twin-3d> engine renders the cell; this page owns the phase
   clock and pushes it in as `t`, so the scrubber and the 3D scene stay locked. */

const BIN_COLORS = ['#ef4444', '#22c55e', '#3b82f6'];
const BIN_NAMES = ['Red', 'Green', 'Blue'];

/* Oven temperature is a per-phase function, not a single global ramp. */
const OVEN_RANGE: Record<string, [number, number]> = {
  idle: [25, 25],
  picking: [25, 40],
  moving: [40, 120],
  baking: [120, 186],
  cooling: [186, 96],
  detecting: [96, 62],
  sorting: [62, 40],
  storing: [40, 25],
};
const CONVEYOR_SPEED: Record<string, number> = {
  idle: 0, picking: 0, moving: 0.3, baking: 0,
  cooling: 0, detecting: 0.12, sorting: 0.18, storing: 0,
};

interface MqttEntry { id: number; topic: string; payload: string; at: string }

const STATION_DETAIL: Record<StationId, { desc: string; metrics: [string, string][] }> = {
  hbw: { desc: 'Automated storage, 3×3 shelf grid. Holds raw bases and sorted finished parts.', metrics: [['Capacity', '9 slots'], ['Load', '6/9'], ['Access', '~3 s']] },
  vgr1: { desc: '4-DOF arm with vacuum suction gripper. Moves stock from the rack onto the belt.', metrics: [['DOF', '4'], ['Payload', '200 g'], ['Cycle', '4 s']] },
  conveyor: { desc: 'DC belt with encoder feedback. Transports parts between stations.', metrics: [['Length', '450 mm'], ['Max speed', '0.3 m/s'], ['Encoder', '360 PPR']] },
  oven: { desc: 'Heating station with temperature control and a safety interlock.', metrics: [['Max temp', '200 °C'], ['Setpoint', '180 °C'], ['Dwell', '4 s']] },
  sensor: { desc: 'RGB reflective colour module. Classifies the part for the sorting decision.', metrics: [['Type', 'RGB reflective'], ['Range', '5–20 mm'], ['Accuracy', '>95 %']] },
  sorter: { desc: '3-way pneumatic diverter routing parts into colour-matched bins.', metrics: [['Channels', '3'], ['Actuator', 'Pneumatic'], ['Sort time', '1.5 s']] },
  vgr2: { desc: 'Secondary gripper that returns sorted parts into high-bay storage.', metrics: [['DOF', '3'], ['Payload', '150 g'], ['Mode', 'Standby']] },
};

const ACTIVE_BY_PHASE: Record<string, StationId[]> = {
  idle: [], picking: ['hbw', 'vgr1'], moving: ['conveyor'], baking: ['oven'],
  cooling: ['oven'], detecting: ['sensor'], sorting: ['sorter'], storing: ['vgr2', 'hbw'],
};

function Gauge({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-fg3">{label}</span>
        <span className="font-mono text-[11.5px] text-fg">{value}</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surf2">
        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: tone }} />
      </div>
    </div>
  );
}

export default function FactoryTwin3D() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<StationId | null>(null);
  const [loading, setLoading] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [source, setSource] = useState<'three' | 'webots'>('three');
  const [mqtt, setMqtt] = useState<MqttEntry[]>([]);

  /* Same palette as the rest of the site; the engine takes accent/primary. */
  const [palette] = useState<PaletteKey>(readStoredPalette);
  useEffect(() => { applyPalette(palette); }, [palette]);
  const ACCENT = PALETTES[palette].a;
  const PRIMARY = PALETTES[palette].p;

  /* Host-owned clock. The engine runs its own rAF and interpolates between
     pushes, so React only needs to tick at 10 Hz — re-rendering this page on
     every engine frame would cost far more than it buys. Both idle together in
     a background tab; that is intended, not a bug to patch with a timer. */
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.5);
      last = now;
      setT((prev) => prev + dt * speed);
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const { name: phase, p: phaseProgress } = phaseAt(t);
  const cycle = Math.floor(t / CYCLE_TOTAL);
  const binIdx = ((cycle % 3) + 3) % 3;
  const produced = Math.max(0, cycle);
  const perHour = Math.round(3600 / CYCLE_TOTAL);

  const [lo, hi] = OVEN_RANGE[phase] ?? [25, 25];
  const ovenTemp = lo + (hi - lo) * phaseProgress;
  const beltSpeed = CONVEYOR_SPEED[phase] ?? 0;
  const detected = phase === 'detecting' || phase === 'sorting' || phase === 'storing';
  const confidence = detected ? 0.95 + 0.04 * Math.sin(t * 3) : 0;

  /* MQTT log — one line per phase transition, not per frame. */
  const lastPhase = useRef<string>('');
  const seq = useRef(0);
  useEffect(() => {
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    const entry: MqttEntry = {
      id: seq.current++,
      topic: `stf/cell01/${phase}`,
      payload: JSON.stringify({ phase, cycle, bin: BIN_NAMES[binIdx].toLowerCase() }),
      at: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    };
    setMqtt((m) => [entry, ...m].slice(0, 40));
  }, [phase, cycle, binIdx]);

  const onReady = useCallback(() => setLoading(false), []);
  const onError = useCallback((e: Error) => { setEngineError(e.message); setLoading(false); }, []);
  const onSelect = useCallback((s: { id: StationId }) => setSelected(s.id), []);

  const activeIds = ACTIVE_BY_PHASE[phase] ?? [];
  const cyclePos = ((t % CYCLE_TOTAL) + CYCLE_TOTAL) % CYCLE_TOTAL;

  const seek = (value: number) => {
    const base = Math.floor(t / CYCLE_TOTAL) * CYCLE_TOTAL;
    setT(base + value);
  };

  const detail = selected ? STATION_DETAIL[selected] : null;
  const selectedName = selected ? STATIONS.find((s) => s.id === selected)?.name : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      {/* Header */}
      <header className="flex min-h-[60px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 sm:h-[60px] sm:flex-nowrap sm:px-[22px] sm:py-0">
        <div className="flex items-center gap-4">
          <Link to="/project/digital-twin-smart-factory-2" className="inline-flex items-center gap-1.5 text-[13px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" />
            Project
          </Link>
          <span className="hidden h-5 w-px bg-surf2 sm:block" />
          <div>
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-fg sm:text-[14.5px]">Smart Tabletop Factory — digital twin</p>
            <p className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg3 sm:block">FISCHERTECHNIK 536634 · CELL 01 · WS://STF-GATEWAY</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden gap-1 rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] p-[3px] sm:flex">
            {(['three', 'webots'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSource(s)}
                className={'rounded-[7px] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ' + (source === s ? 'bg-[color-mix(in_oklab,var(--a)_20%,transparent)] text-fg' : 'text-fg3 hover:text-fg2')}>
                {s === 'three' ? 'Three.js twin' : 'Webots export'}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ background: 'rgba(34,197,94,.10)', color: '#4ade80' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            Stream live
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-fg2">10 Hz</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[#05070d]">
          {source === 'webots' ? (
            <div className="absolute inset-0 grid place-items-center px-8 text-center">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg2">Webots export not wired</p>
                <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-fg3">
                  This tab is reserved for a recorded Webots HTML5 animation export. Nothing is
                  bundled for it yet — see <code className="font-mono">docs/webots-export.md</code>.
                  Switch back to the Three.js twin for the live cell.
                </p>
                <button type="button" onClick={() => setSource('three')} className="mt-4 rounded-full border border-[color-mix(in_oklab,var(--a)_50%,transparent)] px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-a transition-colors hover:bg-[color-mix(in_oklab,var(--a)_10%,transparent)]">
                  Back to live twin
                </button>
              </div>
            </div>
          ) : engineError ? (
            <div className="absolute inset-0 grid place-items-center px-8 text-center">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-rose-300">3D engine failed to load</p>
                <p className="mt-2 text-[12.5px] text-fg3">{engineError}</p>
                <p className="mt-1 text-[12.5px] text-fg3">The engine loads Three.js r147 from <code className="font-mono">public/vendor/</code>, falling back to unpkg — check that both are reachable.</p>
              </div>
            </div>
          ) : (
            <>
              <FactoryTwin t={t} playing={playing} speed={speed} selected={selected} accent={ACCENT} primary={PRIMARY} onReady={onReady} onError={onError} onSelect={onSelect} />

              {/* Phase chip */}
              <div className="pointer-events-none absolute left-4 top-3.5 inline-flex items-center gap-2 rounded-[9px] border border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} />
                <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-fg">{phase}</span>
                <span className="font-mono text-[11px] text-fg3">{Math.round(phaseProgress * 100)}%</span>
              </div>

              {/* Station inspector */}
              {selected && detail && (
                <div className="absolute right-4 top-3.5 w-[250px] rounded-[14px] border border-line p-4" style={{ background: 'rgba(20,27,46,.74)', backdropFilter: 'blur(18px) saturate(180%)', WebkitBackdropFilter: 'blur(18px) saturate(180%)', boxShadow: '0 22px 44px -18px rgba(0,0,0,.6)', animation: 'fadeIn .25s ease both' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold leading-snug text-fg">{selectedName}</p>
                    <button type="button" onClick={() => setSelected(null)} aria-label="Close inspector" className="shrink-0 rounded-md p-1 text-fg3 transition-colors hover:text-fg">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-fg2">{detail.desc}</p>
                  <dl className="mt-3 space-y-1.5 border-t border-line pt-3">
                    {detail.metrics.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3">
                        <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg3">{k}</dt>
                        <dd className="font-mono text-[11px] text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Hints */}
              <div className="pointer-events-none absolute bottom-3.5 left-4 flex flex-wrap gap-1.5">
                {['Drag to orbit', 'Scroll to zoom', 'Click a station'].map((h) => (
                  <span key={h} className="rounded-[7px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-fg3">{h}</span>
                ))}
              </div>

              {loading && (
                <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(10,15,30,.92)' }}>
                  <div className="text-center">
                    <div className="mx-auto h-[34px] w-[34px] animate-spin rounded-full border-2 border-line border-t-a" />
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-fg2">Loading cell geometry</p>
                    <p className="mt-1 text-[11.5px] text-fg3">Fischertechnik 536634 · 7 stations</p>
                    <div className="mx-auto mt-3 h-[3px] w-[220px] overflow-hidden rounded-full bg-surf2">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-[color-mix(in_oklab,var(--a)_60%,transparent)]" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Telemetry rail */}
        <aside className="hidden w-[308px] shrink-0 overflow-y-auto border-l border-line p-4 lg:block">
          <div className="grid grid-cols-2 gap-2">
            {[['Produced', String(produced)], ['Per hour', String(perHour)]].map(([k, v]) => (
              <div key={k} className="rounded-[12px] border border-line bg-surf2 p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-fg3">{k}</p>
                <p className="mt-1 font-mono text-[20px] leading-none text-fg">{v}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3.5">
            <Gauge label="Oven temperature" value={`${ovenTemp.toFixed(0)} °C`} pct={(ovenTemp / 200) * 100} tone="#f97316" />
            <Gauge label="Conveyor speed" value={`${beltSpeed.toFixed(2)} m/s`} pct={(beltSpeed / 0.3) * 100} tone={PRIMARY} />
            <Gauge label="Phase progress" value={`${Math.round(phaseProgress * 100)} %`} pct={phaseProgress * 100} tone={ACCENT} />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-[12px] border border-line bg-surf2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: detected ? BIN_COLORS[binIdx] : 'rgba(255,255,255,.12)' }} />
              <span className="font-mono text-[11.5px] text-fg">{detected ? BIN_NAMES[binIdx] : '—'}</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg3">
              {detected ? `${(confidence * 100).toFixed(1)} %` : 'no read'}
            </span>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-fg3">MQTT</p>
            <div className="mt-2 max-h-[190px] space-y-1.5 overflow-y-auto rounded-[12px] border border-line bg-[color-mix(in_oklab,var(--bg)_60%,black)] p-2.5">
              {mqtt.length === 0 && <p className="font-mono text-[10.5px] text-fg3">waiting for messages…</p>}
              {mqtt.map((m) => (
                <div key={m.id} className="font-mono text-[10px] leading-relaxed">
                  <span className="text-fg3">{m.at} </span>
                  <span style={{ color: PRIMARY }}>{m.topic}</span>
                  <span className="block truncate text-fg3">{m.payload}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-fg3">Stations</p>
            <div className="mt-2 space-y-1">
              {STATIONS.map((s) => {
                const active = activeIds.includes(s.id);
                const isSel = selected === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setSelected(isSel ? null : s.id)}
                    className={'flex w-full items-center justify-between gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors ' + (isSel ? 'border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_10%,transparent)]' : 'border-line bg-surf2 hover:border-line')}>
                    <span className="truncate text-[12px] text-fg2">{s.name}</span>
                    <span className={'shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] ' + (active ? 'text-emerald-300' : 'text-fg3')}>
                      {active ? 'Active' : 'Idle'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line px-5 py-3">
        <button type="button" onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_20%,transparent)] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--a)_30%,transparent)]">
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => { setT(0); setMqtt([]); lastPhase.current = ''; }}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>

        <div className="min-w-[280px] flex-1">
          <div className="flex gap-[2px]">
            {PHASE_SEGMENTS.map((s) => {
              const on = s.name === phase;
              return (
                <div key={s.name} style={{ flexGrow: s.d }} className="group relative">
                  <div className={'h-1.5 rounded-full transition-colors ' + (on ? 'bg-a' : 'bg-surf2')} />
                  <span className={'mt-1 block truncate text-center font-mono text-[8.5px] uppercase tracking-[0.1em] ' + (on ? 'text-fg2' : 'text-fg3')}>
                    {s.name}
                  </span>
                </div>
              );
            })}
          </div>
          <input type="range" min={0} max={CYCLE_TOTAL} step={0.05} value={cyclePos}
            onChange={(e) => seek(parseFloat(e.target.value))}
            aria-label="Seek within the production cycle"
            className="twin-scrub mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-surf2 accent-a" />
        </div>

        <div className="flex gap-1 rounded-[9px] border border-line p-1">
          {[0.5, 1, 2].map((v) => (
            <button key={v} type="button" onClick={() => setSpeed(v)}
              className={'rounded-[6px] px-2.5 py-1 font-mono text-[10.5px] transition-colors ' + (speed === v ? 'bg-[color-mix(in_oklab,var(--a)_20%,transparent)] text-fg' : 'text-fg3 hover:text-fg2')}>
              {v}×
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
