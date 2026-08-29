/* PipelineViz.tsx — step-by-step RAG pipeline visualization */
import { useEffect, useState } from 'react';
import {
  Brain,
  Search,
  Database,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  Activity,
} from 'lucide-react';

interface TraceStep {
  step: string;
  detail: Record<string, unknown>;
  duration?: number;
  at?: number;
}

interface PipelineVizProps {
  trace: TraceStep[];
  totalTime: number;
  active: boolean;
}

const STEP_META: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  entity_extraction: { label: 'Entity Extraction', icon: Sparkles, color: 'text-amber-400' },
  embedding: { label: 'Embedding (all-MiniLM-L6-v2)', icon: Brain, color: 'text-sky-400' },
  retrieval: { label: 'Vector Retrieval', icon: Database, color: 'text-emerald-400' },
  generation: { label: 'LLM Generation', icon: MessageSquare, color: 'text-violet-400' },
  nli_verification: { label: 'NLI Verification', icon: CheckCircle2, color: 'text-rose-400' },
  similarity_scoring: { label: 'Option Scoring', icon: Activity, color: 'text-cyan-400' },
  context_assembly: { label: 'Context Assembly', icon: Search, color: 'text-orange-400' },
};

function formatMs(ms?: number) {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export default function PipelineViz({ trace, totalTime, active }: PipelineVizProps) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!active) { setRevealed(0); return; }
    setRevealed(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= trace.length) clearInterval(timer);
    }, 350);
    return () => clearInterval(timer);
  }, [active, trace]);

  if (!active || trace.length === 0) return null;

  return (
    <div className="rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg2">
          Pipeline Trace
        </h3>
        <span className="rounded-[7px] bg-[color-mix(in_oklab,var(--a)_12%,transparent)] px-2 py-0.5 text-[10px] font-mono text-[var(--a)]">
          Total: {formatMs(totalTime)}
        </span>
      </div>

      <div className="space-y-2.5">
        {trace.map((t, idx) => {
          const meta = STEP_META[t.step] || { label: t.step, icon: Activity, color: 'text-fg2' };
          const Icon = meta.icon;
          const isRevealed = idx < revealed;
          const isCurrent = idx === revealed - 1;

          return (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-[12px] border px-3.5 py-3 transition-all duration-500 ${
                isRevealed
                  ? 'border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] opacity-100'
                  : 'border-transparent opacity-0'
              } ${isCurrent ? 'ring-1 ring-[var(--a)]/20' : ''}`}
            >
              <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-fg">{meta.label}</span>
                  {t.duration !== undefined && (
                    <span className="shrink-0 text-[10px] font-mono text-fg2">{formatMs(t.duration)}</span>
                  )}
                </div>
                <StepDetail step={t.step} detail={t.detail} />
              </div>
              {idx < trace.length - 1 && (
                <div className="absolute left-[26px] mt-5 h-3 w-px bg-line" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepDetail({ step, detail }: { step: string; detail: Record<string, unknown> }) {
  if (step === 'entity_extraction') {
    const entities = (detail.entities as string[]) || [];
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {entities.map((e) => (
          <span key={e} className="rounded-[6px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-1.5 py-0.5 text-[9px] text-fg2">
            {e}
          </span>
        ))}
        {entities.length === 0 && <span className="text-[9px] text-fg2 italic">No entities detected</span>}
      </div>
    );
  }

  if (step === 'retrieval') {
    const scores = (detail.scores as { id: number; score: number }[]) || [];
    return (
      <div className="mt-1.5 space-y-1">
        {scores.slice(0, 3).map((s) => (
          <div key={s.id} className="flex items-center justify-between text-[9px]">
            <span className="truncate text-fg2">Record #{s.id}</span>
            <span className="shrink-0 font-mono text-emerald-400">{s.score.toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (step === 'generation') {
    const answer = detail.answer as string;
    const confidence = detail.confidence as number;
    const error = detail.error as string | undefined;
    return (
      <div className="mt-1.5">
        {error ? (
          <span className="flex items-center gap-1 text-[9px] text-rose-400">
            <AlertTriangle size={10} /> {error}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--a)]">
              {answer}
            </span>
            <span className="text-[9px] text-fg2">conf: {(confidence ?? 0).toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  }

  if (step === 'nli_verification') {
    const verdict = detail.verdict as string;
    const confidence = detail.confidence as number;
    const color = verdict === 'entails' ? 'text-emerald-400' : verdict === 'contradicts' ? 'text-rose-400' : 'text-amber-400';
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`text-[10px] font-medium ${color}`}>{verdict}</span>
        <span className="text-[9px] text-fg2">conf: {(confidence ?? 0).toFixed(2)}</span>
      </div>
    );
  }

  if (step === 'similarity_scoring') {
    const scores = detail.scores as Record<string, number>;
    const best = detail.best as string;
    return (
      <div className="mt-1.5 flex flex-wrap gap-2">
        {scores && Object.entries(scores).map(([k, v]) => (
          <span key={k} className={`text-[9px] font-mono ${k === best ? 'text-[var(--a)] font-semibold' : 'text-fg2'}`}>
            {k}: {v.toFixed(3)}
          </span>
        ))}
      </div>
    );
  }

  return null;
}
