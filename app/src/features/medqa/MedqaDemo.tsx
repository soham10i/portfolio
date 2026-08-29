/* MedqaDemo.tsx — Interactive MedQA RAG Pipeline Demo
 * Ports the user's Python pipeline (github.com/soham10i/natural-language-processing-project)
 * to the browser with full step-by-step visualization.
 */
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Brain,
  Database,
  Sparkles,
  Play,
  RotateCcw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Github,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Stethoscope,
} from 'lucide-react';
import PipelineViz from './components/PipelineViz';

interface OptionMap {
  [key: string]: string;
}

interface EvidenceItem {
  id: number;
  question: string;
  answer: string;
  score: number;
}

interface ExternalItem {
  source: string;
  title: string;
  snippet?: string;
  url: string;
  type?: string;
}

interface RagResult {
  question: string;
  options: OptionMap;
  entities: string[];
  evidence: EvidenceItem[];
  external: ExternalItem[];
  externalMeta: { reason: string; queries: string[] } | null;
  generated: {
    answer: string;
    explanation: string;
    confidence: number;
    disclaimer: string;
  };
  nli: {
    verdict: string;
    justification: string;
    confidence: number;
  } | null;
  similarity: {
    scores: Record<string, number>;
    best: string;
  };
  trace: Array<{
    step: string;
    detail: Record<string, unknown>;
    duration?: number;
    at?: number;
  }>;
  totalTime: number;
  disclaimer: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function MedqaDemo() {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<OptionMap>({ A: '', B: '', C: '', D: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RagResult | null>(null);
  const [error, setError] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);
  const [showExternal, setShowExternal] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [followUpResult, setFollowUpResult] = useState<{
    question: string;
    generated: { answer: string; explanation: string; confidence: number; disclaimer: string };
    evidence: EvidenceItem[];
  } | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const sessionIdRef = useRef(`medqa-${Date.now()}`);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadSample = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/medqa/sample`);
      if (!res.ok) throw new Error('Failed to load sample');
      const data = await res.json();
      const s = data.sample;
      setQuestion(s.question);
      setOptions(s.options || { A: '', B: '', C: '', D: '' });
      setResult(null);
      setFollowUpResult(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const runPipeline = useCallback(async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setFollowUpResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/medqa/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options, topK: 5, doNli: true, useExternal: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [question, options]);

  const sendFollowUp = useCallback(async () => {
    if (!followUp.trim() || !result) return;
    setFollowUpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/medqa/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, question: followUp, topK: 5 }),
      });
      const data = await res.json();
      setFollowUpResult(data);
      setFollowUp('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFollowUpLoading(false);
    }
  }, [followUp, result]);

  const reset = () => {
    setQuestion('');
    setOptions({ A: '', B: '', C: '', D: '' });
    setResult(null);
    setError('');
    setFollowUpResult(null);
    sessionIdRef.current = `medqa-${Date.now()}`;
  };

  const setOption = (key: string, value: string) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line backdrop-blur-xl" style={{ background: 'color-mix(in oklab, var(--bg) 85%, transparent)' }}>
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Link to="/" className="rounded-[10px] border border-line p-2 transition-colors hover:border-[var(--a)] hover:text-[var(--a)]">
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[color-mix(in_oklab,var(--a)_12%,transparent)]">
                <Brain size={14} className="text-[var(--a)]" />
              </div>
              <div>
                <h1 className="text-[13px] font-semibold tracking-[-0.01em]">MedQA RAG Pipeline</h1>
                <p className="text-[9px] text-fg2">NLI Benchmarking & Medical QA Demo</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/soham10i/natural-language-processing-project"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 text-[10px] text-fg2 transition-colors hover:border-[var(--a)] hover:text-[var(--a)]"
            >
              <Github size={12} /> Original Python Pipeline
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-8">
        {/* Medical Disclaimer Banner */}
        <div className="mb-6 rounded-[12px] border border-amber-400/30 bg-amber-400/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <p className="text-[11px] font-semibold text-amber-300">Medical Disclaimer</p>
              <p className="mt-1 text-[10px] leading-relaxed text-amber-200/80">
                This system provides <strong>educational information only</strong> and is not a substitute for professional 
                medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider. 
                Never disregard professional medical advice because of information provided here. 
                <strong> In case of emergency, call your local emergency number immediately.</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Architecture Card */}
        <div className="mb-8 rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
          <h2 className="mb-3 text-[12px] font-semibold">Pipeline Architecture</h2>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-fg2">
            <StepBadge icon={Sparkles} label="Medical Question" />
            <Arrow className="text-fg2/40" />
            <StepBadge icon={Brain} label="Entity Extraction" />
            <Arrow className="text-fg2/40" />
            <StepBadge icon={Database} label="Vector Retrieval (MiniLM)" />
            <Arrow className="text-fg2/40" />
            <StepBadge icon={ExternalLink} label="PubMed / FDA / WHO Fallback" />
            <Arrow className="text-fg2/40" />
            <StepBadge icon={MessageSquare} label="LLM Generation" />
            <Arrow className="text-fg2/40" />
            <StepBadge icon={Sparkles} label="NLI Verification" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-fg2">
            This demo ports the original Python pipeline to Node.js. It uses{' '}
            <code className="rounded-[4px] bg-line px-1 py-0.5 font-mono text-[10px]">Xenova/all-MiniLM-L6-v2</code>{' '}
            for local embeddings, cosine-similarity retrieval over a 120-record medical corpus,
            and falls back to authenticated sources (PubMed, FDA openFDA, WHO GHO) when local 
            confidence is low. Your configured open-weight LLM handles generation and NLI verification.
          </p>
        </div>

        {/* Input Section */}
        <div className="mb-6 rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold">Ask a Medical Question</h2>
            <div className="flex gap-2">
              <button
                onClick={loadSample}
                className="flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 text-[10px] text-fg2 transition-colors hover:border-[var(--a)] hover:text-[var(--a)]"
              >
                <Sparkles size={11} /> Load Sample
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 text-[10px] text-fg2 transition-colors hover:border-rose-400 hover:text-rose-400"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-fg2">Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g., A 45-year-old man presents with crushing chest pain..."
                className="min-h-[72px] w-full rounded-[12px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-3.5 py-2.5 text-[12px] text-fg outline-none transition-colors placeholder:text-fg2/50 focus:border-[var(--a)]"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(options).map(([key]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[color-mix(in_oklab,var(--a)_12%,transparent)] text-[10px] font-bold text-[var(--a)]">
                    {key}
                  </span>
                  <input
                    value={options[key]}
                    onChange={(e) => setOption(key, e.target.value)}
                    placeholder={`Option ${key}`}
                    className="w-full rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-3 py-2 text-[11px] text-fg outline-none transition-colors placeholder:text-fg2/50 focus:border-[var(--a)]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runPipeline}
              disabled={loading || !question.trim()}
              className="flex items-center gap-2 rounded-[10px] bg-[var(--a)] px-5 py-2.5 text-[11px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {loading ? 'Running Pipeline...' : 'Run RAG Pipeline'}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-[10px] border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[11px] text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div ref={resultRef} className="space-y-5">
            {/* Disclaimer Card */}
            <div className="rounded-[12px] border border-amber-400/30 bg-amber-400/10 p-4">
              <div className="flex items-start gap-3">
                <Stethoscope size={16} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-[10px] leading-relaxed text-amber-200/80">
                  <strong className="text-amber-300">Not a diagnosis.</strong>{' '}
                  {result.disclaimer}
                </p>
              </div>
            </div>

            {/* Answer Card */}
            <div className="rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg2">Generated Answer</h3>
                <span className="rounded-[7px] bg-[color-mix(in_oklab,var(--a)_12%,transparent)] px-2 py-0.5 text-[10px] font-mono text-[var(--a)]">
                  {result.totalTime}ms
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] text-[14px] font-bold text-[var(--a)]">
                  {result.generated.answer}
                </span>
                <div>
                  <p className="text-[12px] leading-relaxed text-fg">{result.generated.explanation}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="text-[10px] text-fg2">Confidence: {(result.generated.confidence ?? 0).toFixed(2)}</span>
                    {result.nli && (
                      <span className={`text-[10px] font-medium ${
                        result.nli.verdict === 'entails' ? 'text-emerald-400' :
                        result.nli.verdict === 'contradicts' ? 'text-rose-400' : 'text-amber-400'
                      }`}>
                        NLI: {result.nli.verdict}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Visualization */}
            <PipelineViz trace={result.trace} totalTime={result.totalTime} active={!!result} />

            {/* Local Evidence */}
            <div className="rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
              <button
                onClick={() => setShowEvidence((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg2">
                  Retrieved Evidence ({result.evidence.length})
                </h3>
                {showEvidence ? <ChevronUp size={14} className="text-fg2" /> : <ChevronDown size={14} className="text-fg2" />}
              </button>
              {showEvidence && (
                <div className="mt-3 space-y-2">
                  {result.evidence.map((ev) => (
                    <div key={ev.id} className="rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9px] font-mono text-fg2">Record #{ev.id}</span>
                        <span className="text-[9px] font-mono text-emerald-400">sim: {ev.score.toFixed(3)}</span>
                      </div>
                      <p className="text-[11px] text-fg">{ev.question}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--a)]">Answer: {ev.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* External Evidence */}
            {result.external && result.external.length > 0 && (
              <div className="rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
                <button
                  onClick={() => setShowExternal((v) => !v)}
                  className="flex w-full items-center justify-between"
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg2">
                    Certified External Sources ({result.external.length})
                  </h3>
                  {showExternal ? <ChevronUp size={14} className="text-fg2" /> : <ChevronDown size={14} className="text-fg2" />}
                </button>
                {showExternal && (
                  <div className="mt-3 space-y-2">
                    {result.external.map((ext, idx) => (
                      <div key={idx} className="rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-[5px] bg-[color-mix(in_oklab,var(--a)_12%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--a)]">
                            {ext.source}
                          </span>
                          <a
                            href={ext.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[9px] text-sky-400 hover:underline"
                          >
                            <ExternalLink size={9} /> View Source
                          </a>
                        </div>
                        <p className="text-[11px] font-medium text-fg">{ext.title}</p>
                        {ext.snippet && <p className="mt-1 text-[10px] text-fg2">{ext.snippet}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Similarity Scores */}
            <div className="rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg2">Option Similarity Scores</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(result.similarity.scores).map(([k, v]) => (
                  <div
                    key={k}
                    className={`rounded-[10px] border p-3 text-center ${
                      k === result.similarity.best
                        ? 'border-[var(--a)]/30 bg-[color-mix(in_oklab,var(--a)_10%,transparent)]'
                        : 'border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)]'
                    }`}
                  >
                    <span className="text-[10px] text-fg2">Option {k}</span>
                    <div className={`text-[14px] font-bold ${k === result.similarity.best ? 'text-[var(--a)]' : 'text-fg'}`}>
                      {v.toFixed(3)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Follow-up */}
            <div className="rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] p-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg2">Follow-up Question</h3>
              <div className="flex gap-2">
                <input
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  placeholder="Ask a follow-up about this case..."
                  className="flex-1 rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-3 py-2 text-[11px] text-fg outline-none transition-colors placeholder:text-fg2/50 focus:border-[var(--a)]"
                  onKeyDown={(e) => e.key === 'Enter' && sendFollowUp()}
                />
                <button
                  onClick={sendFollowUp}
                  disabled={followUpLoading || !followUp.trim()}
                  className="flex items-center gap-1.5 rounded-[10px] bg-[var(--a)] px-4 py-2 text-[11px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                >
                  {followUpLoading ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                </button>
              </div>
              {followUpResult && (
                <div className="mt-3 rounded-[10px] border border-line bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] p-3">
                  <p className="text-[11px] font-medium text-fg">Q: {followUpResult.question}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg2">{followUpResult.generated.answer}</p>
                  <p className="mt-1 text-[10px] text-fg2">Confidence: {(followUpResult.generated.confidence ?? 0).toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="mt-10 rounded-[12px] border border-line bg-[color-mix(in_oklab,var(--bg)_95%,transparent)] p-4">
          <p className="text-[10px] leading-relaxed text-fg2">
            <strong className="text-fg">Note:</strong> This demo uses a curated seed corpus of 120 medical Q&A pairs
            for instant demonstration. For full-scale deployment, replace the seed with the complete{' '}
            <a href="https://github.com/jind11/MedQA" target="_blank" rel="noreferrer" className="text-[var(--a)] underline">MedQA dataset</a>{' '}
            and configure your own GPU-hosted LLM endpoint via <code className="font-mono">LLM_API_BASE</code>.
            External sources: PubMed (NCBI E-utilities), FDA openFDA, WHO Global Health Observatory.
          </p>
        </div>
      </main>
    </div>
  );
}

function StepBadge({ icon: Icon, label }: { icon: typeof Brain; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-[7px] border border-line bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] px-2 py-1 text-[10px] text-fg">
      <Icon size={10} /> {label}
    </span>
  );
}

function Arrow({ className }: { className?: string }) {
  return <span className={`text-[10px] ${className}`}>→</span>;
}
