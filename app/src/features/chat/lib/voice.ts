/* Voice helpers for JARVIS — speech-to-text and text-to-speech.
 *
 * STT uses the browser's built-in SpeechRecognition (free, no key). TTS is
 * server-side through ElevenLabs (/api/tts) when the deployment has a key —
 * browser speechSynthesis has no voices at all on some platforms — and falls
 * back to that browser voice per session and again per failed call. The LLM
 * in between stays the existing /api/chat/stream backend.
 *
 * Browser support: Chrome and Edge have full SpeechRecognition; Safari's is
 * partial (needs webkit prefix, on-device only); Firefox has none — callers
 * should check `sttSupported()` before showing voice controls. Mic capture
 * requires a secure context (https or localhost). */

/* ── Minimal SpeechRecognition typings (absent from the TS DOM lib) ── */

interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: { [index: number]: SpeechRecognitionResultLike; length: number };
}
interface SpeechRecognitionErrorEventLike extends Event { error: string }

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

export function sttSupported(): boolean {
  return typeof window !== 'undefined' && recognitionCtor() !== null;
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ── Speech-to-text ── */

export interface RecognizerOptions {
  lang?: string;
  /** Live partial transcript, for echoing into the composer while speaking. */
  onInterim?: (text: string) => void;
  /** Final transcript of one utterance. Fires before onEnd. */
  onFinal?: (text: string) => void;
  /** Web Speech error string, e.g. 'not-allowed', 'no-speech', 'network'. */
  onError?: (error: string) => void;
  /** Recognition session ended, with or without a final result. */
  onEnd?: () => void;
}

export interface Recognizer {
  start(): void;
  /** Stop gracefully — a final result may still be delivered. */
  stop(): void;
  /** Stop immediately and suppress further callbacks. */
  abort(): void;
}

export function createRecognizer(opts: RecognizerOptions): Recognizer | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = opts.lang ?? 'en-US';
  rec.continuous = false;        // one utterance per session — predictable turn-taking
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let aborted = false;

  rec.onresult = (ev) => {
    if (aborted) return;
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const t = r[0]?.transcript ?? '';
      if (r.isFinal) {
        const finalText = t.trim();
        if (finalText) opts.onFinal?.(finalText);
      } else {
        interim += t;
      }
    }
    if (interim) opts.onInterim?.(interim.trim());
  };

  rec.onerror = (ev) => {
    if (aborted) return;
    opts.onError?.(ev.error || 'unknown');
  };

  rec.onend = () => {
    if (aborted) return;
    opts.onEnd?.();
  };

  return {
    start() {
      try { rec.start(); } catch { /* already started — ignore */ }
    },
    stop() {
      try { rec.stop(); } catch { /* not running — ignore */ }
    },
    abort() {
      aborted = true;
      try { rec.abort(); } catch { /* not running — ignore */ }
    },
  };
}

/* ── Text-to-speech ── */

/** Strip markdown so the synthesizer reads words, not punctuation soup. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code block omitted) ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // [label](url) → label
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // headings
    .replace(/^\s*[-*+]\s+/gm, '')             // bullet markers
    .replace(/^\s*\d+\.\s+/gm, '')             // numbered list markers
    .replace(/^\s*>\s?/gm, '')                 // blockquotes
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // bold/italic/strike
    .replace(/\|/g, ' ')                       // table pipes
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /^en[-_]US/i.test(v.lang) && /google/i.test(v.name)) ??
    voices.find((v) => /^en[-_]US/i.test(v.lang) && /natural|neural|online/i.test(v.name)) ??
    voices.find((v) => /^en[-_]US/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang)) ??
    null
  );
}

export interface SpeakerOptions {
  rate?: number;
  pitch?: number;
  /** Fires when the very first queued sentence starts playing. */
  onStart?: () => void;
  /** Fires when every queued sentence has finished (or after cancel). */
  onDone?: () => void;
}

export interface Speaker {
  /** Feed a streamed LLM delta; complete sentences are spoken as they form. */
  push(delta: string): void;
  /** Speak whatever partial text is left (call when the stream ends). */
  flush(): void;
  /** Stop talking and drop everything queued. */
  cancel(): void;
  readonly speaking: boolean;
}

