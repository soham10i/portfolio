import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, ArrowUp, AudioLines, Maximize2, Mic, MicOff, Minimize2, RotateCcw, X } from 'lucide-react';
import '@/features/story/story.css';
import MarkdownText from '@/features/chat/components/MarkdownText';
import JarvisOrb from '@/features/chat/components/JarvisOrb';
import {
  cloudTtsReady, createCloudSpeaker, createRecognizer, createSpeaker, sttSupported, ttsSupported,
  type Recognizer, type Speaker,
} from '@/features/chat/lib/voice';
import { conversationId, fetchHistory, newConversation } from '@/features/chat/lib/conversation';
import { lenis } from '@/shared/lib/lenis';

/* JARVIS chat panel, in the site's gallery art direction (story.css tokens,
   light and dark).

   Posts to `${API_BASE}/chat/stream` on the Express backend and parses the SSE
   frames it returns, sending prior turns as context and a conversation id. The
   backend stores each turn in Supabase under that id, so reopening the site
   picks the conversation back up (lib/conversation.ts).

   Voice: the mic button (one-shot "talkback") and the AudioLines toggle
   (hands-free voice mode) use the browser's SpeechRecognition for STT. TTS is
   ElevenLabs via /api/tts when the backend has a key, with the browser's
   speechSynthesis as fallback. Spoken turns are flagged `voice: true` so the
   backend answers in short, speakable prose. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';

const GREETING =
  "Hi, I'm the assistant. I answer questions about Soham's projects, experience and skills, using the facts on this site. You can type or use the mic.";

const SUGGESTIONS = [
  'What projects has Soham built?',
  'Tell me about the Smart Tabletop Factory twin',
  "Which skills does Soham use most?",
  'How can I contact Soham?',
];

interface Message { role: 'user' | 'assistant'; content: string }

/* Both states declare the SAME constraint keys. Leaving one out lets the
   previous state's value leak through and the panel sticks mid-transition. */
const GEOM: Record<'docked' | 'max', CSSProperties> = {
  docked: {
    position: 'fixed', zIndex: 80,
    top: 'auto', right: 'max(8px, min(24px, 2vw))', bottom: '84px', left: 'auto',
    width: 'min(440px, calc(100vw - 16px))', height: 'min(680px, calc(100svh - 112px))',
    maxWidth: 'none', margin: 0,
  },
  max: {
    position: 'fixed', zIndex: 80,
    top: '16px', right: '16px', bottom: '16px', left: '16px',
    width: 'auto', height: 'auto',
    maxWidth: '960px', margin: '0 auto',
  },
};

export interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Orb = JarvisOrb;

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
  const input = useRef<HTMLTextAreaElement>(null);

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
  const restored = useRef(false);

  /* Server-side TTS (ElevenLabs) is probed once when the panel first opens;
     the browser voice covers deployments without a key. With the cloud voice
     available, talk-back works even where speechSynthesis is missing. */
  const [cloudVoice, setCloudVoice] = useState(false);
  useEffect(() => {
    if (open) void cloudTtsReady(API_BASE).then(setCloudVoice);
  }, [open]);

  const voiceOk = sttSupported() && (ttsSupported() || cloudVoice);

  /* Pick up where the visitor left off: the stored conversation, if the
     backend has it. Silent on failure — a fresh greeting is fine. */
  useEffect(() => {
    if (!open || restored.current) return;
    restored.current = true;
    fetchHistory(API_BASE).then((past) => {
      if (past.length) setMessages((m) => (m.length <= 1 ? [m[0], ...past] : m));
    });
  }, [open]);

  useEffect(() => {
    if (!open || !maximised) return;
    lenis.stop();
    return () => lenis.start();
  }, [open, maximised]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => input.current?.focus(), 120);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(t); };
  }, [open, onOpenChange]);

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

    /* The greeting is UI, not conversation — it is never sent as context. */
    const history = messages.slice(1).map((m) => ({ role: m.role, content: m.content }));
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
    if (spoken && (cloudVoice || ttsSupported())) {
      const callbacks = {
        onStart: () => setSpeaking(true),
        onDone: () => {
          setSpeaking(false);
          if (voiceModeRef.current && openRef.current && !sendingRef.current) queueListen(350);
        },
      };
      speaker = cloudVoice ? createCloudSpeaker({ apiBase: API_BASE, ...callbacks }) : createSpeaker(callbacks);
      speakerRef.current = speaker;
    }

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg, history, voice: spoken,
          conversationId: conversationId(), page: window.location.pathname,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        /* A non-JSON error page (the Vite proxy with no backend behind it,
           a proxy 502) has no `error` field — say what is actually wrong. */
        const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        throw new Error(data.error || (local
          ? 'Could not reach the assistant — the local backend is not answering on :3001. Restart the dev server: `npm run dev` starts it too.'
          : 'Could not reach the assistant — the backend did not answer. Try again in a moment.'));
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
    listenTimer.current = window.setTimeout(() => { listenTimer.current = null; void startListening(); }, delay);
  };

  const startListening = async () => {
    if (!sttSupported() || sendingRef.current) return;
    // Barge-in: talking back cuts off any reply still being read out.
    speakerRef.current?.cancel();
    setSpeaking(false);
    recognizerRef.current?.abort();
    gotFinalRef.current = false;

    /* Pre-flight the mic ourselves. SpeechRecognition's failures are opaque —
       'network', 'audio-capture' — while getUserMedia says exactly what is
       wrong: no device, no permission, or all clear. It also raises the
       browser's real permission prompt, which SpeechRecognition alone does
       not do on every platform. */
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        haltedRef.current = true;
        setVoiceModeBoth(false);
        setListening(false);
        setError(
          name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No microphone was found on this device — plug one in, or type instead.'
            : name === 'NotAllowedError' || name === 'SecurityError'
              ? 'Microphone access is blocked for this site. Allow it in your browser’s site settings (the padlock icon), then try again.'
              : 'The microphone could not be started — you can still type below.',
        );
        return;
      }
    }

    const rec = createRecognizer({
      onInterim: (t) => setDraft(t),
      onFinal: (t) => {
        gotFinalRef.current = true;
        setDraft('');
        void sendRef.current(t, { spoken: true });
      },
      onError: (e) => {
        setListening(false);
        if (e === 'not-allowed' || e === 'service-not-allowed') {
          haltedRef.current = true;
          setVoiceModeBoth(false);
          setError('Microphone access is blocked for this site. Allow it in your browser’s site settings (the padlock icon), then try again.');
        } else if (e === 'audio-capture') {
          haltedRef.current = true;
          setVoiceModeBoth(false);
          setError('No microphone was found on this device — plug one in, or type instead.');
        } else if (e === 'network') {
          /* Chrome transcribes speech on Google's servers; a VPN, a firewall
             or a non-Google Chromium build turns that into a silent failure. */
          haltedRef.current = true;
          setVoiceModeBoth(false);
          setError('The speech service could not be reached — Chrome recognises speech online, so a VPN or firewall can block it. You can still type below.');
        } else if (e === 'no-speech' && !voiceModeRef.current) {
          setError('I didn’t catch anything — tap the mic and speak right away.');
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
    setError('');
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
      void startListening();
    }
  };

  /* One-shot talkback: tap, speak, JARVIS answers aloud. Does not start the
     hands-free loop — that is what the header toggle is for. */
  const onMicClick = () => {
    if (listening) { recognizerRef.current?.stop(); return; }
    void startListening();
  };

  /* A new chat is a new conversation id; the old one stays stored. */
  const clear = () => {
    stopVoiceActivity();
    setVoiceModeBoth(false);
    newConversation();
    setMessages([{ role: 'assistant', content: GREETING }]);
    setError('');
    setStreaming('');
  };

  const fresh = messages.length <= 1 && !sending;
  const showTyping = sending && !streaming;
  const active = listening || speaking || sending;
  const status = listening ? 'Listening…' : speaking ? 'Speaking…' : sending ? 'Thinking…' : 'Online · answers from Soham’s work';
  const iconBtn = 'lg-btn !h-9 !w-9 !px-0 justify-center !bg-transparent hover:!bg-[color:var(--surf2)]';

  if (!open) return null;

  return (
    <div className="jarvis" style={GEOM[maximised ? 'max' : 'docked']} role="dialog" aria-label="Assistant">
      <div className="jarvis-panel lg-panel lg-chrome flex h-full w-full flex-col overflow-hidden !rounded-[28px]">
        {/* Header */}
        <div className="flex flex-none items-center gap-3 border-b border-[color:var(--line)] py-3 pl-4 pr-2.5">
          <Orb size={36} active={active} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium tracking-[-.01em]">
              Assistant
            </p>
            <p className="mono mt-0.5 flex items-center gap-1.5 truncate !text-[9.5px] text-fg3">
              <span
                className={'h-1.5 w-1.5 flex-none rounded-full ' + (listening ? 'animate-pulse' : '')}
                style={{ background: listening ? '#ef4444' : speaking || sending ? 'var(--p)' : '#22c55e' }}
              />
              {status}
            </p>
          </div>
          {voiceOk && (
            <button
              type="button" onClick={toggleVoiceMode}
              title={voiceMode ? 'Voice mode on — click to end the conversation' : 'Start a hands-free voice conversation'}
              aria-label="Toggle voice conversation" aria-pressed={voiceMode}
              className={iconBtn + (voiceMode ? ' !bg-[color:var(--fg)] !text-[color:var(--on-fg)]' : '')}
            >
              <AudioLines className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={clear} className={iconBtn} title="New chat" aria-label="Start a new chat">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setMaximised((v) => !v)} className={iconBtn + ' max-sm:hidden'} title={maximised ? 'Dock' : 'Expand'} aria-label={maximised ? 'Dock the chat' : 'Expand the chat'}>
            {maximised ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => { onOpenChange(false); setMaximised(false); }} className={iconBtn} aria-label="Close chat">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Transcript */}
        <div ref={scroller} data-lenis-prevent className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-6">
          {fresh ? (
            <div className="flex flex-1 flex-col justify-end">
              <Orb size={56} active={active} />
              <p className="mt-5 text-[clamp(26px,3vw,34px)] font-medium leading-[1.05] tracking-[-.035em]">
                Ask me anything about <span className="serif text-p">Soham’s work.</span>
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-fg2">{GREETING}</p>
              <div className="mt-6 flex flex-col gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q} type="button" onClick={() => send(q)}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-4 py-3 text-left text-[13.5px] text-fg2 transition-colors hover:text-fg"
                  >
                    {q}
                    <ArrowUp className="h-3.5 w-3.5 flex-none rotate-45 text-fg3 transition-transform group-hover:rotate-90" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.slice(1).map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-[color:var(--fg)] px-4 py-2.5 text-[14px] leading-relaxed text-[color:var(--on-fg)]">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <Orb size={22} />
                  <div className="min-w-0 flex-1 text-[14.5px] leading-relaxed text-fg">
                    <MarkdownText text={m.content} />
                  </div>
                </div>
              ),
            )
          )}

          {streaming && (
            <div className="flex gap-3">
              <Orb size={22} active />
              <div className="min-w-0 flex-1 text-[14.5px] leading-relaxed text-fg">
                <MarkdownText text={streaming} />
                <span className="animate-blink text-p">▍</span>
              </div>
            </div>
          )}

          {showTyping && (
            <div className="flex items-center gap-3">
              <Orb size={22} active />
              <span className="jarvis-typing flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--fg2)]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--fg2)]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--fg2)]" />
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-[#f87171]/40 bg-[#f87171]/10 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-[#ef4444]" />
              <p className="text-[13px] leading-relaxed text-fg2">{error}</p>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex-none p-3 pt-0">
          <div className="composer">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              placeholder={listening ? 'Listening — speak now…' : 'Ask about Soham’s work…'}
              aria-label="Message the assistant"
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg3"
            />
            {voiceOk && (
              <button
                type="button"
                onClick={onMicClick}
                disabled={sending && !listening}
                aria-label={listening ? 'Stop listening' : 'Talk to the assistant'}
                title={listening ? 'Stop listening' : 'Talk to the assistant — your words are sent and the reply is read aloud'}
                className={'grid h-9 w-9 flex-none place-items-center rounded-full transition-colors disabled:opacity-50 ' +
                  (listening ? 'animate-pulse bg-[#ef4444] text-white' : 'text-fg2 hover:bg-[color:var(--surf2)] hover:text-fg')}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              aria-label="Send"
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--on-fg)] transition-[opacity,transform] hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
          <p className="mono mt-2 text-center !text-[9px] text-fg3">Conversations are stored to improve the assistant</p>
        </div>
      </div>
    </div>
  );
}
