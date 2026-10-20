/* MedQA — retrieval-augmented medical QA, interactive demo.
 *
 * Frontend only: the API contract is unchanged (GET /api/medqa/sample,
 * POST /api/medqa/ask, POST /api/medqa/followup; see backend/src/routes/medqa.js),
 * so the RAG system behind it can be re-engineered independently.
 *
 * Layout, in the site's gallery design (story.css): a hero with the pipeline
 * as a live strip; a workbench with the case on the left and the answer on the
 * right; an evidence panel (local corpus, external sources, timing trace); and
 * a follow-up thread. The background point cloud follows the pipeline state:
 * a DNA helix while idle, embedding-space clusters while it searches, a
 * molecule once it has answered.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowUp, Brain, CheckCircle2, Database, ExternalLink, FileSearch, Globe2, Loader2,
  MessageSquare, Play, RotateCcw, Sparkles, Wand2,
} from 'lucide-react';
import '@/features/story/story.css';
import PageHeader from '@/features/story/components/PageHeader';
import CloudLayer from '@/features/story/components/CloudLayer';
import JarvisOrb from '@/features/chat/components/JarvisOrb';
import TraceWaterfall, { type TraceStep } from './components/PipelineViz';

interface OptionMap { [key: string]: string }
interface EvidenceItem { id: number; question: string; answer: string; score: number }
interface ExternalItem { source: string; title: string; snippet?: string; url: string; type?: string }
interface RagResult {
  question: string;
  options: OptionMap;
  entities: string[];
  evidence: EvidenceItem[];
  external: ExternalItem[];
  externalMeta: { reason: string; queries: string[] } | null;
  generated: { answer: string; explanation: string; confidence: number; disclaimer: string };
  nli: { verdict: string; justification: string; confidence: number } | null;
  similarity: { scores: Record<string, number>; best: string };
  trace: TraceStep[];
  totalTime: number;
  disclaimer: string;
}
interface FollowUp { question: string; answer?: string; confidence?: number; error?: string }

const API_BASE = import.meta.env.VITE_API_BASE || '';
const EMPTY: OptionMap = { A: '', B: '', C: '', D: '' };

/* The architecture as the strip shows it; `keys` map to trace step names. */
const STAGES = [
  { label: 'Question', where: 'your case', Icon: Sparkles, keys: [] as string[] },
  { label: 'Entities', where: 'medical terms', Icon: Wand2, keys: ['entity_extraction'] },
  { label: 'Retrieval', where: 'MiniLM · cosine', Icon: Database, keys: ['embedding', 'retrieval'] },
  { label: 'Sources', where: 'PubMed · FDA · WHO', Icon: Globe2, keys: ['external', 'external_retrieval', 'context_assembly'] },
  { label: 'Generation', where: 'open-weight LLM', Icon: Brain, keys: ['generation'] },
  { label: 'Verification', where: 'NLI', Icon: CheckCircle2, keys: ['nli_verification', 'similarity_scoring'] },
];

