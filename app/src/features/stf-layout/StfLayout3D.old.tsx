import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Pause, Play, X } from 'lucide-react';
import StfFactory, {
  type ReadyDetail, type RunReport, type StationId, type StepEvent, type TickDetail, type TrajMeta,
} from '@/features/stf-layout/components/StfFactory';

/* The Smart Tabletop Factory, running.

   Both halves of what is on screen come out of the simulation rather than being
   drawn or animated by hand. The geometry is exported from the same MJCF MuJoCo
   compiles; the motion is the solver's own frames, resampled to 30 fps; and the
   step tape beside it is the run's own log of which PLC step it entered and
   when, so seeking a step seeks the motion with it.

   The checks panel prints the run's verdict on itself, failures included. The
   combined loop currently passes 7 of 14 — that number is read out of the run,
   not typed here, and it is supposed to be visible. */

const RUNS: { id: string; label: string; note: string }[] = [
  { id: 'factory', label: 'Full loop', note: 'all four stations, one order end to end' },
  { id: 'hbw', label: 'HBW', note: 'high-bay warehouse — two encoders, counted positions' },
  { id: 'vgr', label: 'VGR', note: 'suction gripper — three axes, scales solved not measured' },
  { id: 'mpo', label: 'MPO', note: 'oven and turntable — no encoders, bang-bang on switches' },
  { id: 'sld-white', label: 'SLD white', note: 'sorting line — camera, decision, ejector' },
  { id: 'sld-red', label: 'SLD red', note: 'sorting line — camera, decision, ejector' },
  { id: 'sld-blue', label: 'SLD blue', note: 'sorting line — camera, decision, ejector' },
];

const STATIONS: { id: StationId; name: string; colour: string }[] = [
  { id: 'hbw', name: 'High-bay warehouse', colour: '#2e9e4f' },
  { id: 'vgr', name: 'Suction gripper', colour: '#3d84e0' },
  { id: 'mpo', name: 'Oven + turntable', colour: '#e0a020' },
  { id: 'sld', name: 'Sorting line', colour: '#d4453f' },
];

