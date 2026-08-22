import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, Maximize2, Send, Sparkles, X } from 'lucide-react';
import MarkdownText from '@/components/MarkdownText';
import { lenis } from '@/lib/lenis';

/* JARVIS chat panel.
   Posts to `${API_BASE}/chat/stream` on the Express backend and parses the SSE
   frames it returns, sending prior turns as context. The base URL comes from
   VITE_CHAT_API_BASE (see app/.env.example) and defaults to '/api', which the
   Vite dev proxy forwards to the backend. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

const GREETING =
  "Hey! I'm JARVIS — Soham's LLM-based personal assistant. Ask me anything: projects, skills, whether he can actually center a div. I come with facts, wit, and zero corporate fluff.";

const SUGGESTIONS = [
  'What projects has Soham built?',
  'Tell me about the Digital Twin project',
  "What are Soham's top skills?",
  'How can I contact Soham?',
];

interface Message { role: 'user' | 'assistant'; content: string }

/* Both states declare the SAME constraint keys. Leaving one out lets the
   previous state's value leak through and the panel sticks mid-transition. */
const GEOM: Record<'docked' | 'max', CSSProperties> = {
  docked: {
    position: 'fixed', zIndex: 80,
    top: 'auto', right: '24px', bottom: '96px', left: 'auto',
    width: 'min(430px, calc(100vw - 32px))', height: 'min(660px,72vh)',
    maxWidth: 'none', margin: 0,
    transition: 'opacity .3s ease',
  },
  max: {
    position: 'fixed', zIndex: 80,
    top: '20px', right: '20px', bottom: '20px', left: '20px',
    width: 'auto', height: 'auto',
    maxWidth: '980px', margin: '0 auto',
    transition: 'opacity .3s ease',
  },
};

export interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChatPanel({ open, onOpenChange }: ChatPanelProps) {
  const [maximised, setMaximised] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: GREETING }]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !maximised) return;
    lenis.stop();
    return () => lenis.start();
  }, [open, maximised]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, sending]);

  const send = async (text?: string) => {
    const msg = (text ?? draft).trim();
    if (!msg || sending) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setDraft('');
    setSending(true);
    setError('');
    setStreaming('');

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not reach the assistant.');
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let ev: { delta?: string; error?: string; done?: boolean };
          try { ev = JSON.parse(payload); } catch { continue; }
          if (ev.error) throw new Error(ev.error);
          if (ev.delta) { acc += ev.delta; setStreaming(acc); }
        }
      }
      if (!acc) throw new Error('The assistant returned an empty response. Try rephrasing?');
      setMessages((m) => [...m, { role: 'assistant', content: acc }]);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not reach the assistant. Is the backend running?',
      );
    } finally {
      setSending(false);
      setStreaming('');
    }
  };

  const clear = () => {
    setMessages([{ role: 'assistant', content: GREETING }]);
    setError('');
    setStreaming('');
  };

  const showSuggestions = messages.length <= 1;
  const showTyping = sending && !streaming;

  const jarvisAvatar = (
    <span
      className="grid h-7 w-7 flex-none place-items-center rounded-[9px]"
      style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
    >
      <Sparkles className="h-3.5 w-3.5 text-bg" strokeWidth={2.2} />
    </span>
  );

  return (
    <>
      {open && (
        <div style={GEOM[maximised ? 'max' : 'docked']}>
          <div
            className="relative flex h-full w-full flex-col overflow-hidden rounded-[20px] border border-line"
            style={{
              background: 'color-mix(in oklab,var(--bg) 82%,transparent)',
              backdropFilter: 'blur(26px) saturate(180%)',
              WebkitBackdropFilter: 'blur(26px) saturate(180%)',
              boxShadow: '0 36px 70px -20px rgba(0,0,0,.7)',
            }}
          >
            {/* Header */}
            <div className="flex flex-none items-center gap-3 border-b border-line bg-surf2 px-[18px] py-[15px]">
              <span
                className="grid h-[34px] w-[34px] place-items-center rounded-[11px]"
                style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
              >
                <Sparkles className="h-4 w-4 text-bg" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold tracking-[.02em]">JARVIS</p>
                <p className="mt-0.5 flex items-center gap-[7px] font-mono text-[10.5px] text-fg3">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                  Connected · Gemini
                </p>
              </div>
              <button
                type="button" onClick={clear}
                className="h-[26px] rounded-lg border border-line px-2.5 font-mono text-[11px] text-fg3 transition-colors hover:bg-surf2 hover:text-fg"
              >
                Clear
              </button>
              <button
                type="button" onClick={() => setMaximised((v) => !v)} title="Expand"
                className="grid h-7 w-7 place-items-center rounded-[9px] text-fg3 transition-colors hover:bg-surf2 hover:text-fg"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button" onClick={() => { onOpenChange(false); setMaximised(false); }} aria-label="Close chat"
                className="grid h-7 w-7 place-items-center rounded-[9px] text-fg3 transition-colors hover:bg-surf2 hover:text-fg"
              >
                <X className="h-[15px] w-[15px]" />
              </button>
            </div>

            {/* Transcript */}
            <div ref={scroller} data-lenis-prevent className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-[18px]">
              {messages.map((m, i) => {
                const mine = m.role === 'user';
                return (
                  <div key={i} className={'flex gap-2.5 ' + (mine ? 'flex-row-reverse' : 'flex-row')}>
                    {mine ? (
                      <span className="grid h-7 w-7 flex-none place-items-center rounded-[9px] bg-surf2 font-mono text-[10px] font-semibold text-fg">
                        You
                      </span>
                    ) : (
                      jarvisAvatar
                    )}
                    <div
                      className={mine ? "max-w-[80%] whitespace-pre-wrap rounded-[14px] border px-3.5 py-[11px] text-[13px] leading-[1.6]" : "max-w-[80%] rounded-[14px] border px-3.5 py-[11px] text-[13px] leading-[1.6] text-fg"}
                      style={
                        mine
                          ? { background: 'linear-gradient(135deg,var(--p),var(--s))', borderColor: 'transparent', color: 'var(--bg)' }
                          : { background: 'var(--surf2)', borderColor: 'var(--line)', color: 'var(--fg)' }
                      }
                    >
                      {mine ? m.content : <MarkdownText text={m.content} />}
                    </div>
                  </div>
                );
              })}

              {streaming && (
                <div className="flex gap-2.5">
                  {jarvisAvatar}
                  <div className="max-w-[80%] rounded-[14px] border border-line bg-surf2 px-3.5 py-[11px] text-[13px] leading-[1.6] text-fg">
                    <MarkdownText text={streaming} />
                    <span className="animate-blink text-p">▍</span>
                  </div>
                </div>
              )}

              {showTyping && (
                <div className="flex gap-2.5">
                  {jarvisAvatar}
                  <div className="flex items-center gap-[5px] rounded-[14px] border border-line bg-surf2 px-[15px] py-[13px]">
                    <span className="h-[5px] w-[5px] rounded-full bg-fg3" />
                    <span className="h-[5px] w-[5px] rounded-full bg-fg3 opacity-60" />
                    <span className="h-[5px] w-[5px] rounded-full bg-fg3 opacity-[.35]" />
                  </div>
                </div>
              )}

              {error && (
                <div
                  className="flex items-start gap-2.5 rounded-[13px] border px-3.5 py-3"
                  style={{
                    borderColor: 'color-mix(in oklab,#f87171 40%,transparent)',
                    background: 'color-mix(in oklab,#f87171 10%,transparent)',
                  }}
                >
                  <AlertCircle className="mt-0.5 h-[15px] w-[15px] flex-none text-[#f87171]" />
                  <p className="text-[12.5px] leading-[1.55] text-fg2">{error}</p>
                </div>
              )}

              {showSuggestions && (
                <div className="pt-1">
                  <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[.18em] text-fg3">Try asking</p>
                  <div className="flex flex-wrap gap-[7px]">
                    {SUGGESTIONS.map((q) => (
                      <button
                        key={q} type="button" onClick={() => send(q)}
                        className="rounded-full border border-line bg-surf2 px-3 py-[7px] text-left text-[11.5px] text-fg2 transition-colors hover:border-[color-mix(in_oklab,var(--a)_50%,transparent)] hover:text-fg"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="flex flex-none items-center gap-2.5 border-t border-line bg-surf2 px-4 py-3.5">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                placeholder="Ask about Soham's work..."
                aria-label="Message JARVIS"
                className="flex-1 rounded-full border border-line px-4 py-[11px] text-[13px] text-fg outline-none placeholder:text-fg3 focus:border-p"
                style={{ background: 'color-mix(in oklab,var(--bg) 55%,transparent)' }}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                aria-label="Send"
                className="grid h-[38px] w-[38px] flex-none place-items-center rounded-xl transition-[filter] hover:brightness-110 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,var(--p),var(--s))' }}
              >
                <Send className="h-[15px] w-[15px] text-bg" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Open JARVIS"
        className="fixed bottom-6 right-6 z-[80] grid h-14 w-14 place-items-center rounded-full border border-line transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110"
        style={{
          background: 'linear-gradient(135deg,var(--p),var(--s))',
          boxShadow: '0 16px 36px -10px color-mix(in oklab,var(--p) 75%,transparent)',
        }}
      >
        <Sparkles className="h-[21px] w-[21px] text-bg" strokeWidth={1.9} />
      </button>
    </>
  );
}
