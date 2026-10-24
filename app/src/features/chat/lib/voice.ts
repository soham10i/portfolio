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

/**
 * Intelligent voice preprocessor: translates URLs, markdown links, code blocks,
 * and mathematical equations into fluent, natural spoken English.
 * Ensures the voice synthesizer reads words smoothly, without raw URLs or LaTeX syntax.
 */
export function speakable(text: string): string {
  let s = text;

  // 1. Strip code blocks completely
  s = s.replace(/```[\s\S]*?```/g, ' (code block omitted) ');

  // 2. Normalize Soham's specific profile & project URLs to natural speech
  s = s.replace(/https?:\/\/github\.com\/soham10i\/stf[-_]hw\b/gi, "Soham's Smart Tabletop Factory repository on GitHub");
  s = s.replace(/github\.com\/soham10i\/stf[-_]hw\b/gi, "Soham's Smart Tabletop Factory repository on GitHub");
  s = s.replace(/https?:\/\/github\.com\/soham10i\b/gi, "Soham's GitHub profile");
  s = s.replace(/github\.com\/soham10i\b/gi, "Soham's GitHub profile");
  s = s.replace(/https?:\/\/([a-z0-9.-]+\.)?linkedin\.com\/in\/soham-patel-10i\/?/gi, "Soham's LinkedIn profile");
  s = s.replace(/linkedin\.com\/in\/soham-patel-10i\/?/gi, "Soham's LinkedIn profile");
  s = s.replace(/soham\.patel\.2201@gmail\.com/gi, "Soham's email address");

  // 3. Markdown links: [Label](url) -> speak label (unless label itself is a raw URL)
  s = s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_match, label) => {
    if (/https?:\/\/|github\.com|linkedin\.com/i.test(label)) {
      return 'the link';
    }
    return label;
  });

  // 4. Any remaining raw URLs: speak as domain or repository
  s = s.replace(/https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/gi, 'the $2 repository on GitHub');
  s = s.replace(/https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/gi, '$1 on GitHub');
  s = s.replace(/https?:\/\/(?:www\.)?([a-zA-Z0-9.-]+)\/[^\s]*/gi, 'the $1 link');
  s = s.replace(/https?:\/\/[^\s]+/gi, 'the link');

  // 5. Clean LaTeX & Mathematical Notation into spoken English
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/\$([^$\n]*?)\$/g, '$1');
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2');
  s = s.replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1');
  s = s.replace(/\\pm|\+\/-/g, ' plus or minus ');
  s = s.replace(/\\approx|~/g, ' approximately ');
  s = s.replace(/\\le\b|\\leq\b|<=/g, ' less than or equal to ');
  s = s.replace(/\\ge\b|\\geq\b|>=/g, ' greater than or equal to ');
  s = s.replace(/\\neq\b|!=/g, ' not equal to ');
  s = s.replace(/\\times\b|\\cdot\b|\s\*\s/g, ' times ');
  s = s.replace(/\\sum\b/g, ' sum ');
  s = s.replace(/\\int\b/g, ' integral ');
  s = s.replace(/\\partial\b/g, ' partial ');
  s = s.replace(/\\infty\b/g, ' infinity ');
  s = s.replace(/\\alpha\b/g, ' alpha ');
  s = s.replace(/\\beta\b/g, ' beta ');
  s = s.replace(/\\gamma\b/g, ' gamma ');
  s = s.replace(/\\delta\b/g, ' delta ');
  s = s.replace(/\\theta\b/g, ' theta ');
  s = s.replace(/\\sigma\b/g, ' sigma ');
  s = s.replace(/\\mu\b|μ/g, ' micro ');
  s = s.replace(/\\pi\b/g, ' pi ');
  s = s.replace(/\\omega\b/g, ' omega ');
  s = s.replace(/\^2\b/g, ' squared ');
  s = s.replace(/\^3\b/g, ' cubed ');
  s = s.replace(/\^([a-zA-Z0-9]+)/g, ' to the power of $1 ');
  s = s.replace(/_([a-zA-Z0-9]+)/g, ' sub $1 ');

  // 6. Units and Common Engineering Abbreviations
  s = s.replace(/\b1\.2\s*mm\s*RMS\b/gi, '1.2 millimeters R M S');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*mm\b/gi, '$1 millimeters');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*cm\b/gi, '$1 centimeters');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*m\b(?!\w)/gi, '$1 meters');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*Hz\b/gi, '$1 Hertz');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*kHz\b/gi, '$1 kilohertz');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*MHz\b/gi, '$1 megahertz');
  s = s.replace(/\bRMSE\b/g, 'R M S E');
  s = s.replace(/\bA\*(?!\w)/g, 'A star');
  s = s.replace(/\bYOLOv8\b/gi, 'YOLO version 8');
  s = s.replace(/\bMuJoCo\b/gi, 'Moo-joh-co');
  s = s.replace(/\bdSPACE\b/gi, 'D-space');
  s = s.replace(/\bfischertechnik\b/gi, 'Fisher-technik');
  s = s.replace(/\bPLC\b/g, 'P L C');
  s = s.replace(/\bBLE\s*\+\s*IMU\b/gi, 'B L E and I M U');
  s = s.replace(/\bBLE\b/g, 'B L E');
  s = s.replace(/\bIMU\b/g, 'I M U');
  s = s.replace(/\bM\.Sc\.\b/g, 'Master of Science');
  s = s.replace(/\bB\.Tech\.\b/g, 'Bachelor of Technology');
  s = s.replace(/\bSQL\b/g, 'S Q L');
  s = s.replace(/\bETL\b/g, 'E T L');
  s = s.replace(/\bJWT\b/g, 'J W T');
  s = s.replace(/\bAPI\b/g, 'A P I');
  s = s.replace(/\bAPIs\b/g, 'A P Is');
  s = s.replace(/\bCI\/CD\b/gi, 'C I C D');

  // 7. Strip remaining markdown formatting characters
  s = s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // headings
    .replace(/^\s*[-*+]\s+/gm, '')             // bullet markers
    .replace(/^\s*\d+\.\s+/gm, '')             // numbered list markers
    .replace(/^\s*>\s?/gm, '')                 // blockquotes
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // bold/italic/strike
    .replace(/\|/g, ' ')                       // table pipes
    .replace(/[[\]()]/g, ' ')                  // stray brackets or parens
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s;
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

