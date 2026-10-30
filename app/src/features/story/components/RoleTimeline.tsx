import type { Experience } from '@/shared/data/portfolio';

/* The Experience timeline: same rail and nodes as Timeline, but each role is
   a short story rather than a CV line. On wide screens the facts a reader
   scans first — when, where, the numbers — sit in a side column, and the
   story (context, what was built, the tension, what carried forward) fills
   the main column. On narrow screens the side column stacks above. */
export default function RoleTimeline({ roles, accent = 'var(--p)' }: { roles: Experience[]; accent?: string }) {
  return (
    <ol className="relative ml-2 border-l border-[color:var(--line)] md:ml-3">
      {roles.map((r, i) => (
        <li
          key={r.period + r.role}
          data-reveal={Math.min(i * 0.06, 0.3)}
          className="group relative grid gap-4 pb-[clamp(28px,4.5vh,48px)] pl-8 last:pb-0 md:pl-10 lg:grid-cols-[minmax(190px,230px)_1fr] lg:gap-8"
        >
          {/* node on the rail */}
          <span
            aria-hidden
            className="absolute -left-[7px] top-[7px] h-3.5 w-3.5 rounded-full border-2 bg-[color:var(--bg)] transition-colors duration-300"
            style={{ borderColor: accent }}
          />

          {/* side column: when, where, and what moved */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <span className="mono mb-2 flex flex-wrap items-center gap-2 text-fg3">
              {r.period}
              <span className="rounded-full border border-[color:var(--line)] px-2 py-0.5 !text-[9.5px] text-fg2">{r.type}</span>
            </span>
            <p className="text-[15px] font-medium text-fg">{r.company}</p>
            <p className="text-[13.5px] text-fg3">{r.location}</p>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-1">
              {r.outcomes.map((o) => (
                <div key={o.label}>
                  <dt className="sr-only">{o.label}</dt>
                  <dd className="text-[clamp(26px,2.4vw,36px)] font-medium leading-none tracking-[-.03em]" style={{ color: accent }}>
                    {o.value}
                  </dd>
                  <dd className="mt-1.5 text-[12.5px] leading-snug text-fg2">{o.label}</dd>
                </div>
              ))}
            </dl>
          </aside>

          {/* the story */}
          <article className="lg-panel p-5 transition-transform duration-300 group-hover:-translate-y-0.5 md:p-7">
            <h3 className="text-[clamp(19px,1.8vw,25px)] font-medium leading-snug tracking-[-.02em]">{r.role}</h3>
            <p className="t-body mt-3 max-w-[78ch]">{r.context}</p>

            <p className="mono mb-3 mt-6 !text-[10px] text-fg3">The work</p>
            <ul className="grid gap-x-8 gap-y-5 xl:grid-cols-2">
              {r.tasks.map((t) => (
                <li key={t.title} className="border-l-2 pl-4" style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)` }}>
                  <h4 className="text-[15px] font-medium leading-snug text-fg">{t.title}</h4>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-fg2">{t.detail}</p>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid gap-4 border-t border-[color:var(--line)] pt-5 md:grid-cols-2 md:gap-8">
              <div>
                <p className="mono mb-1.5 !text-[10px] text-fg3">The hard part</p>
                <p className="text-[14px] leading-relaxed text-fg">{r.tension}</p>
              </div>
              <div>
                <p className="mono mb-1.5 !text-[10px] text-fg3">Carried forward</p>
                <p className="text-[14px] leading-relaxed text-fg2">{r.thread}</p>
              </div>
            </div>

            <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Stack">
              {r.technologies.map((t) => (
                <li key={t} className="lg-pill px-3 py-1 text-[12px] text-fg2">{t}</li>
              ))}
            </ul>
          </article>
        </li>
      ))}
    </ol>
  );
}
