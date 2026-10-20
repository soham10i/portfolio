import type React from 'react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Github, Sparkles } from 'lucide-react';
import { PROJECTS, CONTACT, type Project } from '@/shared/data/portfolio';
import { PROJECT_DETAILS } from '@/features/projects/lib/projectDetailContent';
import { lenis } from '@/shared/lib/lenis';
import '@/features/story/story.css';
import PageHeader from '@/features/story/components/PageHeader';
import LiveSiteFrame from '@/features/story/components/LiveSiteFrame';
import { useStory } from '@/features/story/lib/store';

/* Project case study, in the same gallery art direction as the home page:
 * a tinted hero panel (title, links, results, and the live site when there
 * is one), a body panel (problem → approach → architecture → notes →
 * timeline, with a sticky aside), and a panel to the neighbouring projects.
 *
 * Projects with a public deployment show it live in a browser frame; the code
 * link always points at the GitHub repository. */

const H2 = 'mono mb-5 text-fg3';

function tints(p: Project): React.CSSProperties {
  const t = p.tint ?? '#4d8dff';
  return {
    '--t1': `color-mix(in oklab, ${t} 24%, transparent)`,
    '--t2': `color-mix(in oklab, ${t} 12%, transparent)`,
  } as React.CSSProperties;
}

function NeighbourCard({ p, label }: { p: Project; label: string }) {
  return (
    <Link to={`/project/${p.id}`} className="lg-panel group relative flex min-h-[220px] flex-col justify-between overflow-hidden p-6">
      <span aria-hidden className="absolute -right-1/4 -top-1/3 h-[90%] w-[70%] rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70" style={{ background: p.tint ?? '#4d8dff' }} />
      <span className="mono relative text-fg3">{label}</span>
      <span className="relative flex items-end justify-between gap-4">
        <span className="text-[clamp(22px,2.2vw,30px)] font-medium leading-[1.05] tracking-[-.03em]">{p.title}</span>
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[color:var(--fg)] text-white transition-transform duration-300 group-hover:rotate-45">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </span>
    </Link>
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
  const prev = PROJECTS[(index - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(index + 1) % PROJECTS.length];
  const approach = detail?.approach ?? [project.description, project.impact].filter(Boolean) as string[];

  return (
    <div className="story">
      <PageHeader back={{ to: '/#work', label: 'All work' }} liveUrl={project.liveUrl} githubUrl={project.githubUrl} />

      <main>
        {/* hero panel */}
        <section className="panel px-[var(--gutter)] pb-[clamp(40px,6vh,72px)] pt-[clamp(104px,14vh,150px)]" style={tints(project)}>
          <p className="mono mb-6 text-fg2">
            {String(index + 1).padStart(2, '0')} / {total}
            <span className="text-fg3"> · {project.category} · {project.timeline}</span>
          </p>
          <h1 className="max-w-[18ch] text-[clamp(40px,7vw,108px)] font-medium leading-[.94] tracking-[-.05em]">
            {project.title}
          </h1>
          {project.description && (
            <p className="mt-8 max-w-[64ch] text-[clamp(16px,1.3vw,19px)] leading-relaxed text-fg2">{project.description}</p>
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            {project.liveUrl && (
              <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="btn-ink">
                Open the live site <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
            {!project.liveUrl && project.demoUrl && (
              <Link to={project.demoUrl} className="btn-ink">
                Open live demo <ArrowUpRight className="h-4 w-4" />
              </Link>
            )}
            {project.githubUrl ? (
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="lg-pill inline-flex h-12 items-center gap-2 px-5 text-[14px]">
                <Github className="h-4 w-4" /> View code on GitHub
              </a>
            ) : (
              <span className="lg-pill mono inline-flex h-12 items-center px-5 text-fg3">Source coming soon</span>
            )}
          </div>

          {detail?.results && (
            <div className="mt-[clamp(40px,6vh,64px)] grid grid-cols-2 gap-3 md:grid-cols-4">
              {detail.results.map((r) => (
                <div key={r.label} className="lg-panel p-5">
                  <p className="text-[clamp(22px,2.4vw,34px)] font-medium tracking-[-.03em]" style={{ color: r.color }}>{r.value}</p>
                  <p className="mt-2 text-[13px] text-fg2">{r.label}</p>
                </div>
              ))}
            </div>
          )}

          {project.liveUrl && (
            <LiveSiteFrame
              url={project.liveUrl}
              title={`${project.title} — live`}
              previewVideo={project.loopVideo}
              className="mt-3"
            />
          )}
        </section>

        {/* body panel */}
        <section className="panel px-[var(--gutter)] py-[clamp(56px,9vh,112px)]">
          <div className="grid items-start gap-[clamp(32px,5vw,72px)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,.7fr)]">
            <div className="flex flex-col gap-[clamp(40px,6vh,64px)]">
              {detail?.problem && (
                <section>
                  <h2 className={H2}>The problem</h2>
                  <p className="text-[clamp(22px,2.2vw,32px)] font-medium leading-[1.25] tracking-[-.025em]">{detail.problem}</p>
                </section>
              )}

              <section>
                <h2 className={H2}>Approach</h2>
                <ol className="flex flex-col gap-3">
                  {approach.map((a, i) => (
                    <li key={i} className="lg-panel grid grid-cols-[36px_1fr] gap-3 p-5">
                      <span className="mono pt-0.5 text-fg3">{String(i + 1).padStart(2, '0')}</span>
                      <p className="text-[15px] leading-relaxed text-fg2">{a}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {project.versions && (
                <section>
                  <h2 className={H2}>Versions</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {project.versions.map((v) => (
                      <div key={v.key} className="lg-panel p-5">
                        <p className="mono mb-2 text-p">{v.label}</p>
                        <p className="mb-3 text-[14px] font-medium">{v.impact}</p>
                        <p className="text-[14px] leading-relaxed text-fg2">{v.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detail?.architecture && (
                <section>
                  <h2 className={H2}>Architecture</h2>
                  <div className="lg-panel px-6 py-2">
                    {detail.architecture.map((l) => (
                      <div key={l.tier} className="grid items-center gap-3 border-b border-[color:var(--line)] py-4 last:border-b-0 sm:grid-cols-[120px_1fr]">
                        <span className="mono text-fg3">{l.tier}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {l.parts.map((pt) => (
                            <span key={pt} className="rounded-full border border-[color:var(--line)] bg-white/60 px-3 py-1 text-[12.5px] text-fg2">{pt}</span>
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
                  <ul className="flex flex-col gap-3 border-l border-[color:var(--line)] pl-5">
                    {detail.technicalNotes.map((n, i) => (
                      <li key={i} className="text-[15px] leading-relaxed text-fg2">{n}</li>
                    ))}
                  </ul>
                </section>
              )}

              {detail?.timeline && (
                <section>
                  <h2 className={H2}>Timeline</h2>
                  <ol className="border-t border-[color:var(--line)]">
                    {detail.timeline.map((t) => (
                      <li key={t.phase} className="grid gap-2 border-b border-[color:var(--line)] py-5 md:grid-cols-[220px_1fr] md:gap-6">
                        <span className="text-[15px] font-medium">{t.phase}</span>
                        <span className="text-[14.5px] leading-relaxed text-fg2">{t.desc}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {detail?.githubNote && <p className="text-[14px] leading-relaxed text-fg3">{detail.githubNote}</p>}
            </div>

            <aside className="flex flex-col gap-3 lg:sticky lg:top-24">
              {(project.tech ?? []).length > 0 && (
                <div className="lg-panel p-6">
                  <p className={H2 + ' !mb-4'}>Stack</p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.tech!.map((t) => (
                      <span key={t} className="rounded-full border border-[color:var(--line)] bg-white/60 px-3 py-1 text-[12.5px] text-fg2">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="lg-panel flex flex-col gap-2 p-6">
                <p className={H2 + ' !mb-2'}>Links</p>
                {project.liveUrl && (
                  <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 py-1 text-[14px] hover:text-p">
                    Live site <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
                {project.demoUrl && (
                  <Link to={project.demoUrl} className="flex items-center justify-between gap-3 py-1 text-[14px] hover:text-p">
                    Live demo on this site <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
                {project.githubUrl ? (
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 py-1 text-[14px] hover:text-p">
                    Source on GitHub <Github className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="py-1 text-[14px] text-fg3">Source coming soon</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('jarvis:open'))}
                className="lg-panel flex items-start gap-3 p-6 text-left transition-transform hover:-translate-y-0.5"
              >
                <Sparkles className="mt-0.5 h-4 w-4 flex-none text-a" />
                <span>
                  <span className="block text-[15px] font-medium">Ask JARVIS</span>
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-fg2">Questions about how {project.title} was built?</span>
                </span>
              </button>
              <a href={`mailto:${CONTACT.email}`} className="lg-panel block p-6 text-[13.5px] text-fg2 hover:text-fg">
                <span className={H2 + ' !mb-2 block'}>Contact</span>
                <span className="break-all">{CONTACT.email}</span>
              </a>
            </aside>
          </div>
        </section>

        {/* neighbours */}
        <section className="panel grid gap-3 px-[var(--gutter)] py-[clamp(40px,6vh,72px)] md:grid-cols-2">
          <NeighbourCard p={prev} label="← Previous project" />
          <NeighbourCard p={next} label="Next project →" />
        </section>
      </main>
    </div>
  );
}
