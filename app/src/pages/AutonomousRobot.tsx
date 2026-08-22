import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Github, Pause, Play, RotateCcw } from 'lucide-react';
import MazeWorld, { type MazeKey, type SimState } from '@/components/MazeWorld';
import { PALETTES, applyPalette, readStoredPalette, type PaletteKey } from '@/lib/palettes';

/* Autonomous robot project page.
   Five Webots maze worlds, each watchable as a recorded run or driven live in
   the browser by <webots-world-3d>. See public/webots-world-3d.js. */

interface MazeMeta {
  key: MazeKey;
  label: string;
  title: string;
  difficulty: 'Baseline' | 'Moderate' | 'Hard';
  controller: string;
  walls: number;
  pads: number;
  cylinders: number;
  span: number;
  /** Recorded Webots run. null until the clip is transcoded into public/videos/. */
  video: string | null;
}

const MAZES: MazeMeta[] = [
  { key: 'maze1', label: 'Map 1', title: 'Open floor',        difficulty: 'Baseline', controller: 'mak_02_controller', walls: 38, pads: 1, cylinders: 2, span: 4.71, video: null },
  { key: 'maze2', label: 'Map 2', title: 'Corridors',         difficulty: 'Moderate', controller: 'mak_02_controller', walls: 68, pads: 3, cylinders: 2, span: 8.84, video: null },
  { key: 'maze3', label: 'Map 3', title: 'Loop closure',      difficulty: 'Moderate', controller: 'mak_04_controller', walls: 37, pads: 8, cylinders: 2, span: 6.57, video: null },
  { key: 'maze4', label: 'Map 4', title: 'Dense maze',        difficulty: 'Hard',     controller: 'mak_02_controller', walls: 38, pads: 1, cylinders: 2, span: 5.34, video: '/videos/maze4.mp4' },
  { key: 'maze5', label: 'Map 5', title: 'Dynamic obstacles', difficulty: 'Hard',     controller: 'mak_02_controller', walls: 18, pads: 2, cylinders: 2, span: 5.55, video: null },
];

const DIFFICULTY_TONE: Record<MazeMeta['difficulty'], string> = {
  Baseline: 'text-emerald-300/90 border-emerald-400/30 bg-emerald-400/10',
  Moderate: 'text-amber-300/90 border-amber-400/30 bg-amber-400/10',
  Hard: 'text-rose-300/90 border-rose-400/30 bg-rose-400/10',
};

const CONTROLLER_PARAMS: [string, string][] = [
  ['V_MAX', '0.35 m/s'],
  ['W_MAX', '2.2 rad/s'],
  ['Robot radius', '0.128 m'],
  ['LIDAR', '5.0 m · 10 Hz · 120 rays'],
  ['Grid resolution', '0.05 m'],
  ['Goal tolerance', '0.16 m'],
  ['Pure-pursuit carrot', '0.42 m'],
  ['Replan interval', '3.0 s'],
];


/* ---- small presentational pieces -------------------------------------- */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[9px] border border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.13em] text-fg2">
      {children}
    </span>
  );
}

function HudChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-[9px] border border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] px-2.5 py-1.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-fg3">{k}</span>
      <span className="font-mono text-[11.5px] text-fg">{v}</span>
    </span>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 font-mono text-[10.5px] tracking-wide transition-colors ' +
        (on
          ? 'border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] text-fg'
          : 'border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] text-fg2 hover:text-fg')
      }
    >
      <span className={'h-1.5 w-1.5 rounded-full ' + (on ? 'bg-a' : 'bg-fg3')} />
      {label}
    </button>
  );
}

/* ---- page ------------------------------------------------------------- */

