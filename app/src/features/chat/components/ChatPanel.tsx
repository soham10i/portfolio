import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, AudioLines, Maximize2, Mic, MicOff, Send, Sparkles, X } from 'lucide-react';
import MarkdownText from '@/features/chat/components/MarkdownText';
import {
  createRecognizer, createSpeaker, sttSupported, ttsSupported,
  type Recognizer, type Speaker,
} from '@/features/chat/lib/voice';
import { lenis } from '@/shared/lib/lenis';

/* JARVIS chat panel.
   Posts to `${API_BASE}/chat/stream` on the Express backend and parses the SSE
   frames it returns, sending prior turns as context. The base URL comes from
   VITE_CHAT_API_BASE (see app/.env.example) and defaults to '/api', which the
   Vite dev proxy forwards to the backend.

   Voice: the mic button (one-shot "talkback") and the AudioLines toggle
   (hands-free voice mode) use the browser's Web Speech API — SpeechRecognition
   for STT, speechSynthesis for TTS — so voice adds no API cost. Spoken turns
   are flagged `voice: true` so the backend answers in short, speakable prose. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

const GREETING =
  "Hey! I'm JARVIS — Soham's LLM-based personal assistant. Ask me anything: projects, skills, whether he can actually center a div. I come with facts, wit, and zero corporate fluff. Tap the mic and we can just talk.";

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
    top: 'auto', right: 'auto', bottom: '96px', left: '24px',
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
  const [voiceMode, setVoiceMode] = useState(false);   // hands-free conversation loop
  const [listening, setListening] = useState(false);   // mic is capturing right now
  const [speaking, setSpeaking] = useState(false);     // JARVIS is talking right now
  const scroller = useRef<HTMLDivElement>(null);

  /* Refs mirror the state the voice callbacks need — recognizer and speaker
     callbacks fire long after the render that created them. */
  const voiceModeRef = useRef(false);
  const openRef = useRef(open);
  const sendingRef = useRef(false);
  const recognizerRef = useRef<Recognizer | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const gotFinalRef = useRef(false);     // this listening session produced a transcript
  const haltedRef = useRef(false);       // mic permission denied — stop retrying
  const listenTimer = useRef<number | null>(null);
  const sendRef = useRef<(text?: string, opts?: { spoken?: boolean }) => Promise<void>>(async () => {});

  const voiceOk = sttSupported() && ttsSupported();

  useEffect(() => {
    if (!open || !maximised) return;
    lenis.stop();
    return () => lenis.start();
  }, [open, maximised]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, sending]);

  useEffect(() => { sendingRef.current = sending; }, [sending]);

  const setVoiceModeBoth = (v: boolean) => { voiceModeRef.current = v; setVoiceMode(v); };

  const stopVoiceActivity = () => {
    if (listenTimer.current) { window.clearTimeout(listenTimer.current); listenTimer.current = null; }
    recognizerRef.current?.abort();
    recognizerRef.current = null;
    speakerRef.current?.cancel();
    speakerRef.current = null;
    setListening(false);
    setSpeaking(false);
  };

  /* Closing the panel pauses the conversation; reopening a voice-mode panel
     resumes listening. Deferred a tick so the state resets do not run
     synchronously inside the effect body (react-hooks/set-state-in-effect). */
  useEffect(() => {
    openRef.current = open;
    const t = window.setTimeout(() => {
      if (!open) stopVoiceActivity();
      else if (voiceModeRef.current) queueListen(300);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopVoiceActivity(), []);

  const send = async (text?: string, opts?: { spoken?: boolean }) => {
    const msg = (text ?? draft).trim();
    if (!msg || sending) return;
    const spoken = opts?.spoken === true;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setDraft('');
    setSending(true);
    setError('');
    setStreaming('');

    // A new turn interrupts whatever JARVIS was saying.
    speakerRef.current?.cancel();
    setSpeaking(false);

    /* Spoken turns are read aloud sentence-by-sentence as they stream in.
       When the reply finishes, voice mode starts listening for the next turn. */
    let speaker: Speaker | null = null;
    if (spoken && ttsSupported()) {
      speaker = createSpeaker({
        onStart: () => setSpeaking(true),
        onDone: () => {
          setSpeaking(false);
          if (voiceModeRef.current && openRef.current && !sendingRef.current) queueListen(350);
        },
      });
      speakerRef.current = speaker;
    }

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history, voice: spoken }),
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
          if (ev.delta) { acc += ev.delta; setStreaming(acc); speaker?.push(ev.delta); }
        }
      }
      if (!acc) throw new Error('The assistant returned an empty response. Try rephrasing?');
      speaker?.flush();
      setMessages((m) => [...m, { role: 'assistant', content: acc }]);
    } catch (err) {
      speaker?.cancel();
      setSpeaking(false);
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
  sendRef.current = send;

  const queueListen = (delay = 0) => {
    if (listenTimer.current) window.clearTimeout(listenTimer.current);
    listenTimer.current = window.setTimeout(() => { listenTimer.current = null; startListening(); }, delay);
  };

  const startListening = () => {
    if (!sttSupported() || sendingRef.current) return;
    // Barge-in: talking back cuts off any reply still being read out.
    speakerRef.current?.cancel();
    setSpeaking(false);
    recognizerRef.current?.abort();
    gotFinalRef.current = false;

    const rec = createRecognizer({
      onInterim: (t) => setDraft(t),
      onFinal: (t) => {
        gotFinalRef.current = true;
        setDraft('');
        void sendRef.current(t, { spoken: true });
      },
      onError: (e) => {
        if (e === 'not-allowed' || e === 'service-not-allowed' || e === 'audio-capture') {
          haltedRef.current = true;
          setVoiceModeBoth(false);
          setError('Microphone access was blocked. Allow the mic in your browser to talk to JARVIS.');
        }
      },
      onEnd: () => {
        setListening(false);
        /* Voice mode: an utterance that ended with no transcript (silence,
           a cough) should not kill the conversation — listen again. */
        if (voiceModeRef.current && openRef.current && !gotFinalRef.current && !haltedRef.current) {
          queueListen(400);
        }
      },
    });
    if (!rec) return;
    recognizerRef.current = rec;
    setListening(true);
    rec.start();
  };

  const toggleVoiceMode = () => {
    if (voiceModeRef.current) {
      setVoiceModeBoth(false);
      stopVoiceActivity();
    } else {
      haltedRef.current = false;
      setVoiceModeBoth(true);
      setError('');
      speakerRef.current?.cancel();
      setSpeaking(false);
      startListening();
    }
  };

  /* One-shot talkback: tap, speak, JARVIS answers aloud. Does not start the
     hands-free loop — that is what the header toggle is for. */
  const onMicClick = () => {
    if (listening) { recognizerRef.current?.stop(); return; }
    startListening();
  };

  const clear = () => {
    stopVoiceActivity();
    setVoiceModeBoth(false);
    setMessages([{ role: 'assistant', content: GREETING }]);
    setError('');
    setStreaming('');
  };

  const showSuggestions = messages.length <= 1;
  const showTyping = sending && !streaming;

  const statusDot = listening ? '#ef4444' : speaking ? 'var(--p)' : '#22c55e';
  const statusText = listening ? 'Listening…' : speaking ? 'Speaking…' : 'Connected · self-hosted LLM';

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
                  <span
                    className={'h-1.5 w-1.5 rounded-full' + (listening ? ' animate-pulse' : '')}
                    style={{ background: statusDot }}
                  />
                  {statusText}
                </p>
              </div>
              {voiceOk && (
                <button
                  type="button" onClick={toggleVoiceMode}
                  title={voiceMode ? 'Voice mode on — click to end the conversation' : 'Start a hands-free voice conversation'}
                  aria-label="Toggle voice conversation"
                  aria-pressed={voiceMode}
                  className="grid h-7 w-7 place-items-center rounded-[9px] transition-colors hover:bg-surf2"
                  style={
                    voiceMode
                      ? { background: 'linear-gradient(135deg,var(--p),var(--s))' }
                      : undefined
                  }
                >
                  <AudioLines className={'h-3.5 w-3.5 ' + (voiceMode ? 'text-bg' : 'text-fg3')} />
                </button>
              )}
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
                placeholder={listening ? 'Listening — speak now…' : "Ask about Soham's work..."}
                aria-label="Message JARVIS"
                className="flex-1 rounded-full border border-line px-4 py-[11px] text-[13px] text-fg outline-none placeholder:text-fg3 focus:border-p"
                style={{ background: 'color-mix(in oklab,var(--bg) 55%,transparent)' }}
              />
              {voiceOk && (
                <button
                  type="button"
                  onClick={onMicClick}
                  disabled={sending && !listening}
                  aria-label={listening ? 'Stop listening' : 'Talk to JARVIS'}
                  title={listening ? 'Stop listening' : 'Talk to JARVIS — your words are sent and the reply is read aloud'}
                  className={
                    'grid h-[38px] w-[38px] flex-none place-items-center rounded-xl border transition-[filter,transform] hover:brightness-110 disabled:opacity-60 ' +
                    (listening ? 'animate-pulse border-transparent' : 'border-line')
                  }
                  style={
                    listening
                      ? { background: 'linear-gradient(135deg,var(--p),var(--s))' }
                      : { background: 'color-mix(in oklab,var(--bg) 55%,transparent)' }
                  }
                >
                  {listening
                    ? <MicOff className="h-[15px] w-[15px] text-bg" strokeWidth={2} />
                    : <Mic className="h-[15px] w-[15px] text-fg2" strokeWidth={2} />}
                </button>
              )}
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
        className="fixed bottom-6 left-6 z-[80] grid h-14 w-14 place-items-center rounded-full border border-line transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110"
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
