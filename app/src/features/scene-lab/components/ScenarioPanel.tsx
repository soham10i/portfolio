import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Target } from 'lucide-react';

/* What the visitor is actually trying to do.
 *
 * This is the highest-leverage input on the page and the cheapest to add.
 * Measured on meta/llama-3.2-11b-vision-instruct: the same frame, asked the
 * same question, answered with a flat description of the room until the
 * scenario "I am looking for my keys in the living room" was supplied — after
 * which it answered "look at the objects on the coffee table and the floor
 * near it". The pixels did not change; the question the model thought it was
 * answering did.
 *
 * The text is sent to the server and held there for the session so that every
 * subsequent call — captioning, summarising, Q&A — sees the same goal without
 * the client having to remember to attach it each time. It is TEXT ONLY; no
 * frame ever reaches that store.
 */

const EXAMPLES = [
  'I am looking for my keys in the living room',
  'This is a busy traffic intersection — I care about near-misses',
  'Reviewing a robot navigating a maze; tell me if it gets stuck',
  'Checking whether the workshop was left tidy at end of shift',
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Persist to the server. Resolves when the session has been updated. */
  onCommit: (v: string) => Promise<void>;
  maxChars: number;
  ephemeralNote?: string;
  accent: string;
  disabled?: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function ScenarioPanel({
  value, onChange, onCommit, maxChars, ephemeralNote, accent, disabled,
}: Props) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;

  /* Debounced autosave. Typing a sentence should not be twenty PUTs, and
     making the visitor find a Save button for a single text field is worse. */
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (state === 'idle' && !value) return;
    timer.current = window.setTimeout(async () => {
      setState('saving');
      try {
        await onCommit(latest.current);
        setState('saved');
        setError('');
        window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1800);
      } catch (err) {
        setState('error');
        setError(err instanceof Error ? err.message : 'could not save');
      }
    }, 700);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const remaining = maxChars - value.length;

  return (
    <section className="lg-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="inline-flex items-center gap-2 mono text-fg3">
          <Target className="h-3.5 w-3.5" style={{ color: accent }} />
          Your scenario
        </p>
        <span className="font-mono text-[10px] text-fg3">
          {state === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> saving</span>}
          {state === 'saved' && <span className="inline-flex items-center gap-1" style={{ color: accent }}><Check className="h-3 w-3" /> saved to session</span>}
          {state === 'error' && <span className="text-[#f87171]">{error}</span>}
        </span>
      </div>

      <div className="px-4 py-3">
        <p className="mb-2.5 text-[12.5px] leading-relaxed text-fg2">
          Tell the model what you are trying to find out. It is added to every prompt as your
          stated goal, and it changes the answers materially — the same frame described
          generically will instead be read for what matters to you.
        </p>

        <textarea
          value={value}
          maxLength={maxChars}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="e.g. I am looking for my keys in the living room"
          className="w-full resize-y rounded-[11px] border border-line bg-bg2 px-3 py-2.5 text-[13px] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg3 focus:border-fg3 disabled:opacity-50"
        />

        <div className="mt-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-fg3">{remaining} characters left</span>
          {value && (
            <button type="button" onClick={() => onChange('')}
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg3 transition-colors hover:text-fg">
              clear
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => onChange(ex)} disabled={disabled}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg3 transition-colors hover:border-fg3 hover:text-fg disabled:opacity-40">
              {ex}
            </button>
          ))}
        </div>

        {ephemeralNote && (
          <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-fg3">
            {ephemeralNote}
          </p>
        )}
      </div>
    </section>
  );
}
