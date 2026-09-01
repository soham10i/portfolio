import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Camera, Github, Pause, Play, Sparkles, Square, Upload,
} from 'lucide-react';
import { SceneDetector, frameDelta, type Detection } from '@/features/scene-lab/lib/yolo';
import { probeVideo, seekTo, waitForFrame } from '@/features/scene-lab/lib/videoProbe';
import * as session from '@/features/scene-lab/lib/videoSession';
import SessionLibrary from '@/features/scene-lab/components/SessionLibrary';
import { describeFrame, summariseLog } from '@/features/scene-lab/lib/localNarrator';
import { PALETTES, applyPalette, readStoredPalette, type PaletteKey } from '@/shared/lib/palettes';

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
  const [palette] = useState<PaletteKey>(readStoredPalette);
  useEffect(() => { applyPalette(palette); }, [palette]);
  const accent = PALETTES[palette].a;

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
  const [activeTab, setActiveTab] = useState<'live' | 'context'>('live');
  const [interpolating, setInterpolating] = useState(false);

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

  const startWebcam = async () => {
    setNotice(null);
    setLastFrame(null);
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
    if (!file) return;
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

  const askQuestion = async () => {
    const q = question.trim();
    const captioned = keyframes.filter((k) => k.caption);
    if (!q || asking || captioned.length === 0) return;
    setQuestion('');
    setQa((h) => [...h, { role: 'user', content: q }]);
    setAsking(true);
    try {
      const r = await fetch(`${API_BASE}/scene/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          summary,
          history: qa.slice(-8),
          frames: [...captioned].reverse().map((k) => ({ t: k.at, caption: k.caption, labels: k.labels })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      setQa((h) => [...h, {
        role: 'assistant',
        content: r.ok && d.answer ? d.answer : (d.error || `HTTP ${r.status}`),
      }]);
    } catch {
      setQa((h) => [...h, { role: 'assistant', content: 'Network error.' }]);
    } finally {
      setAsking(false);
    }
  };

  /* Q&A genuinely needs a language model — the keyframe log is the context,
     but something has to read it. Rather than a dead input labelled "analyse
     something first" (which was a lie once you had analysed something), the
     control says which of the two preconditions is missing. */
  const canAsk = keyframes.length > 0 && serviceUp === true;
  const askBlockedReason = keyframes.length === 0
    ? 'Analyse a clip or camera session first'
    : serviceUp !== true
      ? 'Needs a language model — none is reachable right now'
      : '';

  const objectCounts = detections.reduce<Record<string, number>>((acc, d) => {
    acc[d.label] = (acc[d.label] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:h-[60px] sm:flex-nowrap sm:px-[22px] sm:py-0">
        <div className="flex items-center gap-4">
          <Link to="/project/scene" className="inline-flex items-center gap-1.5 text-[13px] text-fg2 transition-colors hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" />Project
          </Link>
          <span className="hidden h-5 w-px bg-surf2 sm:block" />
          <div>
            <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-fg">Scene understanding — live</p>
            <p className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg3 sm:block">
              YOLOV8N IN-BROWSER · ONNX RUNTIME · BLIP CAPTIONS
            </p>
          </div>
        </div>
        <a href="https://github.com/soham10i/Real-Time-Scene-Understanding" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-fg2 transition-colors hover:text-fg">
          <Github className="h-3.5 w-3.5" />Source
        </a>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 py-8">
        {/* Privacy statement first — it is the strongest thing about the design */}
        <div className="glass-panel mb-5 flex flex-wrap items-center gap-3 rounded-[12px] px-4 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          <p className="text-[12.5px] leading-relaxed text-fg2">
            Detection runs <strong className="font-semibold text-fg">entirely in your browser</strong> — camera and
            video frames never leave this device. Only sampled keyframes are sent for captioning, and only while
            narration is on.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {/* ── viewer ────────────────────────────────────────────────── */}
          <section className="glass-card flex flex-col rounded-[18px] resize-y overflow-hidden min-h-[50vh]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={startWebcam}
                  className="inline-flex items-center gap-1.5 rounded-[9px] border border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--a)_25%,transparent)]">
                  <Camera className="h-3 w-3" />Camera
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
                  <Upload className="h-3 w-3" />Video ≤4 min
                  <input type="file" accept="video/*" className="sr-only" onChange={onFile} disabled={interpolating} />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--a)_25%,transparent)]">
                  <Sparkles className="h-3 w-3" />AI 60fps
                  <input type="file" accept="video/*" className="sr-only" onChange={onUpscaleFile} disabled={interpolating} />
                </label>
                {source !== 'idle' && (
                  <>
                    <button type="button" onClick={() => setRunning((r) => !r)}
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
                      {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {running ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" onClick={stopAll}
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg">
                      <Square className="h-3 w-3" />Stop
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.1em] text-fg3">
                <span>{backend}</span>
                <span>{fps ? `${fps.toFixed(1)} fps` : '—'}</span>
                <span>{inferMs ? `${inferMs.toFixed(0)} ms` : '—'}</span>
              </div>
            </div>

            <div className="relative flex-grow w-full bg-canvas min-h-[300px]">
              <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
              <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />

              {source === 'idle' && lastFrame && (
                <img src={lastFrame} alt="Last camera frame" className="absolute inset-0 h-full w-full object-contain" />
              )}
              {source === 'idle' && !lastFrame && (
                <div className="absolute inset-0 grid place-items-center px-8 text-center">
                  <div>
                    {loadPct > 0 && loadPct < 1 ? (
                      <>
                        <div className="mx-auto h-[34px] w-[34px] animate-spin rounded-full border-2 border-line border-t-a" />
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-fg2">
                          Loading detector · {Math.round(loadPct * 100)}%
                        </p>
                        <p className="mt-1 text-[11.5px] text-fg3">13 MB, cached after the first run</p>
                      </>
                    ) : interpolating ? (
                      <>
                        <div className="mx-auto h-[34px] w-[34px] animate-pulse rounded-full border-2 border-line bg-a/20" />
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-fg2">
                          Upscaling to 60fps
                        </p>
                        <p className="mt-1 text-[11.5px] text-fg3">Processing video on the backend...</p>
                      </>
                    ) : loadError ? (
                      <>
                        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#f87171]">Detector failed to load</p>
                        <p className="mt-2 text-[12.5px] text-fg3">{loadError}</p>
                      </>
                    ) : (
                      <>
                        <Sparkles className="mx-auto h-7 w-7 text-fg3" strokeWidth={1.5} />
                        <p className="mt-3 text-[13.5px] text-fg2">Pick a camera or drop in a clip to start</p>
                        <p className="mt-1 text-[12px] text-fg3">Nothing uploads — the model downloads to you instead</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {scanning && (
                <div className="absolute inset-x-0 bottom-0">
                  <div className="h-[3px] w-full bg-surf2">
                    <div className="h-full transition-[width] duration-200"
                      style={{ width: `${Math.round(progress * 100)}%`, background: accent }} />
                  </div>
                  <p className="glass-panel m-3 inline-block rounded-[9px] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg2">
                    Scanning clip · {Math.round(progress * 100)}%
                  </p>
                </div>
              )}

              {ready && source !== 'idle' && (
                <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
                  <span className="glass-panel rounded-[9px] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg2">
                    {detections.length} object{detections.length === 1 ? '' : 's'}
                  </span>
                  {Object.entries(objectCounts).slice(0, 4).map(([k, n]) => (
                    <span key={k} className="glass-panel rounded-[9px] px-2.5 py-1.5 font-mono text-[10px] text-fg2">
                      {k}{n > 1 ? ` ×${n}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3">
              <label className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg3">
                Confidence
                <input type="range" min={0.15} max={0.8} step={0.05} value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="twin-scrub h-1 w-28 cursor-pointer appearance-none rounded-full bg-surf2 accent-a" />
                <span className="font-mono text-[11px] text-fg2">{threshold.toFixed(2)}</span>
              </label>
              <button type="button" onClick={() => setNarrate((n) => !n)}
                className={'inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ' +
                  (narrate ? 'border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] text-fg' : 'border-line text-fg3')}>
                <span className={'h-1.5 w-1.5 rounded-full ' + (narrate ? 'bg-a' : 'bg-fg3')} />
                Narration
              </button>
              {notice && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[#fbbf24]">
                  <AlertCircle className="h-3.5 w-3.5" />{notice}
                </span>
              )}
            </div>
          </section>

          <aside className="glass-card flex flex-col overflow-hidden rounded-[18px]">
            <div className="flex items-center justify-between border-b border-line px-2 py-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('live')}
                  className={`rounded-[10px] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                    activeTab === 'live' ? 'bg-[color-mix(in_oklab,var(--a)_15%,transparent)] text-fg' : 'text-fg3 hover:text-fg2'
                  }`}
                >
                  Live Analysis
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('context')}
                  className={`rounded-[10px] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                    activeTab === 'context' ? 'bg-[color-mix(in_oklab,var(--a)_15%,transparent)] text-fg' : 'text-fg3 hover:text-fg2'
                  }`}
                >
                  Context & QKV
                </button>
              </div>
              <span className="inline-flex items-center gap-1.5 pr-2 font-mono text-[9.5px] uppercase tracking-[0.1em]"
                style={{ color: serviceUp === false ? 'var(--fg3)' : accent }}>
                <span className="h-1.5 w-1.5 rounded-full"
                  style={{ background: serviceUp === null ? 'var(--fg3)' : serviceUp ? '#4ade80' : '#f87171' }} />
                {serviceUp === null
                  ? 'checking'
                  : !serviceUp
                    ? 'detector only'
                    : engine === 'blip' ? 'BLIP online' : 'VLM online'}
              </span>
            </div>

            {activeTab === 'context' ? (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg">What Context is Used?</h3>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-fg2">
                      When you ask a question about the video, the LLM cannot actually "see" the video directly. Instead, it reads a <strong className="font-semibold text-fg">keyframe log</strong>. 
                      Every time the scene changes significantly, the image is passed to a Vision-Language Model (VLM) which generates a detailed caption. 
                      These captions, along with their timestamps, are compiled into a chronological story of the video.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg">How is it Stored?</h3>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-fg2">
                      The context is completely <strong className="font-semibold text-fg">ephemeral</strong>. It exists only in the memory of this browser tab (React state). 
                      When you ask a question, the entire keyframe log is serialized into a JSON array and sent to the backend. It is never persisted to a database, ensuring complete privacy.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg">How QKV (Attention) Generates Answers</h3>
                    <div className="mt-3 rounded-[12px] border border-line bg-surf2 p-4">
                      <p className="text-[12.5px] leading-relaxed text-fg2 mb-3">
                        When the language model receives your question and the keyframe log, it uses the <strong>Self-Attention mechanism</strong> (Query-Key-Value):
                      </p>
                      <ul className="space-y-3 text-[12.5px] leading-relaxed text-fg2">
                        <li>
                          <span className="inline-block rounded-[6px] bg-[color-mix(in_oklab,var(--p)_20%,transparent)] px-1.5 py-0.5 font-mono text-[10.5px] text-fg">Query (Q)</span>
                          <br />Represents what the model is looking for right now. In this case, your question (e.g., <em>"What color was the car?"</em>).
                        </li>
                        <li>
                          <span className="inline-block rounded-[6px] bg-[color-mix(in_oklab,var(--a)_20%,transparent)] px-1.5 py-0.5 font-mono text-[10.5px] text-fg">Key (K)</span>
                          <br />Represents the "labels" on all the information it holds. Each keyframe caption acts as a Key (e.g., <em>"t+2.5s: A red car drives past."</em>).
                        </li>
                        <li>
                          <span className="inline-block rounded-[6px] bg-[color-mix(in_oklab,var(--s)_20%,transparent)] px-1.5 py-0.5 font-mono text-[10.5px] text-fg">Value (V)</span>
                          <br />The actual content to be extracted. If a Key strongly matches the Query (high attention score), the model pulls the corresponding Value to construct your answer.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
            {serviceUp === false && (
              <p className="border-b border-line px-4 py-3 text-[12px] leading-relaxed text-fg3">
                <span className="text-fg2">No language model is reachable</span>
                {serviceReason ? ` — ${serviceReason.replace(/^no captioning engine reachable — /, '')}` : ''}.
                {' '}Descriptions below are written from the detector's own output instead, so the demo still
                works; they are marked <span className="font-mono text-[10px] uppercase tracking-[0.1em]">local</span>.
                Follow-up questions need a language model and stay disabled.
              </p>
            )}
            {serviceUp && engine === 'vlm' && (
              <p className="border-b border-line px-4 py-3 text-[12px] leading-relaxed text-fg3">
                Captions are coming from the self-hosted vision-language model — the project's own BLIP service is not reachable.
                Set <code className="font-mono text-fg2">SCENE_API_BASE</code> on the backend to use it instead.
              </p>
            )}

            {/* Overall description of the whole clip or session */}
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-fg3">Overall summary</p>
                <button
                  type="button"
                  onClick={() => void summarise(keyframes)}
                  disabled={summarising || keyframes.length === 0}
                  className="rounded-[8px] border border-line px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg disabled:opacity-40"
                >
                  {summarising ? 'reading…' : 'regenerate'}
                </button>
              </div>
              <textarea
                readOnly={summarising}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={7}
                placeholder={
                  keyframes.length === 0
                    ? 'Analyse a clip, or stop a camera session, and the whole-video description lands here.'
                    : 'Press regenerate for a description of the whole video.'
                }
                className="mt-2 w-full resize-y rounded-[10px] border border-line bg-surf2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg2 outline-none placeholder:text-fg3 focus:border-p"
              />
              {summaryError && <p className="mt-1 text-[12px] text-[#f87171]">{summaryError}</p>}
            </div>

            {/* Session-scoped Q&A over the keyframe log */}
            <div className="border-b border-line px-4 py-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-fg3">Ask about this video</p>
              <p className="mt-1 text-[11px] leading-relaxed text-fg3">
                Context lives in this tab only — it is gone on reload and never stored on the server.
                {!canAsk && askBlockedReason && <span className="mt-1 block text-fg3">{askBlockedReason}</span>}
              </p>

              {qa.length > 0 && (
                <div className="mt-2.5 max-h-[220px] space-y-2 overflow-y-auto">
                  {qa.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                      <span
                        className="inline-block max-w-[92%] break-words whitespace-pre-wrap rounded-[10px] px-2.5 py-1.5 text-left text-[12px] leading-snug"
                        style={m.role === 'user'
                          ? { background: 'color-mix(in oklab,var(--p) 20%,transparent)', color: 'var(--fg)' }
                          : { background: 'var(--surf2)', color: 'var(--fg2)' }}
                      >
                        {m.content}
                      </span>
                    </div>
                  ))}
                  {asking && <p className="font-mono text-[11px] text-fg3">thinking…</p>}
                </div>
              )}

              <div className="mt-2.5 flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void askQuestion(); } }}
                  disabled={!canAsk}
                  placeholder={askBlockedReason || 'e.g. how many people appear?'}
                  className="flex-1 rounded-[10px] border border-line bg-surf2 px-3 py-2 text-[12.5px] text-fg outline-none placeholder:text-fg3 focus:border-p disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void askQuestion()}
                  disabled={asking || !canAsk || !question.trim()}
                  className="rounded-[10px] border border-[color-mix(in_oklab,var(--a)_45%,transparent)] bg-[color-mix(in_oklab,var(--a)_15%,transparent)] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg transition-colors disabled:opacity-40"
                >
                  Ask
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
              {keyframes.length === 0 && (
                <p className="px-1 py-6 text-center text-[12.5px] text-fg3">
                  Keyframes appear here when the scene changes.
                </p>
              )}
              {keyframes.map((k) => (
                <div key={k.id} className="glass-panel flex gap-3 rounded-[12px] p-2.5">
                  <img src={k.thumb} alt="" className="h-[54px] w-[72px] flex-none rounded-[7px] object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg3">
                      t+{k.at.toFixed(1)}s · {k.labels.join(', ') || 'no objects'}
                    </p>
                    {k.pending ? (
                      <p className="mt-1 font-mono text-[11px] text-fg3">captioning…</p>
                    ) : k.error ? (
                      <p className="mt-1 text-[11.5px] leading-snug text-[#f87171]">{k.error}</p>
                    ) : (
                      <p className="mt-1 text-[12.5px] leading-snug text-fg2">
                        {k.caption || '—'}
                        {typeof k.confidence === 'number' && (
                          <span className="ml-1.5 font-mono text-[10px] text-fg3">{k.confidence.toFixed(2)}</span>
                        )}
                        {k.engine && (
                          <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-fg3">
                            {k.engine}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>
            )}
          </aside>
        </div>

        {/* What this tab is holding, and how to let go of it. */}
        <div className="mt-4">
          <SessionLibrary
            activeId={activeVideo}
            onOpen={(id) => void reopen(id)}
            onRemove={forget}
            onClear={forgetAll}
            accent={accent}
          />
        </div>
      </main>
    </div>
  );
}
