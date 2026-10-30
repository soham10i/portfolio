/* A vertical timeline: one connecting rail on the left, a node per entry, so
   a list of roles or degrees reads top-to-bottom as one sequence in time.
   Entries are expected newest-first; the rail makes the order visible
   without any numbering. */

export interface TimelineEntry {
  period: string;
  badge?: string;
  title: string;
  place: string;
  lead?: string;
  body?: string;
  points?: string[];
  foot?: string[];
}

export default function Timeline({ entries, accent = 'var(--p)' }: { entries: TimelineEntry[]; accent?: string }) {
  return (
    <ol className="relative ml-2 border-l border-[color:var(--line)] md:ml-3">
      {entries.map((e, i) => (
        <li
          key={e.period + e.title}
          data-reveal={Math.min(i * 0.06, 0.3)}
          className="group relative pb-[clamp(20px,3vh,32px)] pl-8 last:pb-0 md:pl-10"
        >
          {/* node on the rail */}
          <span
            aria-hidden
            className="absolute -left-[7px] top-[7px] h-3.5 w-3.5 rounded-full border-2 bg-[color:var(--bg)] transition-colors duration-300"
            style={{ borderColor: accent }}
          />
          {/* period rides the rail */}
          <span className="mono mb-1.5 flex flex-wrap items-center gap-2 text-fg3">
            {e.period}
            {e.badge && (
              <span className="rounded-full border border-[color:var(--line)] px-2 py-0.5 !text-[9.5px] text-fg2">{e.badge}</span>
            )}
          </span>

          <div className="lg-panel p-5 transition-transform duration-300 group-hover:-translate-y-0.5 md:p-6">
            <h3 className="text-[clamp(19px,1.8vw,25px)] font-medium leading-snug tracking-[-.02em]">{e.title}</h3>
            <p className="mt-1 text-[14px] text-fg2">{e.place}</p>
            {e.lead && <p className="mt-3 text-[14.5px] font-medium text-fg">{e.lead}</p>}
            {e.body && <p className="t-body mt-2">{e.body}</p>}
            {e.points && e.points.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {e.points.map((h) => (
                  <li key={h} className="relative pl-4 text-[13.5px] leading-relaxed text-fg2 before:absolute before:left-0 before:top-[.6em] before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--fg3)]">
                    {h}
                  </li>
                ))}
              </ul>
            )}
            {e.foot && (
              <p className="mt-4 border-t border-[color:var(--line)] pt-3 text-[12.5px] leading-relaxed text-fg3">
                {e.foot.join(' · ')}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
