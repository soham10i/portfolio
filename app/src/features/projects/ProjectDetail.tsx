import type React from 'react';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Github } from 'lucide-react';
import JarvisOrb from '@/features/chat/components/JarvisOrb';
import { PROJECTS, CONTACT, type Project } from '@/shared/data/portfolio';
import { PROJECT_DETAILS } from '@/features/projects/lib/projectDetailContent';
import { lenis } from '@/shared/lib/lenis';
import '@/features/story/story.css';
import PageHeader from '@/features/story/components/PageHeader';
import LiveShot from '@/features/story/components/LiveShot';
import ProjectCover from '@/features/story/components/ProjectCover';
import { useStory } from '@/features/story/lib/store';
import { useTilt } from '@/features/story/lib/useTilt';
import RunViewer from '@/features/projects/components/RunViewer';

/* Project case study, in the gallery art direction (story.css), light/dark.
 *
 *   hero      meta, title, links — and the project's picture, leaning in 3D:
 *             a screenshot of the live site when there is one (it opens the
 *             real thing), otherwise its photo or generative cover art
 *   glance    timeline · category · status · stack
 *   body      problem → approach (stepper) → gallery → architecture (a layer
 *             stack that fans apart on hover) → notes → timeline, with an aside
 *   next      the following project as a large photo card */

const H2 = 'mono mb-6 text-fg3';

function tints(p: Project): React.CSSProperties {
  const t = p.tint ?? '#4d8dff';
  return {
    '--t1': `color-mix(in oklab, ${t} 26%, transparent)`,
    '--t2': `color-mix(in oklab, ${t} 12%, transparent)`,
  } as React.CSSProperties;
}

