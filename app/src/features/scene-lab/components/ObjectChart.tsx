const COLORS = ['#22d3ee', '#5ea2ff', '#b18cff', '#4ade80', '#f97316', '#f472b6'];

/* What the detector has seen this session: in how many keyframes each label
   appeared. Click a bar to filter the timeline to the frames containing it. */
export default function ObjectChart({ counts, total, filter, onFilter }: {
  counts: Record<string, number>;
  total: number;
  filter: string | null;
  onFilter: (label: string | null) => void;
}) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = rows[0]?.[1] ?? 1;

  return (
    <section className="lg-panel flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="mono text-fg3">Objects seen · {total} keyframe{total === 1 ? '' : 's'}</p>
        {filter && (
          <button type="button" onClick={() => onFilter(null)} className="mono !text-[10px] text-p hover:underline">
            Clear filter
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg3">Detections appear here as keyframes come in.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(([label, n], i) => {
            const on = filter === label;
            const dim = filter && !on;
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => onFilter(on ? null : label)}
                  className="group grid w-full grid-cols-[96px_1fr_36px] items-center gap-3 text-left transition-opacity"
                  style={{ opacity: dim ? 0.4 : 1 }}
                  aria-pressed={on}
                >
                  <span className="truncate text-[13px] text-fg2 group-hover:text-fg">{label}</span>
                  <span className="relative h-2.5 overflow-hidden rounded-full bg-[color:var(--surf2)]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(.16,1,.3,1)]"
                      style={{ width: `${(n / max) * 100}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </span>
                  <span className="mono text-right !text-[10.5px] text-fg2">{n}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