export default function AutonomousRobot() {
  const [mazeKey, setMazeKey] = useState<MazeKey>('maze3');
  const [view, setView] = useState<'video' | 'webots'>('webots');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [lidar, setLidar] = useState(true);
  const [plan, setPlan] = useState(true);
  const [fpv, setFpv] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);

  /* The viewer honours the palette chosen on the home page — both engines take
     an `accent` attribute, so the 3D overlays recolour with the rest. */
  const [palette] = useState<PaletteKey>(readStoredPalette);
  useEffect(() => { applyPalette(palette); }, [palette]);
  const accent = PALETTES[palette].a;

  /* HUD and ready state are stamped with the world they belong to, so
     switching maps drops the stale readings without an effect that resets
     state on every change. */
  const [readyMaze, setReadyMaze] = useState<MazeKey | null>(null);
  const [simEntry, setSimEntry] = useState<{ maze: MazeKey; s: SimState } | null>(null);

  const maze = MAZES.find((m) => m.key === mazeKey)!;
  const sim = simEntry && simEntry.maze === mazeKey ? simEntry.s : null;
  const ready = readyMaze === mazeKey;

  /* The engine emits sim-state at ~5 Hz; the HUD only needs ~4 Hz, so the
     latest payload is buffered in a ref and flushed on an interval instead of
     re-rendering the page on every engine frame. The interval is re-created
     per map so each flush stamps the world it actually came from. */
  const latest = useRef<SimState | null>(null);
  const onState = useCallback((s: SimState) => { latest.current = s; }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (latest.current) setSimEntry({ maze: mazeKey, s: latest.current });
    }, 250);
    return () => window.clearInterval(id);
  }, [mazeKey]);

  const selectMaze = (key: MazeKey) => {
    latest.current = null;
    setMazeKey(key);
  };

  /* `twin-ready` fires once for the element's lifetime; `world-loaded` fires
     again on every map switch, so readiness tracks the world on screen. */
  const onReady = () => setReadyMaze(mazeKey);
  const onWorldLoaded = () => setReadyMaze(mazeKey);
  const onError = useCallback((e: Error) => setEngineError(e.message), []);

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Header */}
      <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:h-[60px] sm:flex-nowrap sm:px-[22px] sm:py-0">
        <div className="flex items-center gap-4">
          <Link
            to="/project/autonomous-robots-slam"
            className="inline-flex items-center gap-1.5 text-[13px] text-fg2 transition-colors hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Project
          </Link>
          <span className="hidden h-5 w-px bg-surf2 sm:block" />
          <div>
            <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-fg">
              Autonomous exploration — ROSBot
            </p>
            <p className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg3 sm:block">
              WEBOTS R2025A · 2D LIDAR SLAM · FRONTIER + A*
            </p>
          </div>
        </div>
        <a
          href="https://github.com/soham10i/autonomouse_robots"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-fg2 transition-colors hover:text-fg"
        >
          <Github className="h-3.5 w-3.5" />
          Source
        </a>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 py-8">
        {/* Map tabs */}
        <div className="flex flex-wrap gap-2">
          {MAZES.map((m) => {
            const active = m.key === mazeKey;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => selectMaze(m.key)}
                className={
                  'flex flex-col items-start gap-1 rounded-[12px] border px-3.5 py-2.5 text-left transition-colors ' +
                  (active
                    ? 'border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_10%,transparent)]'
                    : 'border-line bg-surf2 hover:border-line')
                }
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg3">
                  {m.label}
                </span>
                <span className={'text-[13px] font-medium ' + (active ? 'text-fg' : 'text-fg2')}>
                  {m.title}
                </span>
                <span className={'rounded-full border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.1em] ' + DIFFICULTY_TONE[m.difficulty]}>
                  {m.difficulty}
                </span>
              </button>
            );
          })}
        </div>

        {/* Viewer panel */}
        <section className="mt-6 overflow-hidden rounded-[18px] border border-line bg-surf">
          {/* Panel header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{maze.label} · {maze.title}</Chip>
              <Chip>{maze.walls} walls · {maze.pads} pads · {maze.cylinders} pillars</Chip>
              <Chip>{maze.controller}</Chip>
            </div>
            <div className="flex gap-1 rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] p-[3px]">
              {(['video', 'webots'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={
                    'rounded-[7px] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ' +
                    (view === v ? 'bg-[color-mix(in_oklab,var(--a)_20%,transparent)] text-fg' : 'text-fg3 hover:text-fg2')
                  }
                >
                  {v === 'video' ? 'Video' : '3D World'}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas / video */}
          <div className="relative aspect-[4/5] w-full bg-[#05070d] sm:aspect-video">
            {view === 'video' ? (
              maze.video ? (
                <video
                  key={maze.video}
                  src={maze.video}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="absolute inset-6 grid place-items-center rounded-[14px] border border-dashed border-line px-6 text-center">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg2">
                      No recorded run for {maze.label} yet
                    </p>
                    <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-fg3">
                      Drop the transcoded clip at{' '}
                      <code className="font-mono text-fg2">public/videos/{maze.key}.mp4</code>{' '}
                      and it appears here. The 3D world runs regardless.
                    </p>
                    <button
                      type="button"
                      onClick={() => setView('webots')}
                      className="mt-4 rounded-full border border-[color-mix(in_oklab,var(--a)_50%,transparent)] px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-a transition-colors hover:bg-[color-mix(in_oklab,var(--a)_10%,transparent)]"
                    >
                      Open 3D world
                    </button>
                  </div>
                </div>
              )
            ) : engineError ? (
              <div className="absolute inset-0 grid place-items-center px-8 text-center">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rose-300">
                    3D engine failed to load
                  </p>
                  <p className="mt-2 text-[12.5px] text-fg3">{engineError}</p>
                  <p className="mt-1 text-[12.5px] text-fg3">
                    The engine pulls Three.js r147 from unpkg on first mount — check the network,
                    or vendor it into <code className="font-mono">public/vendor/</code>.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <MazeWorld
                  maze={mazeKey}
                  playing={playing}
                  speed={speed}
                  lidar={lidar}
                  plan={plan}
                  fpv={fpv}
                  resetToken={resetToken}
                  accent={accent}
                  onReady={onReady}
                  onWorldLoaded={onWorldLoaded}
                  onError={onError}
                  onState={onState}
                />

                {/* HUD */}
                <div className="pointer-events-none absolute inset-x-3.5 top-3 flex flex-wrap gap-1.5">
                  <HudChip k="state" v={sim?.state ?? '—'} />
                  <HudChip k="mapped" v={sim ? Math.round(sim.coverage * 100) + '%' : '—'} />
                  <HudChip k="occ" v={sim ? String(sim.occ) : '—'} />
                  <HudChip k="driven" v={sim ? sim.dist.toFixed(2) + ' m' : '—'} />
                  <HudChip k="sim t" v={sim ? sim.simTime.toFixed(1) + ' s' : '—'} />
                </div>

                {/* Control bar */}
                <div className="absolute inset-x-3.5 bottom-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_20%,transparent)] px-4 py-2 font-mono text-[11.5px] tracking-wide text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--a)_30%,transparent)]"
                    >
                      {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {playing ? 'PAUSE' : 'PLAY'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetToken((n) => n + 1)}
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-3.5 py-2 font-mono text-[11.5px] tracking-wide text-fg2 transition-colors hover:text-fg"
                    >
                      <RotateCcw className="h-3 w-3" />
                      RESET
                    </button>
                    <div className="flex gap-1 rounded-[9px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] p-1">
                      {[1, 2, 4].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setSpeed(v)}
                          className={
                            'rounded-[6px] px-2.5 py-1 font-mono text-[10.5px] transition-colors ' +
                            (speed === v ? 'bg-[color-mix(in_oklab,var(--a)_20%,transparent)] text-fg' : 'text-fg3 hover:text-fg2')
                          }
                        >
                          {v}×
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Toggle label="LIDAR" on={lidar} onClick={() => setLidar((v) => !v)} />
                    <Toggle label="PLAN" on={plan} onClick={() => setPlan((v) => !v)} />
                    <Toggle label="ROBOT CAM" on={fpv} onClick={() => setFpv((v) => !v)} />
                  </div>
                </div>

                {!ready && (
                  <div className="absolute inset-0 grid place-items-center bg-[#05070d]">
                    <div className="text-center">
                      <div className="mx-auto h-[34px] w-[34px] animate-spin rounded-full border-2 border-line border-t-a" />
                      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-fg3">
                        Loading world geometry
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Controller parameters */}
        <section className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
              What the run is doing
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-fg2">
              The browser re-implements the project's Python controller: a 2-D LIDAR raycast against
              the real wall meshes feeds a log-odds occupancy grid, the grid drives goal selection,
              A* plans over the mapped cells with the robot radius inflated, and pure pursuit steers
              along the plan. The mission mirrors the Webots task — drive to the blue pillar, then the
              yellow pillar, then <span className="font-mono text-fg2">MISSION_DONE</span>, with
              nearest-frontier exploration as the fallback when no mission target remains.
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-fg2">
              Overlays: LIDAR rays and hit points in accent, the occupancy grid as two point clouds
              (occupied warm, free cool), and the planned path as a green polyline ending at a
              translucent goal cylinder.
            </p>
          </div>
          <div className="rounded-[14px] border border-line bg-surf2 p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg3">
              Controller parameters
            </h3>
            <dl className="mt-3 space-y-2">
              {CONTROLLER_PARAMS.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12.5px] text-fg2">{k}</dt>
                  <dd className="font-mono text-[11.5px] text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-fg3">
              Lifted verbatim from{' '}
              <code className="font-mono">Maze3/controllers/mak_04_controller/config.py</code>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