/** The project's picture when it has no live site: tilting, linking to code or demo. */
function Visual({ p, index }: { p: Project; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useTilt(ref, 6);
  return (
    <div className="tilt-stage">
      <div ref={ref} className="tilt relative overflow-hidden rounded-[26px] border border-[color:var(--line)] shadow-[var(--glass-shadow)]">
        <ProjectCover project={p} index={index} className="cq aspect-[16/11]" />
      </div>
    </div>
  );
}

function NextCard({ p, index }: { p: Project; index: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useTilt(ref, 3);
  return (
    <div className="tilt-stage">
      <Link ref={ref} to={`/project/${p.id}`} className="tilt group relative block overflow-hidden rounded-[30px]">
        <ProjectCover project={p} index={index} className="cq aspect-[16/9] sm:aspect-[21/8]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6 text-white md:p-10">
          <div>
            <p className="mono mb-3 text-white/70">Next project · {p.category}</p>
            <p className="max-w-[20ch] text-[clamp(26px,4vw,56px)] font-medium leading-[1] tracking-[-.04em]">{p.title}</p>
          </div>
          <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-white text-[#0d1626] transition-transform duration-300 group-hover:rotate-45">
            <ArrowUpRight className="h-5 w-5" />
          </span>
        </div>
      </Link>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const collect = useStory((s) => s.collect);
  const index = PROJECTS.findIndex((p) => p.id === id);
  const project = index >= 0 ? PROJECTS[index] : undefined;
  const detail = id ? PROJECT_DETAILS[id] : undefined;

  useEffect(() => {
    lenis.scrollTo(0, { immediate: true });
    if (id) collect(id);
  }, [id, collect]);

  if (!project) {
    return (
      <div className="story grid min-h-screen place-items-center">
        <div className="text-center">
          <p className="mono mb-3 text-fg3">404</p>
          <h1 className="mb-6 text-[40px] font-medium tracking-[-.04em]">Project not found</h1>
          <Link to="/#work" className="btn-ink">Back to all work</Link>
        </div>
      </div>
    );
  }

  const total = String(PROJECTS.length).padStart(2, '0');
  const next = PROJECTS[(index + 1) % PROJECTS.length];
  const approach = detail?.approach ?? [project.description, project.impact].filter(Boolean) as string[];
  const status = project.liveUrl ? 'Live on Google Cloud' : project.demoUrl ? 'Live demo on this site' : project.githubUrl ? 'Source on GitHub' : 'Source coming soon';

  return (
    <div className="story">
      <PageHeader back={{ to: '/#work', label: 'All work' }} liveUrl={project.liveUrl} githubUrl={project.githubUrl} />

      <main>
        {/* hero */}
        <section className="panel px-[var(--gutter)] pb-[clamp(32px,5vh,56px)] pt-[clamp(100px,13vh,140px)]" style={tints(project)}>
          <div className="grid items-center gap-[clamp(32px,4vw,64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div>
              <p className="mono mb-6 text-fg2">
                {String(index + 1).padStart(2, '0')} / {total}
                <span className="text-fg3"> · {project.category}</span>
              </p>
              <h1 className="t-display !text-[clamp(36px,4.6vw,72px)]">{project.title}</h1>
              {project.impact && (
                <p className="mt-6 text-[clamp(18px,1.6vw,22px)] leading-snug tracking-[-.01em]">
                  <span className="serif text-p">Result —</span> {project.impact}
                </p>
              )}
              <div className="mt-8 flex flex-wrap gap-2">
                {project.liveUrl && (
                  <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="btn-ink">
                    <span className="h-2 w-2 rounded-full bg-[#34d399]" /> Open the live site <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
                {!project.liveUrl && project.demoUrl && (
                  <Link to={project.demoUrl} className="btn-ink">Open live demo <ArrowUpRight className="h-4 w-4" /></Link>
                )}
                {project.githubUrl ? (
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="lg-pill inline-flex h-12 items-center gap-2 px-5 text-[14px]">
                    <Github className="h-4 w-4" /> View code
                  </a>
                ) : (
                  <span className="lg-pill mono inline-flex h-12 items-center px-5 text-fg3">Source coming soon</span>
                )}
              </div>
            </div>

            {project.liveUrl ? <LiveShot project={project} /> : <Visual p={project} index={index} />}
          </div>

          {detail?.results && (
            <div className="mt-[clamp(32px,5vh,56px)] grid grid-cols-2 gap-3 md:grid-cols-4">
              {detail.results.map((r) => (
                <div key={r.label} className="lg-panel p-5">
                  <p className="text-[clamp(22px,2.4vw,34px)] font-medium tracking-[-.03em]" style={{ color: r.color }}>{r.value}</p>
                  <p className="mt-2 text-[13px] text-fg2">{r.label}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* at a glance */}
        <section className="panel grid divide-y divide-[color:var(--line)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-[1fr_1fr_1fr_2fr] lg:divide-x">
          {[
            ['Timeline', project.timeline],
            ['Category', project.category],
            ['Status', status],
          ].map(([k, v]) => (
            <div key={k} className="px-[var(--gutter)] py-6">
              <p className="mono mb-2 text-fg3">{k}</p>
              <p className="text-[16px] font-medium tracking-[-.01em]">{v}</p>
            </div>
          ))}
          <div className="px-[var(--gutter)] py-6">
            <p className="mono mb-3 text-fg3">Stack</p>
            <div className="flex flex-wrap gap-1.5">
              {(project.tech ?? []).map((t) => (
                <span key={t} className="rounded-full border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-3 py-1 text-[12.5px] text-fg2">{t}</span>
              ))}
            </div>
          </div>
        </section>

        {project.viewer && (
          <section className="panel px-[var(--gutter)] py-[clamp(40px,6vh,72px)]">
            <p className="mono mb-3 text-fg3">Interactive run viewer</p>
            <h2 className="mb-6 max-w-[24ch] text-[clamp(26px,3vw,40px)] font-medium leading-[1.05] tracking-[-.03em]">
              Replay a walk — <span className="serif text-p">particles, beacons and error</span> in sync.
            </h2>
            <RunViewer runs={project.viewer.runs} />
          </section>
        )}

        {/* body */}
        <section className="panel px-[var(--gutter)] py-[clamp(56px,9vh,112px)]">
          <div className="grid items-start gap-[clamp(32px,5vw,72px)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,.6fr)]">
            <div className="flex flex-col gap-[clamp(48px,7vh,80px)]">
              {(detail?.problem || project.description) && (
                <section>
                  <h2 className={H2}>{detail?.problem ? 'The problem' : 'Overview'}</h2>
                  <p className="text-[clamp(22px,2.2vw,32px)] font-medium leading-[1.25] tracking-[-.025em]">
                    {detail?.problem ?? project.description}
                  </p>
                  {detail?.problem && project.description && (
                    <p className="mt-6 max-w-[68ch] text-[16px] leading-relaxed text-fg2">{project.description}</p>
                  )}
                </section>
              )}

              <section>
                <h2 className={H2}>Approach</h2>
                <ol className="relative">
                  <span aria-hidden className="absolute bottom-6 left-[19px] top-6 w-px bg-[color:var(--line)]" />
                  {approach.map((a, i) => (
                    <li key={i} className="relative grid grid-cols-[40px_1fr] gap-4 pb-5 last:pb-0">
                      <span className="relative grid h-10 w-10 place-items-center rounded-full border border-[color:var(--line)] bg-[color:var(--bg2)] text-[13px] font-medium">
                        {i + 1}
                      </span>
                      <p className="lg-panel t-body p-5">{a}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {project.gallery && (
                <section>
                  <h2 className={H2}>Pipeline</h2>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2" data-lenis-prevent>
                    {project.gallery.map((g, i) => (
                      <div key={g.src} className="flex flex-none items-center gap-2">
                        <figure className="w-[clamp(140px,18vw,200px)]">
                          <img src={g.src} alt={g.caption} loading="lazy" className="aspect-square w-full rounded-2xl border border-[color:var(--line)] bg-black object-cover" />
                          <figcaption className="mono mt-2 !text-[10px] text-fg3">{String(i + 1).padStart(2, '0')} · {g.caption}</figcaption>
                        </figure>
                        {i < project.gallery!.length - 1 && <ArrowRight className="mb-6 h-4 w-4 flex-none text-fg3" />}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detail?.architecture && (
                <section>
                  <h2 className={H2}>Architecture</h2>
                  {/* A layer stack: each tier a glass slab, offset like a deck,
                      fanning apart on hover. Top of the stack = top of the system. */}
                  <div className="group/stack flex flex-col">
                    {[...detail.architecture].reverse().map((l, i, arr) => (
                      <div
                        key={l.tier}
                        className="lg-panel relative -mt-3 grid gap-3 p-5 transition-[margin,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)] first:mt-0 group-hover/stack:mt-3 group-hover/stack:first:mt-0 sm:grid-cols-[130px_1fr]"
                        style={{ marginLeft: `${i * 14}px`, marginRight: `${(arr.length - 1 - i) * 14}px`, zIndex: arr.length - i }}
                      >
                        <span className="mono flex items-center gap-2 text-fg2">
                          <span className="h-2 w-2 rounded-full" style={{ background: project.tint ?? 'var(--p)' }} />
                          {l.tier}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {l.parts.map((pt) => (
                            <span key={pt} className="rounded-full border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-3 py-1 text-[12.5px] text-fg2">{pt}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detail?.technicalNotes && (
                <section>
                  <h2 className={H2}>Technical notes</h2>
                  <ul className="flex flex-col gap-4 border-l-2 pl-6" style={{ borderColor: project.tint ?? 'var(--p)' }}>
                    {detail.technicalNotes.map((n, i) => (
                      <li key={i} className="t-body">{n}</li>
                    ))}
                  </ul>
                </section>
              )}

              {detail?.timeline && (
                <section>
                  <h2 className={H2}>Timeline</h2>
                  <ol className="border-t border-[color:var(--line)]">
                    {detail.timeline.map((t) => (
                      <li key={t.phase} className="grid gap-2 border-b border-[color:var(--line)] py-5 md:grid-cols-[240px_1fr] md:gap-6">
                        <span className="text-[16px] font-medium tracking-[-.01em]">{t.phase}</span>
                        <span className="t-body">{t.desc}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {detail?.githubNote && <p className="text-[14px] leading-relaxed text-fg3">{detail.githubNote}</p>}
            </div>

            <aside className="flex flex-col gap-3 lg:sticky lg:top-24">
              <div className="lg-panel flex flex-col gap-1 p-6">
                <p className="mono mb-3 text-fg3">Links</p>
                {project.liveUrl && (
                  <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 py-1.5 text-[14.5px] hover:text-p">
                    Live site <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
                {project.demoUrl && (
                  <Link to={project.demoUrl} className="flex items-center justify-between gap-3 py-1.5 text-[14.5px] hover:text-p">
                    Live demo on this site <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
                {project.githubUrl ? (
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 py-1.5 text-[14.5px] hover:text-p">
                    Source on GitHub <Github className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="py-1.5 text-[14.5px] text-fg3">Source coming soon</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('jarvis:open'))}
                className="lg-panel flex items-start gap-3 p-6 text-left transition-transform hover:-translate-y-0.5"
              >
                <JarvisOrb size={30} className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-1.5 text-[15px] font-medium">Ask JARVIS</span>
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-fg2">Questions about how this was built?</span>
                </span>
              </button>
              <a href={`mailto:${CONTACT.email}`} className="lg-panel block p-6 text-[13.5px] text-fg2 hover:text-fg">
                <span className="mono mb-2 block text-fg3">Contact</span>
                <span className="break-all">{CONTACT.email}</span>
              </a>
            </aside>
          </div>
        </section>

        {/* next */}
        <section className="panel px-[var(--gutter)] py-[clamp(32px,5vh,56px)]">
          <NextCard p={next} index={(index + 1) % PROJECTS.length} />
        </section>
      </main>
    </div>
  );
}
