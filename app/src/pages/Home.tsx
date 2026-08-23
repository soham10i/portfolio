import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Mail, MapPin, Play, Send, Sparkles } from 'lucide-react';
import SiteBackground from '@/components/SiteBackground';
import SiteHeader from '@/components/SiteHeader';
import {
  applyPalette, readStoredPalette, storePalette, type PaletteKey,
} from '@/lib/palettes';
import {
  CATEGORIES, CONTACT, DOMAINS, EDUCATION, EXPERIENCES, HERO_STATS, HERO_TAGS,
  HIGHLIGHTS, INTERESTS, LANGUAGES, MATRIX, PROJECTS, ROLES,
  type Project, type Tier,
} from '@/data/portfolio';

const ChatPanel = lazy(() => import('@/components/ChatPanel'));

const CHAT_API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

const SECTION = 'px-[26px] py-[110px]';
const SHELL = 'mx-auto w-full max-w-[1180px]';
const EYEBROW = 'mb-3 font-mono text-[10.5px] uppercase leading-none tracking-[.24em] text-fg3';
const H2 = 'text-[clamp(34px,4.4vw,56px)] font-bold leading-[1.04] tracking-[-.03em]';
const CHIP = 'rounded-md border border-line bg-surf2 px-[9px] py-1 font-mono text-[10.5px] text-fg2';
const GLASS = 'rounded-[18px] border border-line bg-surf backdrop-blur-[18px] backdrop-saturate-[170%]';

function gradientText(from: string, to: string) {
  return {
    background: `linear-gradient(135deg,var(--${from}),var(--${to}))`,
    WebkitBackgroundClip: 'text' as const,
    backgroundClip: 'text' as const,
    color: 'transparent',
  };
}

const TIER_STYLE: Record<Tier, { bg: string; fg: string }> = {
  Production: { bg: 'color-mix(in oklab,var(--p) 18%,transparent)', fg: 'var(--p)' },
  Strong: { bg: 'color-mix(in oklab,var(--s) 18%,transparent)', fg: 'var(--s)' },
  Explored: { bg: 'var(--surf2)', fg: 'var(--fg3)' },
};

/* ── Hero role typewriter ───────────────────────────────────────────── */

interface TypeState { idx: number; typed: string; deleting: boolean }

function useTypedRole() {
  const [t, setT] = useState<TypeState>({ idx: 0, typed: '', deleting: false });

  /* One timer per frame of the animation. Every transition — including
     "finished deleting, advance to the next role" — happens inside the timeout
     callback, so the effect body never calls setState synchronously. */
  useEffect(() => {
    const role = ROLES[t.idx];

    if (!t.deleting && t.typed === role) {
      const hold = window.setTimeout(() => setT((s) => ({ ...s, deleting: true })), 2000);
      return () => window.clearTimeout(hold);
    }

    const step = window.setTimeout(() => {
      setT((s) => {
        const r = ROLES[s.idx];
        if (!s.deleting) return { ...s, typed: r.slice(0, s.typed.length + 1) };
        const next = r.slice(0, s.typed.length - 1);
        return next === ''
          ? { idx: (s.idx + 1) % ROLES.length, typed: '', deleting: false }
          : { ...s, typed: next };
      });
    }, t.deleting ? 45 : 85);

    return () => window.clearTimeout(step);
  }, [t]);

  return t.typed;
}

/* ── Project card ───────────────────────────────────────────────────── */