/* Pulls complete sentences off the front of the buffer; returns the rest. */
function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  // A sentence ends at ., !, ? or a newline, followed by whitespace or EOB.
  const re = /^([\s\S]*?[.!?]["'”’)\]]*\s+|[\s\S]*?\n+)/;
  for (;;) {
    const m = rest.match(re);
    if (!m) break;
    const s = m[1].trim();
    if (s) sentences.push(s);
    rest = rest.slice(m[1].length);
  }
  return { sentences, rest };
}

export function createSpeaker(opts: SpeakerOptions = {}): Speaker {
  let buffer = '';
  const queue: string[] = [];
  let playing = false;
  let cancelled = false;
  let voice: SpeechSynthesisVoice | null = null;

  // Voices load asynchronously in Chrome; refresh the pick when they arrive.
  const refreshVoice = () => { voice = voice ?? pickVoice(); };
  if (ttsSupported()) {
    refreshVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoice);
  }

  const finishIfDrained = () => {
    if (!playing && queue.length === 0 && !cancelled) opts.onDone?.();
  };

  const playNext = () => {
    if (cancelled || playing) return;
    const text = queue.shift();
    if (!text) { finishIfDrained(); return; }

    const utter = new SpeechSynthesisUtterance(speakable(text));
    if (voice) utter.voice = voice;
    utter.rate = opts.rate ?? 1.04;
    utter.pitch = opts.pitch ?? 1;

    utter.onend = () => { playing = false; playNext(); };
    utter.onerror = () => { playing = false; playNext(); };

    playing = true;
    opts.onStart?.();
    window.speechSynthesis.speak(utter);
  };

  return {
    push(delta: string) {
      if (cancelled || !ttsSupported()) return;
      buffer += delta;
      const { sentences, rest } = takeSentences(buffer);
      buffer = rest;
      if (sentences.length) {
        queue.push(...sentences);
        playNext();
      }
    },
    flush() {
      if (cancelled || !ttsSupported()) return;
      const rest = buffer.trim();
      buffer = '';
      if (rest) queue.push(rest);
      playNext();
      finishIfDrained(); // nothing to say → resolve immediately
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      buffer = '';
      if (ttsSupported()) window.speechSynthesis.cancel();
      playing = false;
    },
    get speaking() {
      return playing || queue.length > 0;
    },
  };
}

/* ── Cloud TTS (ElevenLabs via /api/tts), browser voice as fallback ── */

/** One probe per session: is server-side TTS configured on this deployment? */
let cloudStatus: Promise<boolean> | null = null;
export function cloudTtsReady(apiBase: string): Promise<boolean> {
  if (!cloudStatus) {
    cloudStatus = fetch(`${apiBase}/tts/status`)
      .then((r) => (r.ok ? r.json() : { ready: false }))
      .then((j) => j.ready === true)
      .catch(() => false);
  }
  return cloudStatus;
}

/* Same queue-and-stream contract as createSpeaker, but each sentence is
 * synthesised by the backend and played as audio. The first failed call —
 * unconfigured, over quota, offline — hands the current sentence and every
 * later one to the browser voice, so a cloud outage never silences JARVIS. */
export function createCloudSpeaker(opts: SpeakerOptions & { apiBase: string }): Speaker {
  const fallback = createSpeaker(opts);
  let buffer = '';
  const queue: string[] = [];
  let playing = false;
  let cancelled = false;
  let cloudDead = false;
  let audio: HTMLAudioElement | null = null;

  const finishIfDrained = () => {
    if (cloudDead) return;                      // the fallback owns onDone now
    if (!playing && queue.length === 0 && !cancelled) opts.onDone?.();
  };

  const handToFallback = (first: string) => {
    cloudDead = true;
    playing = false;
    fallback.push(`${first} `);
    for (const s of queue.splice(0)) fallback.push(`${s} `);
    fallback.flush();
  };

  const playNext = async () => {
    if (cancelled || playing || cloudDead) return;
    const text = queue.shift();
    if (!text) { finishIfDrained(); return; }
    playing = true;
    try {
      const r = await fetch(`${opts.apiBase}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: speakable(text) }),
      });
      if (!r.ok) throw new Error(`tts ${r.status}`);
      const blob = await r.blob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audio = el;
      const done = () => {
        URL.revokeObjectURL(url);
        if (audio === el) audio = null;
        playing = false;
        playNext();
      };
      el.onended = done;
      el.onerror = done;
      opts.onStart?.();
      await el.play();
    } catch {
      if (!cancelled) handToFallback(text);
      else playing = false;
    }
  };

  return {
    push(delta: string) {
      if (cancelled) return;
      if (cloudDead) { fallback.push(delta); return; }
      buffer += delta;
      const { sentences, rest } = takeSentences(buffer);
      buffer = rest;
      if (sentences.length) {
        queue.push(...sentences);
        void playNext();
      }
    },
    flush() {
      if (cancelled) return;
      if (cloudDead) { fallback.flush(); return; }
      const rest = buffer.trim();
      buffer = '';
      if (rest) queue.push(rest);
      void playNext();
      finishIfDrained();
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      buffer = '';
      audio?.pause();
      audio = null;
      fallback.cancel();
      playing = false;
    },
    get speaking() {
      return cloudDead ? fallback.speaking : playing || queue.length > 0;
    },
  };
}
