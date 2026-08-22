import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Github } from 'lucide-react';
import CellDiagram from '@/components/CellDiagram';
import SiteBackground from '@/components/SiteBackground';
import { PALETTES, PALETTE_KEYS, applyPalette, readStoredPalette, storePalette, type PaletteKey } from '@/lib/palettes';
import { PROJECTS, CONTACT } from '@/data/portfolio';
import { TWIN_PROBLEM, TWIN_TIMELINE, TWIN_VERSIONS } from '@/data/twinDetail';

/* Project detail, ported from Portfolio Project Detail v2.dc.html.
   The digital-twin entry gets the full treatment (version tabs, 2D cell view,
   telemetry strip, architecture, version history); every other project renders
   the same shell with its own copy. */

const SECTION_H2 = 'mb-4 font-mono text-[13px] font-semibold uppercase tracking-[.16em] text-fg3';
const CARD = 'rounded-2xl border border-line bg-surf';

function ThemeButton({ palette, onPalette }: { palette: PaletteKey; onPalette: (k: PaletteKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className="flex h-[34px] items-center gap-2 rounded-full border border-line bg-surf2 px-3 text-[12.5px] font-medium text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--p)_14%,transparent)]"
      >
        <span className="flex gap-[3px]">
          <span className="h-[9px] w-[9px] rounded-full bg-p" />
          <span className="h-[9px] w-[9px] rounded-full bg-s" />
          <span className="h-[9px] w-[9px] rounded-full bg-a" />
        </span>
        Theme
      </button>
      {open && (
        <div
          className="absolute right-0 top-[44px] z-[70] w-[262px] rounded-2xl border border-line p-2"
          style={{
            background: 'color-mix(in oklab,var(--bg) 88%,transparent)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,.55)',
          }}
        >
          {PALETTE_KEYS.map((k) => {
            const t = PALETTES[k];
            return (
              <button
                key={k} type="button"
                onClick={() => { onPalette(k); setOpen(false); }}
                className="flex w-full items-center gap-[11px] rounded-[11px] border border-transparent px-2.5 py-[9px] text-left text-[13px] text-fg hover:border-line"
                style={{ background: k === palette ? `color-mix(in oklab,${t.p} 15%,transparent)` : 'transparent' }}
              >
                <span className="flex flex-none gap-[3px]">
                  <span className="h-[22px] w-3 rounded-[4px]" style={{ background: t.p }} />
                  <span className="h-[22px] w-3 rounded-[4px]" style={{ background: t.s }} />
                  <span className="h-[22px] w-3 rounded-[4px]" style={{ background: t.a }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-[11px] text-fg3">{t.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  /* Read once during initialisation, not in an effect. */
  const [palette, setPalette] = useState<PaletteKey>(readStoredPalette);
  const [version, setVersion] = useState<'v2' | 'v1'>('v2');

  useEffect(() => { applyPalette(palette); }, [palette]);

  const pick = (k: PaletteKey) => { setPalette(k); applyPalette(k); storePalette(k); };

  const project = PROJECTS.find((p) => p.id === id);
  const isTwin = project?.id === 'digital-twin';
  const V = TWIN_VERSIONS[version];

  const index = PROJECTS.findIndex((p) => p.id === id);
  const prev = index > 0 ? PROJECTS[index - 1] : null;
  const next = index >= 0 && index < PROJECTS.length - 1 ? PROJECTS[index + 1] : null;

  if (!project) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-fg">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold">Project not found</h1>
          <Link to="/" className="text-fg2 transition-colors hover:text-fg">← Back home</Link>
        </div>
      </div>
    );
  }

  const activeVersion = project.versions?.[0];
  const highlights = isTwin ? V.highlights : [project.impact].filter(Boolean) as string[];
  const stack = isTwin ? V.stack : project.tech ?? activeVersion?.tech ?? [];

  return (
    <div className="relative min-h-screen bg-bg text-fg">
      <SiteBackground paletteKey={palette} />

      <header
        className="sticky top-0 z-[60] border-b border-line"
        style={{
          background: 'color-mix(in oklab,var(--bg) 74%,transparent)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-[1080px] items-center justify-between gap-5 px-[26px]">
          <Link to="/#projects" className="inline-flex items-center gap-2 text-[13px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
            All projects
          </Link>
          <ThemeButton palette={palette} onPalette={pick} />
        </div>
      </header>

      <main className="relative z-[1] mx-auto max-w-[1080px] px-[26px] pb-[100px] pt-[60px]">
        <div className="mb-[22px] flex animate-rise flex-wrap items-center gap-2.5">
          {project.flagship && (
            <span className="rounded-full bg-a px-[11px] py-[5px] font-mono text-[9.5px] font-bold uppercase tracking-[.16em] text-bg">
              Flagship
            </span>
          )}
          <span className="font-mono text-[10.5px] uppercase tracking-[.16em] text-fg3">
            {project.category}{isTwin && ' · Industrial automation'}
          </span>
          <span className="text-fg3">·</span>
          <span className="font-mono text-[11px] text-fg3">{project.timeline}</span>
        </div>

        <h1 className="mb-[18px] max-w-[840px] animate-rise text-[clamp(36px,5vw,64px)] font-extrabold leading-[1.02] tracking-[-.035em] [animation-delay:.06s]">
          {isTwin ? (
            <>
              Smart Tabletop Factory —{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg,var(--p),var(--a))',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                }}
              >
                Digital Twin
              </span>
            </>
          ) : (
            project.title
          )}
        </h1>

        <p className="mb-[34px] max-w-[700px] animate-rise text-[16.5px] leading-[1.6] text-fg2 [text-wrap:pretty] [animation-delay:.12s]">
          {isTwin
            ? 'A live digital twin of an automated warehouse cell: sensor telemetry in, 3D state and maintenance forecasts out. Built in two versions — a dashboard first, then a real-time 3D twin.'
            : project.description}
        </p>

        <div className="mb-11 flex animate-rise flex-wrap gap-3 [animation-delay:.18s]">
          {project.demoUrl && (
            <Link
              to={project.demoUrl}
              className="inline-flex items-center gap-2.5 rounded-full px-[22px] py-[11px] text-[13.5px] font-semibold text-bg transition-[filter] hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
            >
              Open live demo
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.4} />
            </Link>
          )}
          <a
            href={project.githubUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surf2 px-5 py-[11px] text-[13.5px] text-fg transition-colors hover:border-[color-mix(in_oklab,var(--a)_55%,transparent)]"
          >
            <Github className="h-3.5 w-3.5" />
            Source
          </a>
        </div>

        {isTwin && (
          <>
            <div className="mb-[26px] inline-flex animate-rise gap-1.5 rounded-[14px] border border-line bg-surf p-[5px] [animation-delay:.24s]">
              {(['v2', 'v1'] as const).map((k) => {
                const on = k === version;
                return (
                  <button
                    key={k} type="button" onClick={() => setVersion(k)}
                    className="flex flex-col gap-0.5 rounded-[10px] px-5 py-2.5 text-left transition-all [transition-duration:300ms]"
                    style={
                      on
                        ? { background: 'linear-gradient(135deg,var(--p),var(--s))', color: 'var(--bg)' }
                        : { background: 'transparent', color: 'var(--fg2)' }
                    }
                  >
                    <span className="font-mono text-[13px] font-semibold">{TWIN_VERSIONS[k].label}</span>
                    <span className="text-[11px] opacity-75">{TWIN_VERSIONS[k].sub}</span>
                  </button>
                );
              })}
            </div>

            <div
              id="twin-demo"
              className="mb-[18px] overflow-hidden rounded-[20px] border border-line bg-surf backdrop-blur-[20px] backdrop-saturate-[180%]"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surf2 px-[18px] py-[13px]">
                <div className="flex items-center gap-2.5">
                  <span className="h-[7px] w-[7px] rounded-full bg-[#22c55e]" />
                  <span className="font-mono text-[11px] uppercase tracking-[.12em] text-fg3">{V.demoLabel}</span>
                </div>
                <div className="flex gap-3.5 font-mono text-[10.5px] text-fg3">
                  <span>ws://stf-gateway · live</span>
                  <span>10 Hz</span>
                </div>
              </div>

              <div
                className="relative aspect-[16/8]"
                style={{ background: 'linear-gradient(160deg,color-mix(in oklab,var(--p) 12%,transparent),color-mix(in oklab,var(--s) 8%,transparent))' }}
              >
                <CellDiagram />
                <div className="absolute inset-x-4 bottom-3.5 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className="rounded-lg border border-line px-[11px] py-[5px] font-mono text-[10.5px] text-fg3"
                    style={{ background: 'color-mix(in oklab,var(--bg) 70%,transparent)' }}
                  >
                    2D layout view — full cell renders in 3D
                  </span>
                  <Link
                    to="/factory-twin"
                    className="inline-flex items-center gap-2 rounded-full px-[15px] py-2 text-[12px] font-medium text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--a)_18%,transparent)]"
                    style={{
                      background: 'color-mix(in oklab,var(--bg) 78%,transparent)',
                      border: '1px solid color-mix(in oklab,var(--a) 50%,transparent)',
                    }}
                  >
                    Open 3D twin viewer
                    <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
                  </Link>
                </div>
              </div>

              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                {V.telemetry.map((t) => (
                  <div key={t.label} className="border-r border-t border-line px-[18px] py-4">
                    <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[.16em] text-fg3">{t.label}</p>
                    <p className="text-[19px] font-semibold tracking-[-.01em]" style={{ color: t.color }}>{t.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="mb-[54px] text-[12px] text-fg3">{V.note}</p>
          </>
        )}

        <div className="grid items-start gap-[52px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.6fr)]">
          <div>
            {isTwin && (
              <section className="mb-[46px]">
                <h2 className={SECTION_H2}>The problem</h2>
                <p className="text-[15px] leading-[1.75] text-fg2 [text-wrap:pretty]">{TWIN_PROBLEM}</p>
              </section>
            )}

            <section className="mb-[46px]">
              <h2 className={SECTION_H2}>{isTwin ? 'What this version does' : 'What it does'}</h2>
              <div className="flex flex-col gap-3">
                {(isTwin ? highlights : [project.description ?? '', project.impact ?? ''].filter(Boolean)).map((h) => (
                  <div key={h} className="flex items-start gap-[13px] rounded-[13px] border border-line bg-surf px-[17px] py-[15px]">
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-a" />
                    <p className="text-[14px] leading-[1.6] text-fg2">{h}</p>
                  </div>
                ))}
              </div>
            </section>

            {isTwin && (
              <>
                <section className="mb-[46px]">
                  <h2 className={SECTION_H2}>Architecture</h2>
                  <div className="rounded-[18px] border border-line bg-surf px-6 py-[26px]">
                    {V.arch.map((l) => (
                      <div key={l.tier} className="grid items-center gap-[18px] border-t border-line py-3.5 sm:[grid-template-columns:104px_minmax(0,1fr)]">
                        <span className="font-mono text-[10.5px] uppercase tracking-[.12em] text-fg3">{l.tier}</span>
                        <div className="flex flex-wrap gap-[7px]">
                          {l.parts.map((pt) => (
                            <span key={pt} className="rounded-[9px] border border-line bg-surf2 px-3 py-1.5 font-mono text-[11.5px] text-fg2">
                              {pt}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className={SECTION_H2}>Version history</h2>
                  <div className="flex flex-col gap-3.5">
                    {TWIN_TIMELINE.map((tl) => (
                      <div key={tl.ver} className="grid gap-[18px] border-t border-line py-[18px] sm:[grid-template-columns:76px_minmax(0,1fr)]">
                        <span className="font-mono text-[13px] font-semibold text-p">{tl.ver}</span>
                        <div>
                          <p className="mb-1.5 text-[14.5px] font-semibold">{tl.title}</p>
                          <p className="text-[13.5px] leading-[1.65] text-fg2 [text-wrap:pretty]">{tl.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
            <div className={CARD + ' p-[22px]'}>
              <p className="mb-3.5 font-mono text-[9.5px] uppercase tracking-[.18em] text-fg3">Role</p>
              <p className="text-[14px] font-semibold">Lead Developer &amp; AI Architect</p>
              <p className="mt-4 font-mono text-[9.5px] uppercase tracking-[.18em] text-fg3">Status</p>
              <p className="mt-1.5 inline-flex items-center gap-[7px] text-[13.5px]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                Completed
              </p>
            </div>

            <div className={CARD + ' p-[22px]'}>
              <p className="mb-3 font-mono text-[9.5px] uppercase tracking-[.18em] text-fg3">Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {stack.map((s) => (
                  <span key={s} className="rounded-[7px] border border-line bg-surf2 px-2.5 py-[5px] font-mono text-[11px] text-fg2">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl p-[22px]"
              style={{
                border: '1px solid color-mix(in oklab,var(--a) 34%,transparent)',
                background: 'color-mix(in oklab,var(--a) 9%,transparent)',
              }}
            >
              <p className="mb-2 text-[13.5px] font-semibold">Ask JARVIS</p>
              <p className="mb-3.5 text-[12.5px] leading-[1.55] text-fg2">
                Questions about the adapter layer, the telemetry schema, or how v2 differs from v1?
              </p>
              <Link to="/" className="inline-flex items-center gap-[7px] text-[12.5px] font-medium text-a">
                Open the assistant →
              </Link>
            </div>

            <div className={CARD + ' p-[22px]'}>
              <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[.18em] text-fg3">Contact</p>
              <a href={`mailto:${CONTACT.email}`} className="break-all text-[12.5px] text-fg2 transition-colors hover:text-fg">
                {CONTACT.email}
              </a>
            </div>
          </aside>
        </div>

        <nav className="mt-[74px] flex flex-wrap justify-between gap-5 border-t border-line pt-[30px]">
          {prev ? (
            <Link to={`/project/${prev.id}`} className="text-[13.5px] text-fg2 transition-colors hover:text-fg">← {prev.title}</Link>
          ) : <span />}
          {next ? (
            <Link to={`/project/${next.id}`} className="text-[13.5px] text-fg2 transition-colors hover:text-fg">{next.title} →</Link>
          ) : <span />}
        </nav>
      </main>
    </div>
  );
}