function ProjectCard({ project }: { project: Project }) {
  const [version, setVersion] = useState(project.versions?.[0].key ?? '');
  const active = project.versions?.find((v) => v.key === version) ?? project.versions?.[0];

  const desc = active ? active.desc : project.description;
  const impact = active ? active.impact : project.impact;
  const tech = active ? active.tech : project.tech ?? [];

  return (
    <article
      className={
        GLASS +
        ' flex flex-col overflow-hidden transition-[transform,border-color] [transition-duration:400ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] hover:-translate-y-1.5 hover:border-[color-mix(in_oklab,var(--p)_45%,transparent)]'
      }
    >
      <div
        className="relative grid aspect-video place-items-center overflow-hidden border-b border-line"
        style={{ background: 'linear-gradient(140deg,color-mix(in oklab,var(--p) 18%,transparent),color-mix(in oklab,var(--s) 12%,transparent))' }}
      >
        <svg width="100%" height="100%" viewBox="0 0 340 190" preserveAspectRatio="none" className="absolute inset-0 opacity-35">
          <g fill="none" stroke="var(--a)" strokeWidth="1" strokeOpacity=".5">
            <path d="M-10 150 H70 l24 -24 H180 l20 20 H350" />
            <path d="M-10 60 H90 l30 30 H240 l26 -26 H350" />
          </g>
        </svg>
        <span
          className="relative text-[74px] font-extrabold tracking-[-.05em]"
          style={{ color: 'color-mix(in oklab,var(--fg) 10%,transparent)' }}
        >
          {project.title.charAt(0)}
        </span>
        {project.flagship && (
          <span className="absolute left-3 top-3 rounded-full bg-a px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.14em] text-bg">
            Flagship
          </span>
        )}
        {project.hasVideo && (
          <span
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-line px-[11px] py-[5px] font-mono text-[10.5px] text-fg2"
            style={{ background: 'color-mix(in oklab,var(--bg) 70%,transparent)' }}
          >
            <Play className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
            Demo video
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-[11px] px-5 pb-[22px] pt-5">
        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[.14em] text-fg3">
          <span className="text-a">{project.category}</span>
          <span>·</span>
          <span>{project.timeline}</span>
        </div>

        <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-.015em]">{project.title}</h3>

        {project.versions && (
          <div className="flex w-fit gap-1.5 rounded-[11px] border border-line bg-surf2 p-1">
            {project.versions.map((v) => {
              const on = v.key === version;
              return (
                <button
                  key={v.key} type="button" onClick={() => setVersion(v.key)}
                  className="rounded-lg px-[13px] py-1.5 font-mono text-[11.5px] font-semibold transition-all [transition-duration:250ms]"
                  style={
                    on
                      ? { background: 'linear-gradient(135deg,var(--p),var(--s))', color: 'var(--bg)' }
                      : { background: 'transparent', color: 'var(--fg2)' }
                  }
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[13px] leading-[1.6] text-fg2 [text-wrap:pretty]">{desc}</p>
        {impact && <p className="mt-0.5 text-[12px] font-medium text-a">{impact}</p>}

        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {tech?.map((t) => (
            <span key={t} className="rounded-[6px] border border-line bg-surf2 px-[9px] py-1 font-mono text-[10.5px] text-fg2">
              {t}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-4 pt-3.5">
          {project.demoUrl && (
            <Link to={project.demoUrl} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg transition-colors hover:text-a">
              Live demo <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
          <a
            href={project.githubUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-fg2 transition-colors hover:text-fg"
          >
            Source <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}

/* ── Contact form ───────────────────────────────────────────────────── */

const FIELD =
  'w-full rounded-[11px] border border-line bg-surf2 px-3.5 py-3 text-[13.5px] text-fg outline-none placeholder:text-fg3 focus:border-p';
const LABEL = 'mb-[7px] block font-mono text-[9.5px] uppercase tracking-[.18em] text-fg3';

function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [note, setNote] = useState('');

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'sending') return;
    const form = new FormData(e.currentTarget);
    setStatus('sending');
    setNote('');
    try {
      const res = await fetch(`${CHAT_API_BASE}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          message: form.get('message'),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Send failed.');
      setStatus('sent');
      /* The server tells us whether it actually delivered the mail. Without a
         mail provider configured it only logs to an ephemeral disk, so don't
         promise an inbox that never received anything. */
      setNote(
        body.delivered
          ? 'Thanks — that reached my inbox. I usually reply within a day.'
          : `Thanks — got it. Mail delivery isn't configured yet, so please also email me at ${CONTACT.email} to be sure.`,
      );
      e.currentTarget.reset();
    } catch (err) {
      setStatus('error');
      setNote(
        err instanceof Error && err.message
          ? err.message
          : `Could not send. Email me directly at ${CONTACT.email}.`,
      );
    }
  };

  return (
    <form onSubmit={submit} className={GLASS + ' flex flex-col gap-4 p-7'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-name" className={LABEL}>Name</label>
          <input id="cf-name" name="name" type="text" required placeholder="Your name" className={FIELD} />
        </div>
        <div>
          <label htmlFor="cf-email" className={LABEL}>Email</label>
          <input id="cf-email" name="email" type="email" required placeholder="your@email.com" className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="cf-msg" className={LABEL}>Message</label>
        <textarea id="cf-msg" name="message" rows={6} required placeholder="Tell me about the role or project..." className={FIELD + ' resize-none'} />
      </div>
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center justify-center gap-2.5 rounded-xl py-3.5 text-[13.5px] font-semibold text-bg transition-[filter] hover:brightness-110 disabled:opacity-70"
        style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
      >
        <Send className="h-[15px] w-[15px]" strokeWidth={2} />
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
      {note && (
        <p className={'text-[12.5px] leading-[1.55] ' + (status === 'error' ? 'text-[#f87171]' : 'text-a')}>
          {note}
        </p>
      )}
    </form>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function Home() {
  /* Read once during initialisation, not in an effect — that avoids both a
     wrong-palette first paint and a cascading re-render on mount. */
  const [palette, setPalette] = useState<PaletteKey>(readStoredPalette);
  const [category, setCategory] = useState('All');
  const [chatOpen, setChatOpen] = useState(false);
  const typedRole = useTypedRole();

  useEffect(() => { applyPalette(palette); }, [palette]);

  const pickPalette = (k: PaletteKey) => {
    setPalette(k);
    storePalette(k);
  };

  const visible = useMemo(
    () => (category === 'All' ? PROJECTS : PROJECTS.filter((p) => p.category === category)),
    [category],
  );

  return (
    <div className="relative min-h-screen bg-bg text-fg">
      <SiteBackground paletteKey={palette} />
      <SiteHeader palette={palette} onPalette={pickPalette} />

      <main className="relative z-[1]">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section id="hero" className="flex min-h-screen flex-col justify-center px-[26px] pb-[70px] pt-[120px]">
          <div className={SHELL + ' grid items-center gap-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]'}>
            <div>
              <div className="mb-[26px] inline-flex animate-rise items-center gap-[9px] rounded-full border border-line bg-surf2 py-[5px] pl-2 pr-3">
                <span className="relative grid h-2 w-2 place-items-center">
                  <span className="absolute inset-0 animate-ping-slow rounded-full bg-[#22c55e]" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                </span>
                <span className="font-mono text-[11px] leading-none tracking-[.08em] text-fg2">
                  Open to roles · {CONTACT.location}
                </span>
              </div>

              <p className="mb-3.5 animate-rise font-mono text-[12px] font-medium uppercase leading-none tracking-[.22em] text-fg3 [animation-delay:.08s]">
                {typedRole}
                <span className="animate-blink text-p">_</span>
              </p>

              <h1 className="mb-[22px] animate-rise text-[clamp(46px,6.4vw,86px)] font-extrabold leading-[.94] tracking-[-.035em] [animation-delay:.14s]">
                Soham{' '}
                <span style={{ ...gradientText('p', 's'), textShadow: '0 0 60px color-mix(in oklab,var(--p) 35%,transparent)' }}>
                  Patel
                </span>
              </h1>

              <p className="mb-4 max-w-[560px] animate-rise text-[18px] font-medium leading-[1.45] [animation-delay:.2s]">
                Software Engineer — Industrial AI, Digital Twins &amp; Production Systems
              </p>
              <p className="mb-[30px] max-w-[540px] animate-rise text-[14.5px] leading-[1.65] text-fg2 [text-wrap:pretty] [animation-delay:.26s]">
                2.5+ years building production software in healthcare and fintech, now focused on digital
                twins, computer vision, and predictive maintenance for industrial automation. Gold Medalist
                M.Sc. (IT).
              </p>

              <div className="flex animate-rise flex-wrap gap-3 [animation-delay:.32s]">
                <a
                  href="#projects"
                  className="inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-[13.5px] font-semibold text-bg transition-[filter] hover:brightness-110"
                  style={{
                    background: 'linear-gradient(135deg,var(--p),var(--s))',
                    boxShadow: '0 12px 30px -10px color-mix(in oklab,var(--p) 70%,transparent)',
                  }}
                >
                  View Projects
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                </a>
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surf2 px-[22px] py-3 text-[13.5px] font-medium text-fg transition-colors hover:border-[color-mix(in_oklab,var(--a)_60%,transparent)]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-a" strokeWidth={1.8} />
                  Ask JARVIS about my work
                </button>
              </div>
            </div>

            <div className="animate-rise [animation-delay:.4s]">
              <div
                className="overflow-hidden rounded-[20px] border border-line bg-surf backdrop-blur-[20px] backdrop-saturate-[180%]"
                style={{ boxShadow: '0 30px 60px -24px rgba(0,0,0,.6)' }}
              >
                <div className="flex items-center gap-2 border-b border-line bg-surf2 px-4 py-3">
                  <span className="h-[9px] w-[9px] rounded-full bg-p opacity-70" />
                  <span className="font-mono text-[10.5px] uppercase leading-none tracking-[.16em] text-fg3">
                    at a glance
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  {HERO_STATS.map((s) => (
                    <div key={s.label} className="border-b border-r border-line px-5 py-[22px]">
                      <div className="text-[26px] font-bold tracking-[-.02em] text-fg">{s.value}</div>
                      <div className="mt-[5px] font-mono text-[10px] uppercase leading-[1.4] tracking-[.13em] text-fg3">
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-[7px] px-5 py-4">
                  {HERO_TAGS.map((t) => (
                    <span key={t} className="rounded-[7px] border border-line bg-surf2 px-2.5 py-[5px] font-mono text-[11px] text-fg2">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Projects ─────────────────────────────────────────────── */}
        <section id="projects" className={SECTION}>
          <div className={SHELL}>
            <div className="mb-[38px] flex flex-wrap items-end justify-between gap-[30px]">
              <div>
                <p className={EYEBROW}>01 — Selected work</p>
                <h2 className={H2}>
                  Projects that <span style={gradientText('p', 'a')}>shipped</span>
                </h2>
              </div>
              <p className="max-w-[330px] text-[13.5px] leading-[1.6] text-fg2">
                Eight builds across industrial AI, computer vision and embedded systems. Filter by domain.
              </p>
            </div>

            <div className="mb-[34px] flex flex-wrap gap-2 border-b border-line pb-[26px]">
              {CATEGORIES.map((c) => {
                const on = c === category;
                return (
                  <button
                    key={c} type="button" onClick={() => setCategory(c)}
                    className="rounded-full border px-4 py-2 text-[12.5px] font-medium transition-all [transition-duration:250ms]"
                    style={
                      on
                        ? { background: 'linear-gradient(135deg,var(--p),var(--s))', color: 'var(--bg)', borderColor: 'transparent' }
                        : { background: 'var(--surf2)', color: 'var(--fg2)', borderColor: 'var(--line)' }
                    }
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
              {visible.map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          </div>
        </section>

        {/* ── Experience ───────────────────────────────────────────── */}
        <section id="experience" className={SECTION}>
          <div className={SHELL}>
            <p className={EYEBROW}>02 — Career</p>
            <h2 className={H2 + ' mb-[46px]'}>
              Where I&apos;ve <span style={gradientText('p', 's')}>worked</span>
            </h2>

            <div className="flex flex-col gap-1.5">
              {EXPERIENCES.map((e) => (
                <div key={e.role} className="grid items-start gap-0 sm:grid-cols-[150px_28px_minmax(0,1fr)]">
                  <div className="pb-2 pr-0 pt-[22px] sm:pb-[22px] sm:pr-5 sm:text-right">
                    <p className="font-mono text-[11.5px] tracking-[.02em] text-fg2">{e.period}</p>
                    <p className="mt-[5px] font-mono text-[10px] uppercase tracking-[.14em] text-fg3">{e.type}</p>
                  </div>
                  <div className="relative hidden h-full justify-center sm:flex">
                    <span className="absolute bottom-0 top-0 w-px bg-line" />
                    <span
                      className="relative mt-[26px] h-[9px] w-[9px] rounded-full bg-p"
                      style={{ boxShadow: '0 0 0 4px color-mix(in oklab,var(--p) 18%,transparent)' }}
                    />
                  </div>
                  <div className="my-1 rounded-2xl border border-transparent px-[22px] py-[18px] transition-all [transition-duration:350ms] hover:border-line hover:bg-surf">
                    <h3 className="text-[16.5px] font-semibold tracking-[-.01em]">{e.role}</h3>
                    <p className="mt-[5px] text-[13px] text-a">
                      {e.company} <span className="text-fg3">· {e.location}</span>
                    </p>
                    <p className="mt-[11px] max-w-[640px] text-[13.5px] leading-[1.65] text-fg2 [text-wrap:pretty]">
                      {e.description}
                    </p>
                    <div className="mt-[13px] flex flex-wrap gap-1.5">
                      {e.technologies.map((t) => <span key={t} className={CHIP}>{t}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Skills ───────────────────────────────────────────────── */}
        <section id="skills" className={SECTION}>
          <div className={SHELL}>
            <div className="mb-[44px] flex flex-wrap items-end justify-between gap-[30px]">
              <div>
                <p className={EYEBROW}>03 — Expertise</p>
                <h2 className={H2}>
                  Skills, with <span style={gradientText('a', 'p')}>receipts</span>
                </h2>
              </div>
              <p className="max-w-[330px] text-[13.5px] leading-[1.6] text-fg2">
                Every capability below is tied to the project or role where it ran in production.
              </p>
            </div>

            <div className="mb-[26px] grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
              {DOMAINS.map((d) => (
                <div
                  key={d.no}
                  className={GLASS + ' px-6 py-[26px] transition-[transform,border-color] [transition-duration:400ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] hover:-translate-y-[5px] hover:border-[color-mix(in_oklab,var(--a)_42%,transparent)]'}
                >
                  <div className="mb-3.5 flex items-center gap-[11px]">
                    <span
                      className="grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-line font-mono text-[12px] font-semibold text-p"
                      style={{ background: 'color-mix(in oklab,var(--p) 16%,transparent)' }}
                    >
                      {d.no}
                    </span>
                    <h3 className="text-[16px] font-semibold tracking-[-.01em]">{d.title}</h3>
                  </div>
                  <p className="mb-[15px] text-[13px] leading-[1.6] text-fg2 [text-wrap:pretty]">{d.claim}</p>
                  <div className="mb-[15px] flex flex-wrap gap-1.5">
                    {d.items.map((i) => (
                      <span key={i} className="rounded-[7px] border border-line bg-surf2 px-2.5 py-[4.5px] font-mono text-[11px] text-fg2">
                        {i}
                      </span>
                    ))}
                  </div>
                  <div className="border-t border-line pt-[13px]">
                    <p className="mb-[7px] font-mono text-[9.5px] uppercase tracking-[.16em] text-fg3">Proven in</p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.proof.map((pr) => (
                        <a
                          key={pr} href="#projects"
                          className="rounded-full px-2.5 py-[4.5px] text-[11px] text-a transition-colors"
                          style={{
                            background: 'color-mix(in oklab,var(--a) 12%,transparent)',
                            border: '1px solid color-mix(in oklab,var(--a) 30%,transparent)',
                          }}
                        >
                          {pr}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={GLASS + ' overflow-hidden'}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5">
                <h3 className="text-[15px] font-semibold">Capability matrix</h3>
                <div className="flex flex-wrap gap-4 font-mono text-[10.5px] text-fg3">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-p" />Production</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-s" />Strong working</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ background: 'color-mix(in oklab,var(--fg3) 70%,transparent)' }} />
                    Explored
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                {MATRIX.map((m) => (
                  <div
                    key={m.skill}
                    className="grid min-w-[560px] items-center gap-4 border-b border-line px-6 py-[13px] [grid-template-columns:190px_96px_minmax(0,1fr)]"
                  >
                    <span className="text-[13px] font-medium text-fg">{m.skill}</span>
                    <span
                      className="justify-self-start rounded-[6px] px-[9px] py-[3px] font-mono text-[10px] font-medium uppercase tracking-[.06em]"
                      style={{ background: TIER_STYLE[m.tier].bg, color: TIER_STYLE[m.tier].fg }}
                    >
                      {m.tier}
                    </span>
                    <span className="text-[12.5px] leading-[1.5] text-fg2">{m.where}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── About ────────────────────────────────────────────────── */}
        <section id="about" className={SECTION}>
          <div className={SHELL + ' grid items-start gap-[60px] lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]'}>
            <div className="lg:sticky lg:top-[100px]">
              <p className={EYEBROW}>04 — About</p>
              <h2 className="mb-5 text-[clamp(32px,3.9vw,50px)] font-bold leading-[1.06] tracking-[-.03em]">
                Bridging research and production
              </h2>
              <p className="max-w-[400px] text-[14px] leading-[1.7] text-fg2 [text-wrap:pretty]">
                Research prototypes are easy to demo and hard to run. I spend my time on the second part:
                containers, pipelines, tests, and the boring reliability work that turns a notebook into a
                system someone depends on.
              </p>
            </div>
            <div className="grid gap-3.5">
              {HIGHLIGHTS.map((h) => (
                <div
                  key={h.title}
                  className="rounded-2xl border border-line bg-surf px-[26px] py-6 backdrop-blur-[16px] backdrop-saturate-[170%] transition-[border-color,transform] [transition-duration:350ms] hover:translate-x-1.5 hover:border-[color-mix(in_oklab,var(--s)_45%,transparent)]"
                >
                  <h3 className="mb-2.5 flex items-center gap-2.5 text-[15.5px] font-semibold tracking-[-.01em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-s" />
                    {h.title}
                  </h3>
                  <p className="text-[13.5px] leading-[1.65] text-fg2 [text-wrap:pretty]">{h.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Research ─────────────────────────────────────────────── */}
        <section id="research" className={SECTION}>
          <div className={SHELL}>
            <p className={EYEBROW}>05 — Research</p>
            <h2 className={H2 + ' mb-10'}>
              Current <span style={gradientText('s', 'a')}>interests</span>
            </h2>

            <div className="mb-[34px] grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
              {INTERESTS.map((i) => (
                <div
                  key={i.title}
                  className="rounded-2xl border border-line bg-surf px-6 py-[26px] backdrop-blur-[16px] backdrop-saturate-[170%] transition-transform [transition-duration:400ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] hover:-translate-y-[5px]"
                >
                  <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[.18em] text-a">{i.tag}</p>
                  <h3 className="mb-2.5 text-[16px] font-semibold tracking-[-.01em]">{i.title}</h3>
                  <p className="text-[13px] leading-[1.65] text-fg2 [text-wrap:pretty]">{i.desc}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-[18px] md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surf px-6 py-[26px]">
                <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[.18em] text-fg3">Education</p>
                {EDUCATION.map((ed) => (
                  <div key={ed.degree} className="border-t border-line py-3.5">
                    <p className="mb-1 font-mono text-[11px] text-fg3">{ed.period}</p>
                    <h4 className="text-[14px] font-semibold leading-[1.35]">{ed.degree}</h4>
                    <p className="mt-[5px] text-[12.5px] text-fg2">{ed.institution} · {ed.location}</p>
                    <span
                      className="mt-2 inline-block rounded-[6px] px-[9px] py-[3px] font-mono text-[10.5px] text-p"
                      style={{
                        background: 'color-mix(in oklab,var(--p) 14%,transparent)',
                        border: '1px solid color-mix(in oklab,var(--p) 28%,transparent)',
                      }}
                    >
                      {ed.grade}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-line bg-surf px-6 py-[26px]">
                <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[.18em] text-fg3">Talks</p>
                <div className="border-t border-line py-3.5">
                  <h4 className="text-[14px] font-semibold leading-[1.4]">
                    3D Shape-to-Image Brownian Bridge Diffusion (Cor2Vox)
                  </h4>
                  <p className="mt-1.5 text-[12.5px] text-fg2">
                    AI Conference 2025 · Keynote
                    <span
                      className="ml-1.5 inline-block rounded-[6px] px-2 py-0.5 font-mono text-[10px] text-[#4ade80]"
                      style={{ background: 'color-mix(in oklab,#22c55e 16%,transparent)' }}
                    >
                      Grade 1.0
                    </span>
                  </p>
                  <p className="mt-[11px] text-[13px] leading-[1.65] text-fg2 [text-wrap:pretty]">
                    Technical keynote on anatomically plausible 3D medical image generation from structural
                    priors using Brownian Bridge Diffusion models.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact ──────────────────────────────────────────────── */}
        <section id="contact" className="px-[26px] pb-[90px] pt-[110px]">
          <div className={SHELL}>
            <p className={EYEBROW}>06 — Contact</p>
            <h2 className={H2 + ' mb-11'}>
              Let&apos;s <span style={gradientText('p', 's')}>talk</span>
            </h2>

            <div className="grid items-start gap-[46px] lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
              <div className="flex flex-col gap-[22px]">
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="flex items-center gap-3.5 rounded-[14px] border border-line bg-surf px-[18px] py-4 text-fg transition-colors hover:border-[color-mix(in_oklab,var(--p)_50%,transparent)]"
                >
                  <span
                    className="grid h-[38px] w-[38px] place-items-center rounded-[11px]"
                    style={{ background: 'color-mix(in oklab,var(--p) 15%,transparent)' }}
                  >
                    <Mail className="h-4 w-4 text-p" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[9.5px] uppercase tracking-[.16em] text-fg3">Email</span>
                    <span className="mt-[3px] block truncate text-[13.5px] font-medium">{CONTACT.email}</span>
                  </span>
                </a>

                <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-surf px-[18px] py-4">
                  <span
                    className="grid h-[38px] w-[38px] place-items-center rounded-[11px]"
                    style={{ background: 'color-mix(in oklab,var(--s) 15%,transparent)' }}
                  >
                    <MapPin className="h-4 w-4 text-s" strokeWidth={1.7} />
                  </span>
                  <span>
                    <span className="block font-mono text-[9.5px] uppercase tracking-[.16em] text-fg3">Location</span>
                    <span className="mt-[3px] block text-[13.5px] font-medium">{CONTACT.location}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {LANGUAGES.map((l) => (
                    <div key={l.name} className="rounded-[13px] border border-line bg-surf2 px-4 py-3.5">
                      <p className="mb-[5px] text-[13px] font-semibold">{l.name}</p>
                      <p className="text-[11.5px] leading-[1.5] text-fg2">{l.level}</p>
                    </div>
                  ))}
                </div>

                <div
                  className="inline-flex w-fit items-center gap-2.5 rounded-full px-[15px] py-2.5"
                  style={{
                    background: 'color-mix(in oklab,#22c55e 14%,transparent)',
                    border: '1px solid color-mix(in oklab,#22c55e 30%,transparent)',
                  }}
                >
                  <span className="h-[7px] w-[7px] rounded-full bg-[#22c55e]" />
                  <span className="text-[12.5px] text-[#4ade80]">{CONTACT.availability}</span>
                </div>
              </div>

              <ContactForm />
            </div>
          </div>
        </section>

        <footer className="border-t border-line px-[26px] pb-10 pt-[30px]">
          <div className={SHELL + ' flex flex-wrap items-center justify-between gap-5'}>
            <span className="font-mono text-[12px] text-fg3">© 2026 Soham Patel</span>
            <div className="flex items-center gap-3.5">
              <a href={CONTACT.github} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-fg2 transition-colors hover:text-fg">GitHub</a>
              <a href={`mailto:${CONTACT.email}`} className="text-[12.5px] text-fg2 transition-colors hover:text-fg">Email</a>
              <a href="#hero" className="font-mono text-[11px] uppercase tracking-[.14em] text-fg3 transition-colors hover:text-fg">Back to top ↑</a>
            </div>
          </div>
        </footer>
      </main>

      <Suspense fallback={null}>
        <ChatPanel open={chatOpen} onOpenChange={setChatOpen} />
      </Suspense>
    </div>
  );
}
