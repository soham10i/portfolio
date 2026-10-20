import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowUp, Camera, Check, Database, Loader2, Pause, Play, Save, Sparkles, Square, Upload, Wand2,
} from 'lucide-react';
import '@/features/story/story.css';
import PageHeader from '@/features/story/components/PageHeader';
import JarvisOrb from '@/features/chat/components/JarvisOrb';
import Pipeline, { type PipelineState } from '@/features/scene-lab/components/Pipeline';
import ObjectChart from '@/features/scene-lab/components/ObjectChart';
import SavedAnalyses from '@/features/scene-lab/components/SavedAnalyses';
import * as saved from '@/features/scene-lab/lib/savedSessions';
import { SceneDetector, frameDelta, type Detection } from '@/features/scene-lab/lib/yolo';
import { probeVideo, seekTo, waitForFrame } from '@/features/scene-lab/lib/videoProbe';
import * as session from '@/features/scene-lab/lib/videoSession';
import SessionLibrary from '@/features/scene-lab/components/SessionLibrary';
import ScenarioPanel from '@/features/scene-lab/components/ScenarioPanel';
import VlmInspector from '@/features/scene-lab/components/VlmInspector';
import { buildContactSheet, MAX_SHEET_FRAMES, type ContactSheet } from '@/features/scene-lab/lib/contactSheet';
import * as sceneApi from '@/features/scene-lab/lib/sceneApi';
import { describeFrame, summariseLog } from '@/features/scene-lab/lib/localNarrator';

/* Real-Time Scene Understanding — interactive demo.
 *
 * Detection runs entirely in the visitor's browser (see lib/yolo.ts), so
 * webcam frames never leave the device and the page costs nothing to serve.
 * Only sampled keyframes are sent to /api/scene/describe, which proxies to the
 * project's FastAPI + BLIP service. If that service is asleep or unreachable,
 * detection carries on and the page says so instead of breaking. */

const API_BASE = import.meta.env.VITE_CHAT_API_BASE ?? '/api';
const MAX_VIDEO_SECONDS = 240;          // 4 minutes, checked before any decode
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;   // 300 MB, checked before the file is even opened
const KEYFRAME_MIN_GAP_MS = 1500;       // never narrate faster than this
const KEYFRAME_MAX_GAP_MS = 4000;       // ...but never go longer than this either
const SCENE_CHANGE_THRESHOLD = 0.04;    // mean abs luma delta that counts as a new scene

type Source = 'idle' | 'webcam' | 'video';

interface Keyframe {
  id: number;
  at: number;                 // seconds into the source
  thumb: string;              // data URL
  labels: string[];
  caption?: string;
  /** Which engine produced the caption — shown so nothing is misattributed. */
  engine?: 'blip' | 'vlm' | 'local';
  confidence?: number | null;
  error?: string;
  pending: boolean;
}

const BOX_COLORS = ['#22d3ee', '#5ea2ff', '#b18cff', '#4ade80', '#f97316', '#f472b6'];


