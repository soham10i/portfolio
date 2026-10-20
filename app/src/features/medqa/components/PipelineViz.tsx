/* TraceWaterfall — where the time went, step by step.
 *
 * Each trace step is a row: its name, a bar placed on a shared time axis (by
 * its start `at` when the backend reports it, otherwise stacked after the
 * previous step), its duration, and the step's own detail (entities found,
 * top retrieval scores, the generated answer, the NLI verdict, option scores). */
import { Activity, Brain, CheckCircle2, Database, MessageSquare, Search, Sparkles, type LucideIcon } from 'lucide-react';

export interface TraceStep {
  step: string;
  detail: Record<string, unknown>;
  duration?: number;
  at?: number;
}

const META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  entity_extraction: { label: 'Entity extraction', icon: Sparkles, color: '#f59e0b' },
  embedding: { label: 'Embedding · MiniLM-L6', icon: Brain, color: '#38bdf8' },
  retrieval: { label: 'Vector retrieval', icon: Database, color: '#10b981' },
  context_assembly: { label: 'Context assembly', icon: Search, color: '#fb923c' },
  generation: { label: 'LLM generation', icon: MessageSquare, color: '#8b5cf6' },
  nli_verification: { label: 'NLI verification', icon: CheckCircle2, color: '#f43f5e' },
  similarity_scoring: { label: 'Option scoring', icon: Activity, color: '#06b6d4' },
};

const fmt = (ms?: number) => (ms === undefined ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export default function TraceWaterfall({ trace, totalTime }: { trace: TraceStep[]; totalTime: number }) {
  if (!trace.length) return <p className="py-8 text-center text-[13.5px] text-fg3">No trace was returned.</p>;

  const { rows, end } = trace.reduce<{ rows: { t: TraceStep; start: number; dur: number }[]; end: number }>(
    (acc, t) => {
      const start = typeof t.at === 'number' ? t.at : acc.end;
      const dur = t.duration ?? 0;
      return { rows: [...acc.rows, { t, start, dur }], end: Math.max(acc.end, start + dur) };
    },
    { rows: [], end: 0 },
  );
  const span = Math.max(totalTime || 0, end, 1);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="mono !text-[9.5px] text-fg3">0 ms</p>
        <p className="mono !text-[9.5px] text-fg3">total {fmt(span)}</p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {rows.map(({ t, start, dur }, i) => {
          const m = META[t.step] ?? { label: t.step.replace(/_/g, ' '), icon: Activity, color: 'var(--fg3)' };
          const Icon = m.icon;
          return (
            <li key={i} className="rounded-[16px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${m.color} 18%, transparent)`, color: m.color }}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{m.label}</span>
                <span className="mono flex-none !text-[10.5px] text-fg2">{fmt(dur)}</span>
              </div>
              <div className="relative mt-2.5 h-2 rounded-full bg-[color:var(--surf2)]">
                <span className="absolute inset-y-0 rounded-full"
                  style={{ left: `${(start / span) * 100}%`, width: `${Math.max(1.5, (dur / span) * 100)}%`, background: m.color }} />
              </div>
              <Detail step={t.step} detail={t.detail} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Detail({ step, detail }: { step: string; detail: Record<string, unknown> }) {
  const chip = 'rounded-full border border-[color:var(--line)] px-2.5 py-0.5 text-[12px] text-fg2';
  if (step === 'entity_extraction') {
    const entities = (detail.entities as string[]) || [];
    return (
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {entities.length ? entities.map((e) => <span key={e} className={chip}>{e}</span>) : <span className="text-[12px] text-fg3">No entities detected</span>}
      </div>
    );
  }
  if (step === 'retrieval') {
    const scores = (detail.scores as { id: number; score: number }[]) || [];
    return (
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {scores.slice(0, 5).map((s) => <span key={s.id} className={chip}>#{s.id} · {s.score.toFixed(3)}</span>)}
      </div>
    );
  }
  if (step === 'generation') {
    const error = detail.error as string | undefined;
    return error
      ? <p className="mt-2.5 text-[12.5px] text-[#ef4444]">{error}</p>
      : <p className="mt-2.5 text-[12.5px] text-fg2">answer <strong className="text-fg">{String(detail.answer ?? '—')}</strong> · confidence {Number(detail.confidence ?? 0).toFixed(2)}</p>;
  }
  if (step === 'nli_verification') {
    return <p className="mt-2.5 text-[12.5px] text-fg2">verdict <strong className="text-fg">{String(detail.verdict ?? '—')}</strong> · confidence {Number(detail.confidence ?? 0).toFixed(2)}</p>;
  }
  if (step === 'similarity_scoring') {
    const scores = (detail.scores as Record<string, number>) || {};
    const best = detail.best as string;
    return (
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {Object.entries(scores).map(([k, v]) => (
          <span key={k} className={chip} style={k === best ? { borderColor: 'var(--a)', color: 'var(--fg)' } : undefined}>{k} · {v.toFixed(3)}</span>
        ))}
      </div>
    );
  }
  return null;
}