/* Pulls complete sentences or initial clause off the front of the buffer; returns the rest. */
function takeSentences(buffer: string, isFirstUtterance: boolean): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;

  // Early clause break for the very first sentence to dramatically lower initial audio latency
  if (isFirstUtterance) {
    const clauseMatch = rest.match(/^([\s\S]*?[,;:]\s+)/);
    if (clauseMatch) {
      const candidate = clauseMatch[1].trim();
      const words = candidate.split(/\s+/).length;
      if (words >= 5 && words <= 16) {
        sentences.push(candidate);
        rest = rest.slice(clauseMatch[1].length);
      }
    }
  }

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
  let isFirst = true;
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
      const { sentences, rest } = takeSentences(buffer, isFirst);
      buffer = rest;
      if (sentences.length) {
        isFirst = false;
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
      finishIfDrained();
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

interface QueuedCloudItem {
  text: string;
  audioPromise: Promise<HTMLAudioElement>;
}

/**
 * Pipelined Cloud Speaker:
 * Segments sentences as LLM streams and IMMEDIATELY begins prefetching audio for
 * subsequent sentences in parallel with current playback. Eliminates inter-sentence
 * network latency so speech flows continuously without pauses.
 */
export function createCloudSpeaker(opts: SpeakerOptions & { apiBase: string }): Speaker {
  const fallback = createSpeaker(opts);
  let buffer = '';
  let isFirst = true;
  const queue: QueuedCloudItem[] = [];
  let playing = false;
  let cancelled = false;
  let cloudDead = false;
  let audio: HTMLAudioElement | null = null;

  const prefetchAudio = (text: string): Promise<HTMLAudioElement> => {
    return new Promise(async (resolve, reject) => {
      try {
        const spoken = speakable(text);
        if (!spoken) return reject(new Error('Empty text'));

        const r = await fetch(`${opts.apiBase}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: spoken }),
        });
        if (!r.ok) throw new Error(`tts ${r.status}`);

        const blob = await r.blob();
        if (cancelled) return reject(new Error('Cancelled'));

        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        el.preload = 'auto';
        resolve(el);
      } catch (err) {
        reject(err);
      }
    });
  };

  const finishIfDrained = () => {
    if (cloudDead) return;
    if (!playing && queue.length === 0 && !cancelled) opts.onDone?.();
  };

  const handToFallback = (failedText: string) => {
    cloudDead = true;
    playing = false;
    fallback.push(`${failedText} `);
    while (queue.length > 0) {
      const next = queue.shift();
      if (next) fallback.push(`${next.text} `);
    }
    fallback.flush();
  };

  const playNext = async () => {
    if (cancelled || playing || cloudDead) return;
    const item = queue.shift();
    if (!item) { finishIfDrained(); return; }

    playing = true;
    try {
      // Audio is already prefetching in parallel; ready immediately
      const el = await item.audioPromise;
      if (cancelled) {
        URL.revokeObjectURL(el.src);
        playing = false;
        return;
      }
      audio = el;

      const done = () => {
        URL.revokeObjectURL(el.src);
        if (audio === el) audio = null;
        playing = false;
        playNext();
      };

      el.onended = done;
      el.onerror = done;
      opts.onStart?.();
      await el.play();
    } catch {
      if (!cancelled) handToFallback(item.text);
      else playing = false;
    }
  };

  const enqueue = (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const audioPromise = prefetchAudio(trimmed);
    audioPromise.catch(() => {}); // prevent unhandled rejections
    queue.push({ text: trimmed, audioPromise });
    void playNext();
  };

  return {
    push(delta: string) {
      if (cancelled) return;
      if (cloudDead) { fallback.push(delta); return; }
      buffer += delta;
      const { sentences, rest } = takeSentences(buffer, isFirst);
      buffer = rest;
      if (sentences.length) {
        isFirst = false;
        for (const s of sentences) enqueue(s);
      }
    },
    flush() {
      if (cancelled) return;
      if (cloudDead) { fallback.flush(); return; }
      const rest = buffer.trim();
      buffer = '';
      if (rest) enqueue(rest);
      void playNext();
      finishIfDrained();
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      buffer = '';
      if (audio) {
        audio.pause();
        audio = null;
      }
      fallback.cancel();
      playing = false;
    },
    get speaking() {
      return cloudDead ? fallback.speaking : playing || queue.length > 0;
    },
  };
}