/** Draw detection boxes and labels onto the overlay canvas. */
function drawBoxes(cv: HTMLCanvasElement, found: Detection[], sw: number) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.lineWidth = Math.max(2, sw / 420);
  ctx.font = `${Math.max(13, sw / 52)}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'top';
  for (const d of found) {
    const c = BOX_COLORS[d.classId % BOX_COLORS.length];
    const [x1, y1, x2, y2] = d.box;
    ctx.strokeStyle = c;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const tag = `${d.label} ${d.score.toFixed(2)}`;
    const tw = ctx.measureText(tag).width + 10;
    const th = Math.max(18, sw / 40);
    ctx.fillStyle = c;
    ctx.fillRect(x1, Math.max(0, y1 - th), tw, th);
    ctx.fillStyle = '#05070d';
    ctx.fillText(tag, x1 + 5, Math.max(0, y1 - th) + 3);
  }
}

export default function SceneLab() {
  /* Colours come from the site's design tokens (story.css), light or dark. */
  const accent = 'var(--a)';

  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const detector = useRef<SceneDetector | null>(null);
  const prevLuma = useRef<Uint8ClampedArray | null>(null);
  const lastKeyframeAt = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const keyId = useRef(0);

  const [source, setSource] = useState<Source>('idle');
  const [running, setRunning] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [fps, setFps] = useState(0);
  const [inferMs, setInferMs] = useState(0);
  const [backend, setBackend] = useState('—');
  const [threshold, setThreshold] = useState(0.35);
  const [narrate, setNarrate] = useState(true);
  const [serviceUp, setServiceUp] = useState<boolean | null>(null);
  const [serviceReason, setServiceReason] = useState('');
  const [engine, setEngine] = useState<'blip' | 'vlm' | null>(null);
  const [summary, setSummary] = useState('');
  const [progress, setProgress] = useState(0);        // 0..1 while a clip is scanned
  const [scanning, setScanning] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [summarising, setSummarising] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'summary' | 'ask' | 'how'>('timeline');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /* Saving (opt-in, text only — lib/savedSessions.ts). `viewing` is set while a
     saved analysis from the database is on screen instead of a live run. */
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [viewing, setViewing] = useState<{ title: string; createdAt: string } | null>(null);
  const [interpolating, setInterpolating] = useState(false);

  /* ── Scenario + VLM transparency ──────────────────────────────────────────
     `scenario` is the visitor's stated goal; it is mirrored to the server so
     every downstream call sees it without the client re-attaching it. `sheet`
     is the composite image that will go to the vision model, rebuilt whenever
     the keyframes change — it is both the payload and the thing the inspector
     displays, which is what makes the panel honest. */
  const [sessionId, setSessionId] = useState<string | undefined>(sceneApi.storedSessionId);
  const [scenario, setScenario] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [sheet, setSheet] = useState<ContactSheet | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [inspection, setInspection] = useState<sceneApi.Inspection | null>(null);
  const askAbort = useRef<AbortController | null>(null);

  /* Adopt or mint a scenario session. The id is remembered in localStorage so
     a reload keeps the same scenario, and the server may hand back a different
     one if the old session expired — hence taking the id from the response
     rather than assuming ours survived. */
  useEffect(() => {
    let dead = false;
    sceneApi.fetchSession(sceneApi.storedSessionId())
      .then((s) => {
        if (dead) return;
        setSessionId(s.sessionId);
        if (s.scenario) setScenario(s.scenario);
        setSessionNote(
          s.ephemeral
            ? 'Held in server memory for 30 minutes of inactivity, and lost on any redeploy. Nothing here is written to a database, and no frame is ever stored — only this text and the detector log.'
            : '',
        );
      })
      .catch(() => { if (!dead) setSessionNote('Scenario could not reach the server — it will still be sent with each question.'); });
    return () => { dead = true; };
  }, []);

  const commitScenario = useCallback(async (text: string) => {
    const s = await sceneApi.saveSession({ sessionId, scenario: text });
    setSessionId(s.sessionId);
  }, [sessionId]);

  /* Rebuild the composite whenever the captioned keyframes change. Debounced,
     because a clip scan appends frames rapidly and compositing on every one
     would burn the main thread for images nobody has asked about yet. */
  useEffect(() => {
    const captioned = keyframes.filter((k) => k.thumb);
    if (captioned.length === 0) { setSheet(null); return; }
    let dead = false;
    setSheetBusy(true);
    const t = window.setTimeout(async () => {
      /* Oldest first, newest last: the sheet reads left-to-right as time. The
         component's own keyframe list is newest-first. */
      const ordered = [...captioned].reverse().slice(-MAX_SHEET_FRAMES)
        .map((k) => ({ at: k.at, thumb: k.thumb, labels: k.labels }));
      try {
        const built = await buildContactSheet(ordered);
        if (!dead) setSheet(built);
      } catch {
        if (!dead) setSheet(null);
      } finally {
        if (!dead) setSheetBusy(false);
      }
    }, 400);
    return () => { dead = true; window.clearTimeout(t); setSheetBusy(false); window.clearTimeout(t); };
  }, [keyframes]);

  /* Ask the backend whether the captioning service is awake, so the UI can be
     honest up front rather than failing on the first keyframe. */
  useEffect(() => {
    let dead = false;
    fetch(`${API_BASE}/scene/status`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        setServiceUp(!!d.available);
        setServiceReason(d.reason ?? '');
        setEngine(d.engine ?? null);
      })
      .catch(() => { if (!dead) { setServiceUp(false); setServiceReason('unreachable'); } });
    return () => { dead = true; };
  }, []);

  const ensureModel = useCallback(async () => {
    if (detector.current?.ready) return detector.current;
    setLoadError(null);
    try {
      const d = detector.current ?? new SceneDetector();
      detector.current = d;
      await d.load(setLoadPct);
      setBackend(d.backend);
      setReady(true);
      return d;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Model failed to load');
      return null;
    }
  }, []);

  /* Caption one frame and return the patch, so the clip scanner can await it
     in order rather than firing everything in parallel. */
  const describeOne = useCallback(async (kf: Keyframe): Promise<Partial<Keyframe>> => {
    try {
      const r = await fetch(`${API_BASE}/scene/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: kf.thumb, labels: kf.labels }),
      });
      const d = await r.json().catch(() => ({}));
      return r.ok
        ? { pending: false, caption: d.caption, engine: d.engine, confidence: d.confidence }
        : { pending: false, error: d.error || `HTTP ${r.status}` };
    } catch {
      return { pending: false, error: 'Network error' };
    }
  }, []);

  const describeKeyframe = useCallback(async (kf: Keyframe) => {
    try {
      const r = await fetch(`${API_BASE}/scene/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: kf.thumb, labels: kf.labels }),
      });
      const d = await r.json().catch(() => ({}));
      setKeyframes((ks) => ks.map((k) => k.id !== kf.id ? k : {
        ...k, pending: false,
        caption: r.ok ? d.caption : undefined,
        engine: r.ok ? d.engine : undefined,
        confidence: r.ok ? d.confidence : undefined,
        error: r.ok ? undefined : (d.error || `HTTP ${r.status}`),
      }));
    } catch {
      setKeyframes((ks) => ks.map((k) => k.id !== kf.id ? k : {
        ...k, pending: false, error: 'Network error',
      }));
    }
  }, []);

  const cancelScan = useRef(false);

  /* Fold the keyframe log into one account of the clip. Per-frame captions
     read like disconnected stills; this is the part that gives them context. */
  const summarise = useCallback(async (frames: Keyframe[]) => {
    if (!frames.length) return;
    const log = [...frames].reverse().map((k) => ({ t: k.at, caption: k.caption, labels: k.labels }));

    /* A local summary is written first, unconditionally. Previously the whole
       thing was gated on two model-written captions, so with the captioner
       offline the box stayed on its placeholder and never explained why — even
       though the detector had produced a complete keyframe log. */
    setSummary(summariseLog(log));
    setSummaryError('');

    // Then, if a language model is reachable, ask it for the better version.
    const modelWritten = frames.filter((k) => k.caption && k.engine && k.engine !== 'local');
    if (modelWritten.length < 2) return;

    setSummarising(true);
    try {
      const r = await fetch(`${API_BASE}/scene/summarise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: log.slice(0, 40) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.summary) setSummary(d.summary);
      else setSummaryError(`${d.error || `HTTP ${r.status}`} — showing the detector-only summary instead.`);
    } catch {
      setSummaryError('Network error — showing the detector-only summary instead.');
    } finally {
      setSummarising(false);
    }
  }, []);

  /* ── one frame of work; the effect below owns the scheduling ────────── */
  const step = useCallback(async () => {
    const v = video.current;
    const cv = overlay.current;
    const det = detector.current;
    if (!v || !cv || !det?.ready || v.readyState < 2) return;

    /* A finished clip still satisfies readyState, so without this the heartbeat
       keeps sampling the frozen last frame and burns captions on duplicates. */
    if (v.ended) { setRunning(false); return; }

    const sw = v.videoWidth, sh = v.videoHeight;
    if (cv.width !== sw || cv.height !== sh) { cv.width = sw; cv.height = sh; }

    const t0 = performance.now();
    const found = await det.detect(v, sw, sh, threshold);
    setDetections(found);
    setInferMs(det.lastInferMs);
    setFps(1000 / Math.max(1, performance.now() - t0));

    drawBoxes(cv, found, sw);

    /* Keyframe selection: a scene counts as new when the downsampled luma
       differs enough from the last narrated frame, rate-limited so a busy
       scene cannot flood the captioning service. */
    if (narrate && serviceUp !== false) {
      const now = performance.now();
      const small = document.createElement('canvas');
      small.width = 64; small.height = 64;
      const sctx = small.getContext('2d', { willReadFrequently: true });
      if (sctx) {
        sctx.drawImage(v, 0, 0, 64, 64);
        const luma = sctx.getImageData(0, 0, 64, 64).data;
        const delta = prevLuma.current ? frameDelta(prevLuma.current, luma) : 1;
        const since = now - lastKeyframeAt.current;
        /* Sample on scene change, but also on a heartbeat: a locked-off shot of
           a static room never crosses the delta threshold, and a pipeline that
           only fires on change would describe such a clip exactly once. */
        const changed = delta > SCENE_CHANGE_THRESHOLD && since > KEYFRAME_MIN_GAP_MS;
        const overdue = since > KEYFRAME_MAX_GAP_MS;
        if (changed || overdue) {
          prevLuma.current = luma;
          lastKeyframeAt.current = now;

          // downscale to 512 on the long edge before sending — the caption
          // model gains nothing from full resolution and the upload shrinks
          const shot = document.createElement('canvas');
          const scale = Math.min(1, 512 / Math.max(sw, sh));
          shot.width = Math.round(sw * scale);
          shot.height = Math.round(sh * scale);
          shot.getContext('2d')?.drawImage(v, 0, 0, shot.width, shot.height);
          const kf: Keyframe = {
            id: keyId.current++,
            at: v.currentTime || 0,
            thumb: shot.toDataURL('image/jpeg', 0.72),
            labels: Array.from(new Set(found.map((f) => f.label))).slice(0, 6),
            pending: true,
          };
          setKeyframes((ks) => [kf, ...ks].slice(0, 24));
          void describeKeyframe(kf);
        } else if (!prevLuma.current) {
          prevLuma.current = luma;
        }
      }
    }

  }, [threshold, narrate, serviceUp, describeKeyframe]);

  /* When a CAMERA session stops, fold what we collected into the narrative
     without making the visitor find the button.
     Restricted to `webcam` on purpose: a clip scan sets running=false at the
     start (it drives its own frames rather than a rAF loop), so this effect
     used to fire two frames into an upload and publish a premature summary
     that the real one then overwrote. Uploads summarise once, at the end of
     scanClip, where the full keyframe list exists. */
  const autoSummarised = useRef(false);
  useEffect(() => {
    if (source !== 'webcam') return;
    if (running) { autoSummarised.current = false; return; }
    if (autoSummarised.current) return;
    if (keyframes.length === 0) return;
    autoSummarised.current = true;
    void summarise(keyframes);
  }, [running, source, keyframes, summarise]);

  useEffect(() => {
    if (!running) return;
    let handle = 0;
    let alive = true;
    const drive = () => {
      void step().finally(() => { if (alive) handle = requestAnimationFrame(drive); });
    };
    handle = requestAnimationFrame(drive);
    return () => { alive = false; cancelAnimationFrame(handle); };
  }, [running, step]);

  /* ── sources ────────────────────────────────────────────────────────── */

  const stopAll = useCallback(() => {
    cancelScan.current = true;
    setRunning(false);

    if (stream.current && video.current && overlay.current) {
      const sw = video.current.videoWidth;
      const sh = video.current.videoHeight;
      if (sw && sh) {
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(video.current, 0, 0, sw, sh);
          ctx.drawImage(overlay.current, 0, 0, sw, sh);
          setLastFrame(c.toDataURL('image/jpeg', 0.8));
        }
      }
    } else {
      setLastFrame(null);
    }

    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) { video.current.pause(); video.current.srcObject = null; video.current.removeAttribute('src'); }
    if (overlay.current) {
      overlay.current.getContext('2d')?.clearRect(0, 0, overlay.current.width, overlay.current.height);
    }
    setSource('idle');
    setDetections([]);
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const startFresh = () => {
    setSaveState('idle'); setSavedId(null); setViewing(null); setLabelFilter(null);
  };

  const startWebcam = async () => {
    setNotice(null);
    setLastFrame(null);
    startFresh();
    const d = await ensureModel();
    if (!d) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: false,
      });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        video.current.muted = true;
        await video.current.play();
      }
      prevLuma.current = null;
      const track = s.getVideoTracks()[0];
      const st = track?.getSettings?.() ?? {};
      const entry = session.add({
        name: track?.label || 'Camera session',
        bytes: 0,                     // a live stream is never buffered as a file
        durationSec: NaN,
        width: Number(st.width) || 0,
        height: Number(st.height) || 0,
        url: '',
        kind: 'camera',
      });
      setActiveVideo(entry.id);
      setSource('webcam');
      setRunning(true);
    } catch (err) {
      setNotice(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission denied. Nothing is uploaded — detection runs on your device — but the browser needs access to the stream.'
          : 'No camera available on this device.',
      );
    }
  };

  /* Uploaded clips are scanned by seeking, not by playing.
   *
   * Realtime playback ties coverage to inference speed: at ~500 ms a frame on
   * WASM, a 5-minute clip played back in real time is sampled at well under 1%
   * and a short clip can finish before the model has even downloaded. Seeking
   * to a fixed set of timestamps instead makes coverage deterministic and
   * bounded — the whole clip is represented by SAMPLE_TARGET frames however
   * slow the device is — and it gives an honest progress bar. */
  const scanClip = useCallback(async (duration: number, sessionId?: string) => {
    const v = video.current;
    const cv = overlay.current;
    const det = detector.current;
    if (!v || !cv || !det?.ready) return;

    const SAMPLE_TARGET = 24;
    const step = Math.max(1.2, duration / SAMPLE_TARGET);
    const stamps: number[] = [];
    for (let t = 0.2; t < duration - 0.05 && stamps.length < SAMPLE_TARGET; t += step) stamps.push(t);
    if (!stamps.length) stamps.push(0);

    setScanning(true);
    setProgress(0);
    setKeyframes([]);
    setSummary('');
    setQa([]);

    const collected: Keyframe[] = [];
    let stalled = 0;          // consecutive failed seeks; three in a row is fatal
    for (let i = 0; i < stamps.length; i++) {
      if (cancelScan.current) break;
      /* A bounded seek. The unbounded version hung forever on clips the
         browser could open but not seek through, which is what "nothing in
         frames, no error" looked like from the outside. */
      const landed = await seekTo(v, Math.min(stamps[i], Math.max(0, duration - 0.05)));
      if (!landed) { stalled += 1; if (stalled >= 3) break; continue; }

      const sw = v.videoWidth, sh = v.videoHeight;
      if (!sw || !sh) continue;
      if (cv.width !== sw || cv.height !== sh) { cv.width = sw; cv.height = sh; }

      const found = await det.detect(v, sw, sh, threshold);
      setDetections(found);
      setInferMs(det.lastInferMs);
      drawBoxes(cv, found, sw);

      const shot = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(sw, sh));
      shot.width = Math.round(sw * scale);
      shot.height = Math.round(sh * scale);
      shot.getContext('2d')?.drawImage(v, 0, 0, shot.width, shot.height);

      /* Describe the frame from the detections straight away. If a captioner
         answers, its sentence replaces this one; if none does, the visitor
         still gets a factual description instead of an em-dash. */
      const localText = describeFrame(found, sw, sh);
      const kf: Keyframe = {
        id: keyId.current++,
        at: stamps[i],
        thumb: shot.toDataURL('image/jpeg', 0.72),
        labels: Array.from(new Set(found.map((f) => f.label))).slice(0, 8),
        caption: localText ?? undefined,
        engine: localText ? 'local' : undefined,
        pending: narrate && serviceUp !== false,
      };
      collected.push(kf);
      setKeyframes([...collected].reverse());
      setProgress((i + 1) / stamps.length);
      if (sessionId) session.update(sessionId, { keyframes: collected.length });

      if (narrate && serviceUp !== false) {
        // sequential, not parallel: keeps the per-IP frame budget predictable
        // and the captions arriving in the order a viewer reads them
        const done = await describeOne(kf);
        // Keep the local sentence if the remote call came back empty
        if (done.caption) Object.assign(kf, done);
        else Object.assign(kf, { pending: false, error: done.error });
        setKeyframes([...collected].reverse());
        if (sessionId) {
          session.update(sessionId, { captioned: collected.filter((k) => k.caption).length });
        }
      } else {
        kf.pending = false;
      }
    }

    setScanning(false);
    setProgress(1);
    return collected;
  }, [threshold, narrate, serviceUp, describeOne]);

  const processVideoUrl = async (url: string, filename: string, size: number) => {
    startFresh();
    const info = await probeVideo(url);
    if (!info.ok) {
      URL.revokeObjectURL(url);
      setNotice(info.reason);
      return;
    }
    if (info.duration > MAX_VIDEO_SECONDS) {
      URL.revokeObjectURL(url);
      setNotice(`That clip is ${Math.round(info.duration)}s — the limit is ${MAX_VIDEO_SECONDS}s (4 minutes). Trim it and try again.`);
      return;
    }

    const entry = session.add({
      name: filename,
      bytes: size,
      durationSec: info.duration,
      width: info.width,
      height: info.height,
      url,
      kind: 'file',
    });
    setActiveVideo(entry.id);
    setSource('video');
    setRunning(false);

    const d = await ensureModel();
    if (!d) { setSource('idle'); return; }

    const v = video.current;
    if (v) {
      v.srcObject = null;
      v.src = url;
      v.muted = true;
      v.loop = false;
      v.pause();
      if (!(await waitForFrame(v))) {
        setNotice('The clip loaded but never produced a frame to analyse. Re-encoding it as H.264 MP4 or WebM usually fixes this.');
        setSource('idle');
        return;
      }
    }

    const collected = await scanClip(info.duration, entry.id);
    if (!collected || collected.length === 0) {
      setNotice('No frames could be read from that clip. It decoded, but seeking through it failed — re-encoding it usually fixes that.');
      return;
    }
    await summarise([...collected].reverse());
    session.update(entry.id, { summarised: true });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleFile(file);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) { setNotice('That is not a video file — drop an MP4, WebM or MOV clip.'); return; }
    setNotice(null);
    setLastFrame(null);
    cancelScan.current = false;

    if (file.size > MAX_VIDEO_BYTES) {
      setNotice(`That file is ${Math.round(file.size / 1048576)} MB — the limit is ${MAX_VIDEO_BYTES / 1048576} MB.`);
      return;
    }

    const url = URL.createObjectURL(file);
    await processVideoUrl(url, file.name, file.size);
  };

  const onUpscaleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNotice(null);
    setLastFrame(null);
    cancelScan.current = false;

    if (file.size > MAX_VIDEO_BYTES) {
      setNotice(`That file is ${Math.round(file.size / 1048576)} MB — the limit is ${MAX_VIDEO_BYTES / 1048576} MB.`);
      return;
    }

    setSource('idle');
    setInterpolating(true);
    setNotice('Upscaling video to 60fps using Optical Flow AI... This can take minutes depending on video length.');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const r = await fetch(`${API_BASE}/scene/interpolate`, {
        method: 'POST',
        body: formData,
      });
      
      if (!r.ok) {
        const errText = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(errText.error || `HTTP ${r.status}`);
      }
      
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      
      setInterpolating(false);
      setNotice(null);
      await processVideoUrl(url, file.name + ' (60fps)', blob.size);
    } catch (err) {
      setInterpolating(false);
      setNotice('Interpolation failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  /* Re-analyse a clip already in this session, without re-picking the file. */
  const reopen = useCallback(async (id: string) => {
    const item = session.get(id);
    if (!item || item.kind !== 'file') return;
    setNotice(null);
    setLastFrame(null);
    cancelScan.current = false;
    setActiveVideo(id);
    setSource('video');
    setRunning(false);
    const d = await ensureModel();
    if (!d) { setSource('idle'); return; }
    const v = video.current;
    if (v) {
      v.srcObject = null;
      v.src = item.url;
      v.muted = true;
      v.loop = false;
      v.pause();
      if (!(await waitForFrame(v))) { setNotice('That clip could not be re-opened.'); return; }
    }
    const collected = await scanClip(item.durationSec, id);
    if (collected?.length) {
      await summarise([...collected].reverse());
      session.update(id, { summarised: true });
    }
  }, [ensureModel, scanClip, summarise]);

  /* Removing a clip revokes its object URL, which is what actually frees the
     memory. If it is the one on screen, clear the player too. */
  const forget = useCallback((id: string) => {
    if (activeVideo === id) {
      const v = video.current;
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      setActiveVideo(null);
      setSource('idle');
      setLastFrame(null);
      setKeyframes([]);
      setSummary('');
      setQa([]);
      setDetections([]);
    }
    session.remove(id);
  }, [activeVideo]);

  const forgetAll = useCallback(() => {
    const v = video.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    session.clear();
    setActiveVideo(null);
    setSource('idle');
    setLastFrame(null);
    setKeyframes([]);
    setSummary('');
    setQa([]);
    setDetections([]);
  }, []);

  /* Save the current analysis to the database — text only. */
  const saveAnalysis = async () => {
    if (!keyframes.length || saveState === 'saving') return;
    setSaveState('saving'); setSaveError('');
    const item = activeVideo ? session.get(activeVideo) : undefined;
    try {
      const r = await saved.saveSession({
        title: viewing?.title ?? item?.name ?? (source === 'webcam' ? 'Camera session' : 'Clip analysis'),
        source: item?.kind === 'camera' || source === 'webcam' ? 'camera' : 'file',
        durationSec: item && isFinite(item.durationSec) ? item.durationSec : null,
        scenario, summary,
        keyframes: [...keyframes].reverse().map((k) => ({
          t: k.at, labels: k.labels, caption: k.caption ?? null, engine: k.engine ?? null, confidence: k.confidence ?? null,
        })),
        qa: qa.filter((m) => m.content.trim()),
      });
      setSavedId(r.id); setSaveState('saved'); setSavedRefresh((n) => n + 1);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  /* Bring a saved analysis back: timeline, summary, scenario and Q&A. There
     are no thumbnails (they were never stored), and follow-up questions work
     from the saved text log. */
  const openSaved = async (id: string) => {
    try {
      const s = await saved.loadSession(id);
      stopAll();
      setLastFrame(null);
      setKeyframes([...s.keyframes].reverse().map((k) => ({
        id: keyId.current++, at: k.t, thumb: '', labels: k.labels, caption: k.caption ?? undefined,
        engine: k.engine ?? undefined, confidence: k.confidence, pending: false,
      })));
      setSummary(s.summary); setQa(s.qa); setScenario(s.scenario);
      setSavedId(s.id); setSaveState('saved'); setLabelFilter(null);
      setViewing({ title: s.title, createdAt: s.createdAt });
      setActiveTab('timeline');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not open that analysis');
    }
  };

  /* Ask a follow-up about the scene.
   *
   * Three things are combined into ONE request, which is the whole point of
   * this feature: the composite image of recent frames (what the model can
   * see), the detector-plus-caption log (text the pipeline already extracted),
   * and the visitor's scenario plus their question (what they want to know).
   * The answer streams, because a contact-sheet question takes ~4s on the 11B
   * vision model and a spinner for four seconds reads as broken.
   *
   * The inspection payload arrives as the first SSE frame, so the "sent to the
   * model" panel fills in while the answer is still generating. */
  const askQuestion = async () => {
    const q = question.trim();
    const captioned = keyframes.filter((k) => k.caption);
    if (!q || asking) return;
    if (keyframes.length === 0) return;

    askAbort.current?.abort();
    const ctrl = new AbortController();
    askAbort.current = ctrl;

    setQuestion('');
    setQa((h) => [...h, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setAsking(true);

    const frames = [...(captioned.length ? captioned : keyframes)].reverse()
      .map((k) => ({ t: k.at, labels: k.labels, caption: k.caption }));

    const payload: sceneApi.AskPayload = {
      question: q,
      sessionId,
      scenario,
      summary,
      frames,
      history: qa.slice(-8),
      contactSheet: sheet
        ? {
            dataUrl: sheet.dataUrl, cols: sheet.cols, rows: sheet.rows,
            count: sheet.count, width: sheet.width, height: sheet.height,
            timestamps: sheet.timestamps,
          }
        : null,
    };

    /* Append into the trailing assistant bubble that was pushed above, rather
       than adding a message per delta. */
    const appendToLast = (text: string) =>
      setQa((h) => {
        const next = [...h];
        const i = next.length - 1;
        if (i >= 0 && next[i].role === 'assistant') next[i] = { ...next[i], content: next[i].content + text };
        return next;
      });
    const replaceLast = (text: string) =>
      setQa((h) => {
        const next = [...h];
        const i = next.length - 1;
        if (i >= 0 && next[i].role === 'assistant') next[i] = { ...next[i], content: text };
        return next;
      });

    await sceneApi.askStream(payload, {
      signal: ctrl.signal,
      onInspect: setInspection,
      onDelta: appendToLast,
      onError: (msg) => replaceLast(msg),
    });

    setAsking(false);
  };

  /* Cancel an in-flight answer when the component goes away, so a slow model
     call cannot call setState on an unmounted tree. */
  useEffect(() => () => askAbort.current?.abort(), []);

  /* Q&A genuinely needs a language model — the keyframe log is the context,
     but something has to read it. Rather than a dead input labelled "analyse
     something first" (which was a lie once you had analysed something), the
     control says which of the two preconditions is missing. */
  const canAsk = keyframes.length > 0;
  const askBlockedReason = keyframes.length === 0
    ? 'Analyse a clip or camera session first'
    : '';

  const objectCounts = detections.reduce<Record<string, number>>((acc, d) => {
    acc[d.label] = (acc[d.label] ?? 0) + 1;
    return acc;
  }, {});

  /* How often each label appears across the keyframes — the chart and the
     timeline filter both read this. */
  const seenCounts = keyframes.reduce<Record<string, number>>((acc, k) => {
    for (const l of k.labels) acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {});
  const shownKeyframes = labelFilter ? keyframes.filter((k) => k.labels.includes(labelFilter)) : keyframes;
  const pendingCaptions = keyframes.filter((k) => k.pending).length;
  const captionedCount = keyframes.filter((k) => k.caption).length;
  const live = running || scanning;

  const pipeline: PipelineState = {
    source: {
      active: source !== 'idle',
      detail: source === 'webcam' ? 'Camera live' : source === 'video' ? (scanning ? `Scanning ${Math.round(progress * 100)}%` : 'Clip loaded') : viewing ? 'Saved analysis' : 'Waiting',
    },
    detect: {
      active: live,
      detail: loadPct > 0 && loadPct < 1 ? `Loading ${Math.round(loadPct * 100)}%` : ready ? `${inferMs ? inferMs.toFixed(0) + ' ms' : 'ready'} · ${backend}` : 'Not loaded',
    },
    gate: { active: live && keyframes.length > 0, detail: `${keyframes.length} keyframe${keyframes.length === 1 ? '' : 's'}` },
    caption: {
      active: pendingCaptions > 0,
      offline: serviceUp === false,
      detail: serviceUp === false ? 'Offline · local text' : `${captionedCount} captioned${engine ? ' · ' + engine.toUpperCase() : ''}`,
    },
    reason: { active: asking || summarising, detail: asking ? 'Answering…' : summarising ? 'Summarising…' : `${qa.filter((m) => m.role === 'user').length} questions` },
  };

  const TABS = [
    ['timeline', `Timeline${keyframes.length ? ` · ${keyframes.length}` : ''}`],
    ['summary', 'Summary'],
    ['ask', 'Ask'],
    ['how', 'How it works'],
  ] as const;

  const dockBtn = 'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40';

  return (
    <div className="story">
      <PageHeader back={{ to: '/project/scene', label: 'Project' }} githubUrl="https://github.com/soham10i/Real-Time-Scene-Understanding" />

      <main>
        {/* ── hero + live pipeline ─────────────────────────────────────── */}
        <section className="panel px-[var(--gutter)] pb-[clamp(28px,4vh,44px)] pt-[clamp(100px,13vh,136px)]"
          style={{ '--t1': 'rgba(34,211,238,.18)', '--t2': 'rgba(94,162,255,.14)' } as React.CSSProperties}>
          <div className="mb-[clamp(28px,4vh,44px)] flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mono mb-4 text-fg2">SceneLab · live demo</p>
              <h1 className="max-w-[14ch] text-[clamp(40px,6vw,88px)] font-medium leading-[.95] tracking-[-.05em]">
                See what the model <span className="serif text-a">sees.</span>
              </h1>
              <p className="mt-5 max-w-[56ch] text-[clamp(15px,1.2vw,17px)] leading-relaxed text-fg2">
                Point a camera or drop in a clip. YOLOv8 finds objects right here in your browser, the pipeline picks the
                frames worth describing, and you can ask questions about what happened.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="lg-pill inline-flex h-10 items-center gap-2 px-4 text-[13px]">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Frames stay on your device
              </span>
              <span className="lg-pill inline-flex h-10 items-center gap-2 px-4 text-[13px]">
                <span className="h-2 w-2 rounded-full" style={{ background: serviceUp === null ? 'var(--fg3)' : serviceUp ? '#4ade80' : '#f87171' }} />
                {serviceUp === null ? 'Checking captioner' : serviceUp ? (engine === 'blip' ? 'BLIP online' : 'VLM online') : 'Captioner offline'}
              </span>
            </div>
          </div>
          <Pipeline state={pipeline} />
        </section>

        {/* ── studio: stage + insight panel ────────────────────────────── */}
        <section className="panel px-[var(--gutter)] py-[clamp(20px,3vh,32px)]">
          {viewing && (
            <div className="lg-panel mb-3 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <p className="flex items-center gap-2 text-[14px]">
                <Database className="h-4 w-4 text-a" />
                Viewing saved analysis <strong className="font-medium">{viewing.title}</strong>
                <span className="text-fg3">· {new Date(viewing.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </p>
              <span className="mono !text-[10px] text-fg3">Text only — frames were never stored</span>
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* stage */}
            <div className="flex flex-col gap-2">
              <div
                className={'relative min-h-[340px] overflow-hidden rounded-[26px] border bg-[#05070d] transition-colors xl:min-h-[520px] ' + (dragOver ? 'border-[color:var(--a)]' : 'border-[color:var(--line)]')}
                style={{ aspectRatio: '16 / 10' }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
              >
                <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
                <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />

                {source === 'idle' && lastFrame && (
                  <img src={lastFrame} alt="Last camera frame" className="absolute inset-0 h-full w-full object-contain" />
                )}

                {source === 'idle' && !lastFrame && (
                  <div className="absolute inset-0 grid place-items-center px-8 text-center text-white">
                    {/* faint scanning grid behind the empty state */}
                    <div aria-hidden className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)', backgroundSize: '36px 36px', maskImage: 'radial-gradient(60% 60% at 50% 50%,#000,transparent)', WebkitMaskImage: 'radial-gradient(60% 60% at 50% 50%,#000,transparent)' }} />
                    <div className="relative">
                      {loadPct > 0 && loadPct < 1 ? (
                        <>
                          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-[#22d3ee]" />
                          <p className="mono mt-4 text-white/80">Loading detector · {Math.round(loadPct * 100)}%</p>
                          <p className="mt-1 text-[13px] text-white/50">13 MB, cached after the first run</p>
                        </>
                      ) : interpolating ? (
                        <>
                          <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-[#22d3ee]/30" />
                          <p className="mono mt-4 text-white/80">Upscaling to 60 fps</p>
                          <p className="mt-1 text-[13px] text-white/50">Optical-flow interpolation on the server…</p>
                        </>
                      ) : loadError ? (
                        <>
                          <p className="mono text-[#f87171]">Detector failed to load</p>
                          <p className="mt-2 text-[13px] text-white/60">{loadError}</p>
                        </>
                      ) : viewing ? (
                        <>
                          <Database className="mx-auto h-9 w-9 text-white/40" strokeWidth={1.5} />
                          <p className="mt-4 text-[17px] font-medium">Saved analysis — text only</p>
                          <p className="mt-1 text-[13px] text-white/55">The timeline, summary and Q&amp;A are on the right. Ask it something new.</p>
                        </>
                      ) : (
                        <>
                          <JarvisOrb size={64} className="mx-auto" />
                          <p className="mt-5 text-[clamp(18px,1.8vw,24px)] font-medium tracking-[-.02em]">Start a camera, or drop a clip here</p>
                          <p className="mt-1.5 text-[13.5px] text-white/55">MP4, WebM or MOV up to 4 minutes · the model downloads to you, nothing uploads</p>
                          <div className="mt-6 flex flex-wrap justify-center gap-2">
                            <button type="button" onClick={startWebcam} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-medium text-[#0d1626]">
                              <Camera className="h-4 w-4" /> Start camera
                            </button>
                            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-white/20 px-5 text-[14px] text-white/90 hover:bg-white/10">
                              <Upload className="h-4 w-4" /> Choose a clip
                              <input type="file" accept="video/*" className="sr-only" onChange={onFile} disabled={interpolating} />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {dragOver && (
                  <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-[20px] border-2 border-dashed border-[#22d3ee] bg-[#22d3ee]/10">
                    <p className="text-[17px] font-medium text-white">Drop to analyse</p>
                  </div>
                )}

                {/* HUD */}
                {ready && source !== 'idle' && (
                  <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="mono rounded-full bg-black/55 px-3 py-1.5 !text-[10px] text-white backdrop-blur-md">
                        {detections.length} object{detections.length === 1 ? '' : 's'}
                      </span>
                      {Object.entries(objectCounts).slice(0, 4).map(([k, n]) => (
                        <span key={k} className="rounded-full bg-black/55 px-3 py-1.5 text-[12px] text-white/90 backdrop-blur-md">
                          {k}{n > 1 ? ` ×${n}` : ''}
                        </span>
                      ))}
                    </div>
                    <span className="mono flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 !text-[10px] text-white/90 backdrop-blur-md">
                      {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ef4444]" />}
                      {backend} · {fps ? `${fps.toFixed(1)} fps` : '—'} · {inferMs ? `${inferMs.toFixed(0)} ms` : '—'}
                    </span>
                  </div>
                )}

                {scanning && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                    <div className="h-full bg-[#22d3ee] transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}

                {/* control dock */}
                {(source !== 'idle' || lastFrame) && (
                  <div className="absolute inset-x-0 bottom-4 flex justify-center px-3">
                    <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-white/15 bg-black/55 p-1.5 backdrop-blur-xl">
                      <button type="button" onClick={startWebcam} className={dockBtn}><Camera className="h-4 w-4" /> Camera</button>
                      <label className={dockBtn + ' cursor-pointer'}>
                        <Upload className="h-4 w-4" /> Clip
                        <input type="file" accept="video/*" className="sr-only" onChange={onFile} disabled={interpolating} />
                      </label>
                      {source !== 'idle' && (
                        <>
                          <button type="button" onClick={() => setRunning((r) => !r)} className={dockBtn}>
                            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{running ? 'Pause' : 'Resume'}
                          </button>
                          <button type="button" onClick={stopAll} className={dockBtn}><Square className="h-4 w-4" /> Stop</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* tuning row */}
              <div className="lg-panel flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
                <label className="flex items-center gap-3 text-[13px] text-fg2">
                  Confidence
                  <input type="range" min={0.15} max={0.8} step={0.05} value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="h-1 w-32 cursor-pointer appearance-none rounded-full bg-[color:var(--surf2)] accent-[color:var(--a)]" />
                  <span className="mono !text-[11px] text-fg">{threshold.toFixed(2)}</span>
                </label>
                <button type="button" onClick={() => setNarrate((n) => !n)} aria-pressed={narrate}
                  className="lg-btn">
                  <span className={'h-2 w-2 rounded-full ' + (narrate ? 'bg-[color:var(--a)]' : 'bg-[color:var(--fg3)]')} />
                  Narration {narrate ? 'on' : 'off'}
                </button>
                <label className="lg-btn cursor-pointer" title="Interpolate the clip to 60 fps on the server, then analyse it">
                  <Wand2 className="h-4 w-4" /> Upscale to 60 fps
                  <input type="file" accept="video/*" className="sr-only" onChange={onUpscaleFile} disabled={interpolating} />
                </label>
                <span className="ml-auto flex items-center gap-2">
                  {saveState === 'error' && <span className="text-[12.5px] text-[#ef4444]">{saveError}</span>}
                  <button type="button" onClick={() => void saveAnalysis()}
                    disabled={!keyframes.length || saveState === 'saving' || saveState === 'saved' || live}
                    title={live ? 'Stop or finish the analysis first' : 'Save the captions, labels, summary and Q&A — no frames'}
                    className="btn-ink !h-10 disabled:opacity-40">
                    {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : saveState === 'saved' ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    {saveState === 'saved' ? 'Saved' : 'Save analysis'}
                  </button>
                </span>
              </div>
              {notice && (
                <p className="lg-panel flex items-start gap-2 px-5 py-3 text-[13px] text-fg2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-[#f59e0b]" />{notice}
                </p>
              )}
            </div>

            {/* insight panel */}
            <aside className="lg-panel flex min-h-[520px] flex-col overflow-hidden xl:max-h-[calc(520px+64px)]">
              <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--line)] p-1.5">
                {TABS.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setActiveTab(key)}
                    className={'whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-colors ' +
                      (activeTab === key ? 'bg-[color:var(--fg)] text-[color:var(--on-fg)]' : 'text-fg2 hover:text-fg')}>
                    {label}
                  </button>
                ))}
              </div>

              {serviceUp === false && activeTab !== 'how' && (
                <p className="border-b border-[color:var(--line)] px-5 py-3 text-[12.5px] leading-relaxed text-fg3">
                  <span className="text-fg2">No language model is reachable</span>
                  {serviceReason ? ` — ${serviceReason.replace(/^no captioning engine reachable — /, '')}` : ''}. Descriptions
                  come from the detector itself (marked <span className="mono !text-[9.5px]">local</span>).
                </p>
              )}

              <div className="flex-1 overflow-y-auto" data-lenis-prevent>
                {activeTab === 'timeline' && (
                  <div className="p-4">
                    {labelFilter && (
                      <p className="mb-3 flex items-center justify-between text-[13px] text-fg2">
                        <span>Showing frames with <strong className="text-fg">{labelFilter}</strong></span>
                        <button type="button" onClick={() => setLabelFilter(null)} className="mono !text-[10px] text-p">Clear</button>
                      </p>
                    )}
                    {shownKeyframes.length === 0 ? (
                      <p className="px-2 py-12 text-center text-[13.5px] text-fg3">Keyframes appear here as the scene changes.</p>
                    ) : (
                      <ol className="relative">
                        <span aria-hidden className="absolute bottom-3 left-[39px] top-3 w-px bg-[color:var(--line)]" />
                        {shownKeyframes.map((k) => (
                          <li key={k.id} className="relative mb-3 grid grid-cols-[80px_1fr] gap-3 last:mb-0">
                            {k.thumb ? (
                              <img src={k.thumb} alt="" className="relative h-[60px] w-[80px] rounded-[12px] object-cover ring-1 ring-[color:var(--line)]" />
                            ) : (
                              <span className="relative grid h-[60px] w-[80px] place-items-center rounded-[12px] bg-[color:var(--surf2)] mono !text-[9px] text-fg3">t+{k.at.toFixed(0)}s</span>
                            )}
                            <div className="min-w-0">
                              <p className="mono !text-[9.5px] text-fg3">t+{k.at.toFixed(1)}s{k.engine && ` · ${k.engine}`}{typeof k.confidence === 'number' && ` · ${k.confidence.toFixed(2)}`}</p>
                              {k.pending ? (
                                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-fg3"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Captioning…</p>
                              ) : k.error ? (
                                <p className="mt-1 text-[13px] text-[#ef4444]">{k.error}</p>
                              ) : (
                                <p className="mt-1 text-[13.5px] leading-snug">{k.caption || '—'}</p>
                              )}
                              {k.labels.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {k.labels.map((l) => (
                                    <button key={l} type="button" onClick={() => setLabelFilter(labelFilter === l ? null : l)}
                                      className={'rounded-full border px-2 py-0.5 text-[11px] transition-colors ' + (labelFilter === l ? 'border-[color:var(--a)] text-fg' : 'border-[color:var(--line)] text-fg3 hover:text-fg')}>
                                      {l}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {activeTab === 'summary' && (
                  <div className="flex h-full flex-col p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="mono text-fg3">Whole-video account</p>
                      <button type="button" onClick={() => void summarise(keyframes)} disabled={summarising || keyframes.length === 0}
                        className="lg-btn !h-8 disabled:opacity-40">
                        {summarising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {summarising ? 'Reading…' : 'Regenerate'}
                      </button>
                    </div>
                    <textarea
                      readOnly={summarising}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder={keyframes.length === 0
                        ? 'Analyse a clip, or stop a camera session, and the whole-video description lands here.'
                        : 'Press regenerate for a description of the whole video.'}
                      className="min-h-[260px] w-full flex-1 resize-none rounded-[18px] border border-[color:var(--line)] bg-[color:var(--chip-fill)] px-4 py-3.5 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-fg3 focus:border-[color:var(--p)]"
                    />
                    {summaryError && <p className="mt-2 text-[12.5px] text-[#ef4444]">{summaryError}</p>}
                  </div>
                )}

                {activeTab === 'ask' && (
                  <div className="flex h-full flex-col">
                    <div className="flex-1 space-y-3 p-5">
                      {qa.length === 0 ? (
                        <div className="py-6 text-center">
                          <JarvisOrb size={44} className="mx-auto" />
                          <p className="mt-4 text-[15px] font-medium">Ask about this video</p>
                          <p className="mt-1 text-[13px] text-fg3">{askBlockedReason || 'e.g. “How many people appear?” or “When does the car leave?”'}</p>
                        </div>
                      ) : qa.map((m, i) => (
                        m.role === 'user' ? (
                          <div key={i} className="flex justify-end">
                            <p className="max-w-[88%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-[color:var(--fg)] px-4 py-2.5 text-[14px] leading-relaxed text-[color:var(--on-fg)]">{m.content}</p>
                          </div>
                        ) : (
                          <div key={i} className="flex gap-2.5">
                            <JarvisOrb size={20} active={asking && i === qa.length - 1} className="mt-0.5" />
                            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[14px] leading-relaxed">{m.content || (asking ? '…' : '')}</p>
                          </div>
                        )
                      ))}
                    </div>
                    <div className="p-3 pt-0">
                      <div className="composer">
                        <input
                          type="text"
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void askQuestion(); } }}
                          disabled={!canAsk}
                          placeholder={askBlockedReason || 'Ask about what happened…'}
                          className="min-h-[36px] flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg3 disabled:opacity-50"
                        />
                        <button type="button" onClick={() => void askQuestion()} disabled={asking || !canAsk || !question.trim()}
                          aria-label="Ask"
                          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[color:var(--fg)] text-[color:var(--on-fg)] disabled:opacity-30">
                          <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'how' && (
                  <div className="space-y-6 p-5 text-[14px] leading-relaxed text-fg2">
                    <div>
                      <p className="mono mb-2 text-fg3">What the model reads</p>
                      <p>The language model never watches the video. It reads a <strong className="text-fg">keyframe log</strong>: each time the scene changes enough, that frame is captioned, and the timestamped captions plus the detector's labels become a written account of the clip.</p>
                    </div>
                    <div>
                      <p className="mono mb-2 text-fg3">What is stored</p>
                      <p>During a run, everything lives in this tab. Nothing is saved unless you press <strong className="text-fg">Save analysis</strong>, and then only the text (captions, labels, timestamps, summary, scenario and Q&amp;A). Frames and video are never stored.</p>
                    </div>
                    <div>
                      <p className="mono mb-3 text-fg3">How attention picks the answer</p>
                      <ul className="space-y-3">
                        {[
                          ['Query', 'var(--p)', 'Your question: what the model is looking for, e.g. “what colour was the car?”'],
                          ['Key', 'var(--a)', 'Each keyframe caption is a key, e.g. “t+2.5s: a red car drives past.”'],
                          ['Value', 'var(--s)', 'When a key matches the query strongly, its content is pulled into the answer.'],
                        ].map(([k, c, d]) => (
                          <li key={k} className="flex gap-3">
                            <span className="mono h-fit rounded-full px-2.5 py-1 !text-[9.5px] text-fg" style={{ background: `color-mix(in oklab, ${c} 22%, transparent)` }}>{k}</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>

        {/* ── analytics + transparency ─────────────────────────────────── */}
        <section className="panel grid gap-3 px-[var(--gutter)] py-[clamp(20px,3vh,32px)] lg:grid-cols-3">
          <ObjectChart counts={seenCounts} total={keyframes.length} filter={labelFilter}
            onFilter={(l) => { setLabelFilter(l); setActiveTab('timeline'); }} />
          <ScenarioPanel value={scenario} onChange={setScenario} onCommit={commitScenario}
            maxChars={600} ephemeralNote={sessionNote} accent={accent} />
          <VlmInspector sheet={sheet} inspection={inspection} loading={sheetBusy} accent={accent} />
        </section>

        {/* ── library: this tab + database ─────────────────────────────── */}
        <section className="panel grid gap-3 px-[var(--gutter)] py-[clamp(20px,3vh,32px)] lg:grid-cols-2">
          <SessionLibrary activeId={activeVideo} onOpen={(id) => void reopen(id)} onRemove={forget} onClear={forgetAll} accent={accent} />
          <SavedAnalyses refreshKey={savedRefresh} activeId={savedId} onOpen={(id) => void openSaved(id)} />
        </section>
      </main>
    </div>
  );
}