const VERDICT: Record<string, { label: string; color: string }> = {
  entails: { label: 'Evidence supports the answer', color: '#16a34a' },
  contradicts: { label: 'Evidence contradicts the answer', color: '#ef4444' },
  neutral: { label: 'Evidence is inconclusive', color: '#f59e0b' },
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmtMs = (ms?: number) => (ms === undefined ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

function Bar({ value, color = 'var(--p)', max = 1 }: { value: number; color?: string; max?: number }) {
  return (
    <span className="relative block h-2 overflow-hidden rounded-full bg-[color:var(--surf2)]">
      <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(.16,1,.3,1)]"
        style={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </span>
  );
}

export default function MedqaDemo() {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<OptionMap>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [result, setResult] = useState<RagResult | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'local' | 'external' | 'trace'>('local');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUp, setFollowUp] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const sessionIdRef = useRef('');            // minted per case in runPipeline
  const answerRef = useRef<HTMLDivElement>(null);

  // background: 0 idle (helix) · 1 running (embedding search) · 2 answered (molecule)
  const cloudPos = loading ? 1 : result ? 2 : 0;

  const loadSample = useCallback(async () => {
    setError(''); setSampling(true);
    try {
      const res = await fetch(`${API_BASE}/api/medqa/sample`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load a sample');
      const { sample } = await res.json();
      setQuestion(sample.question);
      setOptions(sample.options || EMPTY);
      setResult(null); setFollowUps([]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSampling(false);
    }
  }, []);

  const runPipeline = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true); setError(''); setResult(null); setFollowUps([]);
    sessionIdRef.current = `medqa-${Date.now()}`;
    try {
      const res = await fetch(`${API_BASE}/api/medqa/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options, topK: 5, doNli: true, useExternal: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setResult(await res.json());
      setTab('local');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [question, options, loading]);

  useEffect(() => {
    if (result) answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [result]);

  const sendFollowUp = useCallback(async () => {
    const q = followUp.trim();
    if (!q || !result) return;
    setFollowUp('');
    setFollowUps((f) => [...f, { question: q }]);
    const settle = (patch: Partial<FollowUp>) =>
      setFollowUps((f) => f.map((m, i) => (i === f.length - 1 ? { ...m, ...patch } : m)));
    try {
      const res = await fetch(`${API_BASE}/api/medqa/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, question: q, topK: 5 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      settle({ answer: data.generated?.answer ?? '', confidence: data.generated?.confidence });
    } catch (e) {
      settle({ error: errMsg(e) });
    }
  }, [followUp, result]);

  const reset = () => {
    setQuestion(''); setOptions(EMPTY); setResult(null); setError(''); setFollowUps([]);
    sessionIdRef.current = `medqa-${Date.now()}`;
  };

  const stageTime = (keys: string[]) => {
    if (!result) return undefined;
    const ms = result.trace.filter((t) => keys.includes(t.step)).reduce((n, t) => n + (t.duration ?? 0), 0);
    return ms || undefined;
  };

  const chosen = result?.generated.answer;
  const verdict = result?.nli ? (VERDICT[result.nli.verdict] ?? VERDICT.neutral) : null;
  const pendingFollowUp = followUps.length > 0 && !followUps[followUps.length - 1].answer && !followUps[followUps.length - 1].error;

  return (
    <div className="story">
      <CloudLayer set="medqa" position={cloudPos} />
      <PageHeader back={{ to: '/project/medqa-nlp', label: 'Project' }} githubUrl="https://github.com/soham10i/natural-language-processing-project" />

      <main className="relative z-[1]">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section className="panel px-[var(--gutter)] pb-[clamp(28px,4vh,44px)] pt-[clamp(100px,13vh,136px)]"
          style={{ '--t1': 'rgba(236,72,153,.13)', '--t2': 'rgba(37,99,235,.14)' } as React.CSSProperties}>
          <div className="mb-[clamp(28px,4vh,44px)] flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mono mb-4 text-fg2">MedQA · retrieval-augmented answering</p>
              <h1 className="max-w-[16ch] text-[clamp(40px,6vw,88px)] font-medium leading-[.95] tracking-[-.05em]">
                Ask the evidence, <span className="serif text-p">not the model.</span>
              </h1>
              <p className="mt-5 max-w-[58ch] text-[clamp(15px,1.2vw,17px)] leading-relaxed text-fg2">
                A USMLE-style case goes through entity extraction, vector retrieval over a medical corpus, certified
                external sources when local evidence is thin, generation, and an NLI check that asks whether the
                evidence actually supports the answer.
              </p>
            </div>
            <button type="button" onClick={() => setShowDisclaimer((v) => !v)} aria-expanded={showDisclaimer}
              className="lg-pill inline-flex h-10 items-center gap-2 px-4 text-[13px]">
              <AlertTriangle className="h-4 w-4 text-[#f59e0b]" /> Educational only — not medical advice
            </button>
          </div>
          {showDisclaimer && (
            <p className="lg-panel mb-[clamp(20px,3vh,32px)] max-w-[80ch] px-5 py-4 text-[14px] leading-relaxed text-fg2">
              This system provides <strong className="text-fg">educational information only</strong> and is not a substitute for
              professional medical advice, diagnosis or treatment. Always seek the advice of a qualified healthcare provider,
              and never disregard professional advice because of something shown here. <strong className="text-fg">In an
              emergency, call your local emergency number.</strong>
            </p>
          )}

          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {STAGES.map(({ label, where, Icon, keys }, i) => {
              const ms = stageTime(keys);
              const lit = !!result && (keys.length === 0 || ms !== undefined);
              return (
                <li key={label}
                  className={'lg-panel relative flex flex-col gap-2 overflow-hidden p-3.5 transition-[box-shadow] duration-500 ' + (loading ? 'medqa-sweep' : '')}
                  style={{
                    animationDelay: `${i * 0.35}s`,
                    boxShadow: lit ? '0 0 0 1px color-mix(in oklab, var(--a) 55%, transparent)' : undefined,
                  }}>
                  <div className="flex items-center justify-between">
                    <span className="grid h-8 w-8 place-items-center rounded-full transition-colors duration-500"
                      style={{ background: lit ? 'var(--a)' : 'var(--surf2)', color: lit ? '#04121a' : 'var(--fg2)' }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="mono !text-[9px] text-fg3">0{i + 1}</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-medium tracking-[-.01em]">{label}</p>
                    <p className="mono !text-[9px] text-fg3">{where}</p>
                  </div>
                  <p className="mono mt-auto !text-[10px] text-fg2">{ms ? fmtMs(ms) : loading ? 'running…' : result && keys.length ? 'skipped' : '—'}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── workbench ────────────────────────────────────────────────── */}
        <section className="panel grid gap-3 px-[var(--gutter)] py-[clamp(20px,3vh,32px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* case */}
          <div className="lg-panel flex flex-col p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="mono text-fg3">The case</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void loadSample()} disabled={sampling || loading} className="lg-btn disabled:opacity-40">
                  {sampling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Load sample
                </button>
                <button type="button" onClick={reset} disabled={loading} className="lg-btn disabled:opacity-40">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              </div>
            </div>

            <label className="mono mb-2 block !text-[10px] text-fg3" htmlFor="mq-q">Question</label>
            <textarea id="mq-q" value={question} onChange={(e) => setQuestion(e.target.value)} rows={6}
              placeholder="e.g. A 45-year-old man presents with crushing substernal chest pain radiating to the left arm…"
              className="w-full resize-y rounded-[18px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-4 py-3.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg3 focus:border-[color:var(--p)]" />

            <p className="mono mb-2 mt-5 !text-[10px] text-fg3">Options</p>
            <ul className="flex flex-col gap-2">
              {Object.keys(options).map((k) => {
                const isChosen = chosen === k;
                const isBest = result?.similarity.best === k;
                return (
                  <li key={k} className="flex items-center gap-2.5 rounded-[16px] border p-1.5 pr-3 transition-colors"
                    style={{ borderColor: isChosen ? 'var(--a)' : 'var(--line)', background: isChosen ? 'color-mix(in oklab, var(--a) 10%, transparent)' : 'var(--chip-fill)' }}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-[12px] text-[14px] font-semibold"
                      style={{ background: isChosen ? 'var(--a)' : 'var(--surf2)', color: isChosen ? '#04121a' : 'var(--fg)' }}>
                      {k}
                    </span>
                    <input value={options[k]} onChange={(e) => setOptions((o) => ({ ...o, [k]: e.target.value }))}
                      placeholder={`Option ${k}`} aria-label={`Option ${k}`}
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-[14.5px] text-fg outline-none placeholder:text-fg3" />
                    {isChosen && <span className="mono flex-none !text-[9.5px] text-a">answer</span>}
                    {!isChosen && isBest && <span className="mono flex-none !text-[9.5px] text-fg3">most similar</span>}
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void runPipeline()} disabled={loading || !question.trim()} className="btn-ink disabled:opacity-40">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {loading ? 'Running the pipeline…' : 'Run the pipeline'}
              </button>
              {result && <span className="mono !text-[10px] text-fg3">answered in {fmtMs(result.totalTime)}</span>}
            </div>
            {error && (
              <p className="mt-4 flex items-start gap-2 rounded-[14px] border border-[#ef4444]/35 bg-[#ef4444]/10 px-4 py-3 text-[13.5px] text-fg2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#ef4444]" /> {error}
              </p>
            )}
          </div>

          {/* answer */}
          <div ref={answerRef} className="lg-panel flex min-h-[420px] flex-col p-5 md:p-6">
            <p className="mono mb-4 text-fg3">The answer</p>
            {!result && !loading && (
              <div className="m-auto max-w-[36ch] py-10 text-center">
                <JarvisOrb size={56} className="mx-auto" />
                <p className="mt-5 text-[18px] font-medium tracking-[-.02em]">Run a case to see the answer</p>
                <p className="mt-2 text-[14px] leading-relaxed text-fg3">…with the evidence behind it, and whether that evidence actually supports it.</p>
              </div>
            )}
            {loading && (
              <div className="m-auto w-full max-w-[40ch] py-10 text-center">
                <JarvisOrb size={56} active className="mx-auto" />
                <p className="mt-5 text-[18px] font-medium tracking-[-.02em]">Searching the evidence…</p>
                <p className="mt-2 text-[14px] text-fg3">Embedding the case, retrieving similar records, consulting external sources.</p>
                <span className="medqa-indeterminate mx-auto mt-6 block h-1 w-full overflow-hidden rounded-full bg-[color:var(--surf2)]" />
              </div>
            )}
            {result && (
              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-4">
                  <span className="grid h-16 w-16 flex-none place-items-center rounded-[20px] text-[30px] font-semibold text-white shadow-lg"
                    style={{ background: 'linear-gradient(135deg, var(--p), var(--a))' }}>
                    {result.generated.answer}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[clamp(18px,1.6vw,22px)] font-medium leading-snug tracking-[-.015em]">
                      {options[result.generated.answer] || `Option ${result.generated.answer}`}
                    </p>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-fg2">{result.generated.explanation}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[16px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] p-4">
                    <p className="mono mb-2 !text-[9.5px] text-fg3">Model confidence</p>
                    <p className="mb-2 text-[22px] font-medium tracking-[-.02em]">{Math.round((result.generated.confidence ?? 0) * 100)}%</p>
                    <Bar value={result.generated.confidence ?? 0} color="var(--p)" />
                  </div>
                  <div className="rounded-[16px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] p-4">
                    <p className="mono mb-2 !text-[9.5px] text-fg3">NLI verification</p>
                    {verdict && result.nli ? (
                      <>
                        <p className="flex items-center gap-2 text-[15px] font-medium" style={{ color: verdict.color }}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: verdict.color }} /> {verdict.label}
                        </p>
                        <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-fg3" title={result.nli.justification}>{result.nli.justification}</p>
                      </>
                    ) : <p className="text-[14px] text-fg3">Not run</p>}
                  </div>
                </div>

                <div>
                  <p className="mono mb-3 !text-[9.5px] text-fg3">Option similarity to the retrieved evidence</p>
                  <ul className="flex flex-col gap-2">
                    {Object.entries(result.similarity.scores).map(([k, v]) => {
                      const max = Math.max(...Object.values(result.similarity.scores), 1e-6);
                      const best = k === result.similarity.best;
                      return (
                        <li key={k} className="grid grid-cols-[22px_1fr_52px] items-center gap-3 text-[13px]">
                          <span className={best ? 'font-semibold text-fg' : 'text-fg2'}>{k}</span>
                          <Bar value={v} max={max} color={best ? 'var(--a)' : 'color-mix(in oklab, var(--fg) 30%, transparent)'} />
                          <span className="mono text-right !text-[10.5px] text-fg2">{v.toFixed(3)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <p className="flex items-start gap-2 border-t border-[color:var(--line)] pt-4 text-[12.5px] leading-relaxed text-fg3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-[#f59e0b]" />
                  <span><strong className="text-fg2">Not a diagnosis.</strong> {result.disclaimer}</span>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── evidence + follow-up ─────────────────────────────────────── */}
        {result && (
          <section className="panel grid gap-3 px-[var(--gutter)] py-[clamp(20px,3vh,32px)] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="lg-panel flex flex-col overflow-hidden">
              <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--line)] p-1.5">
                {([
                  ['local', `Corpus evidence · ${result.evidence.length}`, FileSearch],
                  ['external', `External sources · ${result.external?.length ?? 0}`, Globe2],
                  ['trace', 'Timing trace', Database],
                ] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-colors ' +
                      (tab === k ? 'bg-[color:var(--fg)] text-[color:var(--on-fg)]' : 'text-fg2 hover:text-fg')}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[560px] overflow-y-auto p-4" data-lenis-prevent>
                {tab === 'local' && (
                  result.evidence.length ? (
                    <ul className="flex flex-col gap-2.5">
                      {result.evidence.map((ev, i) => (
                        <li key={ev.id} className="rounded-[16px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] p-4">
                          <div className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-3">
                            <span className="mono !text-[9.5px] text-fg3">#{i + 1} · record {ev.id}</span>
                            <Bar value={ev.score} color="var(--a)" />
                            <span className="mono !text-[10.5px] text-fg2">{ev.score.toFixed(3)}</span>
                          </div>
                          <p className="text-[14px] leading-relaxed">{ev.question}</p>
                          <p className="mt-1.5 text-[13px] text-fg2"><span className="serif text-a">answer —</span> {ev.answer}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="py-8 text-center text-[13.5px] text-fg3">No local records retrieved.</p>
                )}
                {tab === 'external' && (
                  <>
                    {result.externalMeta?.reason && (
                      <p className="mb-3 rounded-[14px] bg-[color:var(--surf2)] px-4 py-3 text-[13px] leading-relaxed text-fg2">
                        <strong className="text-fg">Why external sources:</strong> {result.externalMeta.reason}
                      </p>
                    )}
                    {result.external?.length ? (
                      <ul className="flex flex-col gap-2.5">
                        {result.external.map((ext, i) => (
                          <li key={i} className="rounded-[16px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] p-4">
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <span className="mono rounded-full bg-[color:var(--surf2)] px-2.5 py-1 !text-[9.5px] text-fg">{ext.source}</span>
                              <a href={ext.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-p hover:underline">
                                Open source <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                            <p className="text-[14px] font-medium leading-snug">{ext.title}</p>
                            {ext.snippet && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-fg2">{ext.snippet}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="py-8 text-center text-[13.5px] text-fg3">Local evidence was strong enough — no external lookup was needed.</p>}
                  </>
                )}
                {tab === 'trace' && <TraceWaterfall trace={result.trace} totalTime={result.totalTime} />}
              </div>
            </div>

            {/* follow-up thread */}
            <div className="lg-panel flex min-h-[420px] flex-col overflow-hidden">
              <p className="mono border-b border-[color:var(--line)] px-5 py-4 text-fg3">Follow-up questions</p>
              <div className="flex-1 space-y-3 overflow-y-auto p-5" data-lenis-prevent>
                {followUps.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare className="mx-auto h-7 w-7 text-fg3" strokeWidth={1.5} />
                    <p className="mt-3 text-[14px] text-fg3">Ask about this case — e.g. “Why not option C?”</p>
                  </div>
                ) : followUps.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-end">
                      <p className="max-w-[88%] rounded-[18px] rounded-br-md bg-[color:var(--fg)] px-4 py-2.5 text-[14px] leading-relaxed text-[color:var(--on-fg)]">{m.question}</p>
                    </div>
                    <div className="flex gap-2.5">
                      <JarvisOrb size={20} active={!m.answer && !m.error} className="mt-0.5" />
                      {m.error ? <p className="text-[13.5px] text-[#ef4444]">{m.error}</p>
                        : m.answer !== undefined ? (
                          <div className="min-w-0 flex-1">
                            <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{m.answer}</p>
                            {typeof m.confidence === 'number' && <p className="mono mt-1 !text-[9.5px] text-fg3">confidence {m.confidence.toFixed(2)}</p>}
                          </div>
                        ) : <p className="text-[14px] text-fg3">Thinking…</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 pt-0">
                <div className="composer">
                  <input value={followUp} onChange={(e) => setFollowUp(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void sendFollowUp(); } }}
                    placeholder="Ask a follow-up about this case…" aria-label="Follow-up question"
                    className="min-h-[36px] flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg3" />
                  <button type="button" onClick={() => void sendFollowUp()} disabled={pendingFollowUp || !followUp.trim()} aria-label="Send"
                    className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--on-fg)] disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── about the corpus ─────────────────────────────────────────── */}
        <section className="panel px-[var(--gutter)] py-[clamp(20px,3vh,32px)]">
          <div className="lg-panel grid gap-4 p-5 md:grid-cols-3 md:p-6">
            {[
              ['Corpus', 'A curated seed of 120 medical Q&A records for instant demonstration; the full MedQA dataset drops in for real evaluation.'],
              ['Retrieval', 'Local embeddings with Xenova/all-MiniLM-L6-v2 and cosine similarity; PubMed, openFDA and WHO GHO when local confidence is low.'],
              ['Verification', 'An NLI pass judges whether the retrieved evidence entails, contradicts or is neutral towards the generated answer.'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="mono mb-2 text-fg3">{k}</p>
                <p className="text-[14px] leading-relaxed text-fg2">{v}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