const SPEEDS = [0.5, 1, 2, 4, 8];
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Head({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1.5 mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-fg3">{children}</h2>;
}

export default function StfLayout3D() {
  const [run, setRun] = useState('factory');
  const [ready, setReady] = useState<{ meta: TrajMeta; report: RunReport | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [stepIndex, setStepIndex] = useState(-1);
  const [hidden, setHidden] = useState<Partial<Record<StationId, boolean>>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [seek, setSeek] = useState<{ t: number } | null>(null);
  const [seekStep, setSeekStep] = useState<{ i: number } | null>(null);
  const [focusOn, setFocusOn] = useState<{ id: StationId | null } | null>(null);
  const tape = useRef<HTMLDivElement>(null);

  const onReady = useCallback((d: ReadyDetail) => {
    setReady({ meta: d.meta, report: d.report }); setError(null);
  }, []);
  const onTick = useCallback((d: TickDetail) => {
    setT(d.t);
    setStepIndex(d.stepIndex);
  }, []);
  const onSelect = useCallback((_s: StationId | null, body: string) => setSelected(body), []);

  useEffect(() => { document.title = 'STF — the factory running'; }, []);
  useEffect(() => { setT(0); setStepIndex(-1); setSelected(null); setReady(null); }, [run]);

  // keep the running step in view without fighting the user's own scrolling
  useEffect(() => {
    const node = tape.current?.querySelector('[data-active="1"]') as HTMLElement | null;
    if (node && playing) node.scrollIntoView({ block: 'nearest' });
  }, [stepIndex, playing]);

  const report = ready?.report ?? null;
  const meta = ready?.meta ?? null;
  const events: StepEvent[] = report?.events ?? [];
  const current = stepIndex >= 0 ? events[stepIndex] : null;
  const duration = meta?.duration ?? 0;
  const failed = useMemo(() => (report?.checks ?? []).filter(c => !c.ok), [report]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <header className="flex min-h-[60px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 sm:h-[60px] sm:flex-nowrap sm:px-[22px] sm:py-0">
        <div className="flex items-center gap-4">
          <Link to="/project/digital-twin" className="inline-flex items-center gap-1.5 text-[13px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Project
          </Link>
          <span className="hidden h-5 w-px bg-surf2 sm:block" />
          <div>
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-fg sm:text-[14.5px]">
              Smart Tabletop Factory — running
            </p>
            <p className="hidden text-[11px] text-fg3 sm:block">
              {meta
                ? `${meta.solver_frames.toLocaleString()} solver frames at ${meta.fps} fps · geometry and motion both out of the sim`
                : 'loading the run…'}
            </p>
          </div>
        </div>
        <Link to="/factory-twin" className="rounded-md border border-line px-2.5 py-1 text-[11.5px] text-fg2 transition-colors hover:text-fg">
          process schematic
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-[320px] flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {error ? (
              <div className="grid h-full place-items-center px-8 text-center text-[12.5px] text-fg3">
                <div>
                  <p className="text-[color:#ff8f8f]">The scene could not load.</p>
                  <p className="mt-2">{error}</p>
                </div>
              </div>
            ) : (
              <StfFactory
                key={run}
                run={run}
                className="absolute inset-0"
                playing={playing}
                speed={speed}
                seek={seek}
                seekStep={seekStep}
                focusOn={focusOn}
                hidden={hidden}
                onReady={onReady}
                onError={setError}
                onTick={onTick}
                onSelect={onSelect}
              />
            )}
            {!ready && !error && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] text-fg3">
                loading the run…
              </div>
            )}
            {current && (
              <div className="pointer-events-none absolute left-4 top-4 max-w-[420px] rounded-lg border border-line bg-[rgba(13,16,21,.82)] px-3 py-2 backdrop-blur">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg3">
                  {current.station ?? 'run'}{current.step !== null ? ` · step ${current.step}` : ''}
                </p>
                <p className="mt-0.5 text-[13px] text-fg">{current.note}</p>
              </div>
            )}
            {selected && (
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-line bg-[rgba(13,16,21,.82)] px-2.5 py-1 font-mono text-[10.5px] text-fg2 backdrop-blur">
                {selected}
              </div>
            )}
          </div>

          {/* transport */}
          <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-2">
            <button
              onClick={() => setPlaying(p => !p)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-fg2 transition-colors hover:text-fg"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <span className="w-[86px] shrink-0 font-mono text-[11px] tabular-nums text-fg2">
              {clock(t)} / {clock(duration)}
            </span>
            <input
              type="range" min={0} max={Math.max(duration, 0.001)} step={0.01} value={t}
              onChange={e => { const v = +e.target.value; setT(v); setSeek({ t: v }); }}
              className="min-w-0 flex-1 accent-[color:var(--a)]"
            />
            <div className="flex shrink-0 gap-1">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={'rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ' +
                    (speed === s ? 'bg-surf2 text-fg' : 'text-fg3 hover:text-fg2')}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 overflow-y-auto border-t border-line px-4 py-3 lg:w-[350px] lg:border-l lg:border-t-0 lg:px-5">
          <Head>Run</Head>
          <div className="flex flex-wrap gap-1">
            {RUNS.map(r => (
              <button key={r.id} onClick={() => setRun(r.id)} title={r.note}
                className={'rounded-md border px-2 py-1 text-[11px] transition-colors ' +
                  (run === r.id ? 'border-line bg-surf2 text-fg' : 'border-line text-fg3 hover:text-fg2')}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-[1.5] text-fg3">
            {RUNS.find(r => r.id === run)?.note}
          </p>

          <Head>Stations</Head>
          {STATIONS.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-[3px]">
              <input type="checkbox" className="accent-[color:var(--a)]"
                checked={!hidden[s.id]}
                onChange={e => setHidden(h => ({ ...h, [s.id]: !e.target.checked }))} />
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.colour }} />
              <span className="flex-1 text-[11.5px] text-fg2">{s.name}</span>
              <button onClick={() => setFocusOn({ id: s.id })}
                className="font-mono text-[10px] text-fg3 transition-colors hover:text-fg">focus</button>
            </div>
          ))}
          <button onClick={() => setFocusOn({ id: null })}
            className="mt-1 font-mono text-[10px] text-fg3 transition-colors hover:text-fg">
            ← whole cell
          </button>

          <Head>PLC step tape</Head>
          <p className="mb-1.5 text-[10.5px] leading-[1.5] text-fg3">
            Logged by the run itself. Click a step to seek the motion to it.
          </p>
          <div ref={tape} className="max-h-[230px] overflow-y-auto rounded-md border border-line">
            {events.map((e, i) => (
              <button key={i} data-active={i === stepIndex ? '1' : '0'}
                onClick={() => { setSeekStep({ i }); setT(e.t); }}
                className={'flex w-full items-baseline gap-2 px-2 py-1 text-left transition-colors ' +
                  (i === stepIndex ? 'bg-surf2 text-fg' : 'text-fg3 hover:text-fg2')}>
                <span className="w-[42px] shrink-0 font-mono text-[10px] tabular-nums">{clock(e.t)}</span>
                <span className="w-[30px] shrink-0 font-mono text-[10px]">{e.station ?? ''}</span>
                <span className="w-[30px] shrink-0 font-mono text-[10px] tabular-nums">{e.step ?? ''}</span>
                <span className="min-w-0 flex-1 text-[11px] leading-[1.35]">{e.note}</span>
              </button>
            ))}
            {!events.length && <p className="px-2 py-2 text-[11px] text-fg3">no step log for this run</p>}
          </div>

          <Head>Checks</Head>
          {report ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-[11.5px] text-fg3">this run</span>
                <span className="font-mono text-[12px] tabular-nums"
                  style={{ color: report.passed === report.total ? '#5fd68a' : '#e0a020' }}>
                  {report.passed} / {report.total}
                </span>
              </div>
              {failed.length > 0 && (
                <div className="mt-1.5">
                  {failed.map(c => (
                    <div key={c.name} className="flex items-start gap-1.5 py-[2px]">
                      <X className="mt-[3px] h-3 w-3 shrink-0 text-[color:#ff8f8f]" />
                      <span className="text-[11px] leading-[1.4] text-fg3">{c.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {failed.length === 0 && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-[color:#5fd68a]" />
                  <span className="text-[11px] text-fg3">every check passed</span>
                </div>
              )}
            </>
          ) : <p className="text-[11.5px] text-fg3">—</p>}

          <Head>Provenance</Head>
          {meta && (
            <p className="text-[11px] leading-[1.55] text-fg3">
              Geometry exported from <code>{run === 'factory' ? 'factory' : run.split('-')[0]}.xml</code>,
              the same MJCF the verification runs compile. Motion is{' '}
              {meta.solver_frames.toLocaleString()} solver frames resampled to {meta.fps} fps by
              nearest timestamp — no interpolation, no easing. Quantised to 16 bits per channel;
              worst error {meta.max_quant_error.toExponential(1)} on{' '}
              <code>{meta.max_quant_error_channel}</code>.
            </p>
          )}
          <p className="mt-2 text-[11px] leading-[1.55] text-fg3">
            There is no mode here that executes the PLC. The extracted control model has the step
            numbers, their comments and their <code>TON</code> waits, but not the axis target each
            step commands — so a live executor would have to invent the motion between steps.
          </p>
        </aside>
      </div>
    </div>
  );
}
