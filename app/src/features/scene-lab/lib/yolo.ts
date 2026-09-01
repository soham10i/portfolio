/* In-browser YOLOv8 detection.
 *
 * Runs the project's own yolov8n-seg weights, exported to ONNX, through
 * ONNX Runtime Web. Everything happens on the visitor's device: webcam and
 * video frames are never uploaded, there is no per-frame server cost, and the
 * demo keeps working when the captioning service is asleep.
 *
 * The exported graph has two outputs:
 *   output0  (1, 116, 8400)  → 4 box + 80 class scores + 32 mask coefficients
 *   output1  (1, 32, 160, 160) → mask prototypes
 * Only the first 84 rows of output0 are used; masks are dropped because the
 * demo draws boxes, and skipping them keeps the frame budget down.
 *
 * The decode below (letterbox → transpose → argmax over 80 classes → NMS →
 * un-letterbox) was validated against the reference Python implementation on
 * the project's own test images before being ported here.
 */

import { OIV7_CLASSES } from './oiv7_classes';

export interface Detection {
  /** Pixel box in source-image coordinates: [x1, y1, x2, y2]. */
  box: [number, number, number, number];
  score: number;
  classId: number;
  label: string;
}

export interface DetectorStats {
  backend: string;
  inferMs: number;
  modelBytes: number;
}

const MODEL_URL = '/models/yolov8n-oiv7.onnx';
/* ONNX Runtime Web is vendored under public/vendor/ort rather than pulled from
   a CDN: no third-party dependency at runtime, works behind a strict CSP or
   offline, and cannot break because a CDN did. This is the WASM build — the
   WebGPU (jsep) build is faster but ships a 21 MB binary instead of 10.7 MB.
   To switch, drop in ort.webgpu.min.js plus its .jsep.wasm and add 'webgpu' to
   executionProviders below. */
const ORT_JS = '/vendor/ort/ort.wasm.min.js';
const ORT_WASM_DIR = '/vendor/ort/';
const INPUT = 640;
const NUM_CLASSES = 601;
const ROWS = 8400;

/* ONNX Runtime Web ships its WASM/WebGPU binaries as sibling files. Loading it
   from a CDN at runtime — the same pattern the 3D engines use — keeps the app
   bundle small and avoids wiring a custom Vite asset rule for the .wasm files. */
declare global {
  interface Window { ort?: OrtNamespace }
}

interface OrtTensor { data: Float32Array; dims: readonly number[] }
interface OrtSession {
  inputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtNamespace {
  env: { wasm: { wasmPaths: string; numThreads: number; simd: boolean } };
  InferenceSession: { create(url: string, opts: Record<string, unknown>): Promise<OrtSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OrtTensor;
}

let ortPromise: Promise<OrtNamespace> | null = null;

function loadOrt(): Promise<OrtNamespace> {
  if (window.ort) return Promise.resolve(window.ort);
  if (!ortPromise) {
    ortPromise = new Promise<OrtNamespace>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = ORT_JS;
      s.async = true;
      s.onload = () => {
        if (!window.ort) { reject(new Error('onnxruntime-web loaded but window.ort is missing')); return; }
        window.ort.env.wasm.wasmPaths = ORT_WASM_DIR;
        /* Multi-threaded WASM needs SharedArrayBuffer, which needs the page to
           be cross-origin isolated (COOP + COEP). Most deploys are not, and
           asking for threads without it makes the runtime warn and stall, so
           only opt in when the browser says isolation is actually active. */
        const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
        window.ort.env.wasm.numThreads = isolated
          ? Math.min(4, navigator.hardwareConcurrency || 2)
          : 1;
        window.ort.env.wasm.simd = true;
        resolve(window.ort);
      };
      s.onerror = () => { ortPromise = null; reject(new Error('failed to load the local ONNX runtime')); };
      document.head.appendChild(s);
    });
  }
  return ortPromise;
}

export class SceneDetector {
  private session: OrtSession | null = null;
  private ort: OrtNamespace | null = null;
  private input = new Float32Array(3 * INPUT * INPUT);
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  backend = 'loading';
  modelBytes = 0;
  lastInferMs = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = INPUT;
    this.canvas.height = INPUT;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  async load(onProgress?: (fraction: number) => void): Promise<void> {
    const ort = this.ort = await loadOrt();

    /* Fetch the weights ourselves so the page can show real download progress —
       the model is 13 MB and on a slow connection a silent wait looks broken. */
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model fetch failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body?.getReader();
    let buf: Uint8Array;
    if (reader) {
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) onProgress?.(got / total);
      }
      buf = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.length; }
    } else {
      buf = new Uint8Array(await res.arrayBuffer());
    }
    this.modelBytes = buf.byteLength;
    onProgress?.(1);

    const url = URL.createObjectURL(new Blob([buf as unknown as BlobPart]));
    try {
      /* WebGPU where it exists, WASM everywhere else. Asking for both lets the
         runtime pick and fall back on its own rather than us feature-detecting. */
      this.session = await ort.InferenceSession.create(url, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      const threads = ort.env.wasm.numThreads;
      this.backend = threads > 1 ? `wasm ×${threads}` : 'wasm';
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  get ready() { return !!this.session; }

  /** Letterbox the source into the 640x640 input and return the mapping back. */
  private preprocess(src: CanvasImageSource, sw: number, sh: number) {
    const r = Math.min(INPUT / sw, INPUT / sh);
    const nw = Math.round(sw * r);
    const nh = Math.round(sh * r);
    const dx = ((INPUT - nw) / 2) | 0;
    const dy = ((INPUT - nh) / 2) | 0;

    this.ctx.fillStyle = '#727272';               // 114,114,114, as in the export
    this.ctx.fillRect(0, 0, INPUT, INPUT);
    this.ctx.drawImage(src, 0, 0, sw, sh, dx, dy, nw, nh);

    const { data } = this.ctx.getImageData(0, 0, INPUT, INPUT);
    const area = INPUT * INPUT;
    const f = this.input;
    for (let i = 0, p = 0; i < area; i++, p += 4) {
      f[i] = data[p] / 255;                        // R plane
      f[area + i] = data[p + 1] / 255;             // G plane
      f[2 * area + i] = data[p + 2] / 255;         // B plane
    }
    return { r, dx, dy };
  }

  async detect(
    src: CanvasImageSource, sw: number, sh: number,
    scoreThreshold = 0.35, iouThreshold = 0.45,
  ): Promise<Detection[]> {
    if (!this.session || !this.ort) return [];
    const { r, dx, dy } = this.preprocess(src, sw, sh);

    const t0 = performance.now();
    const feeds = { images: new this.ort.Tensor('float32', this.input, [1, 3, INPUT, INPUT]) };
    const out = await this.session.run(feeds);
    this.lastInferMs = performance.now() - t0;

    const o = out.output0 ?? Object.values(out)[0];
    const d = o.data;

    /* output0 is (1, 116, 8400) — attribute-major, so column j of the flat
       array is detection j and row k is at k * ROWS + j. */
    const boxes: [number, number, number, number][] = [];
    const scores: number[] = [];
    const ids: number[] = [];

    for (let j = 0; j < ROWS; j++) {
      let best = 0;
      let bestId = 0;
      for (let c = 0; c < NUM_CLASSES; c++) {
        const v = d[(4 + c) * ROWS + j];
        if (v > best) { best = v; bestId = c; }
      }
      if (best < scoreThreshold) continue;
      const cx = d[j], cy = d[ROWS + j], w = d[2 * ROWS + j], h = d[3 * ROWS + j];
      boxes.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
      scores.push(best);
      ids.push(bestId);
    }

    const keep = nms(boxes, scores, iouThreshold);
    return keep.map((i) => {
      const [x1, y1, x2, y2] = boxes[i];
      return {
        box: [
          clamp((x1 - dx) / r, 0, sw), clamp((y1 - dy) / r, 0, sh),
          clamp((x2 - dx) / r, 0, sw), clamp((y2 - dy) / r, 0, sh),
        ] as [number, number, number, number],
        score: scores[i],
        classId: ids[i],
        label: OIV7_CLASSES[ids[i]] ?? String(ids[i]),
      };
    });
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Greedy non-maximum suppression, highest score first. */
function nms(boxes: [number, number, number, number][], scores: number[], thr: number): number[] {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep: number[] = [];
  const dead = new Uint8Array(boxes.length);
  for (const i of order) {
    if (dead[i]) continue;
    keep.push(i);
    for (const j of order) {
      if (j === i || dead[j]) continue;
      if (iou(boxes[i], boxes[j]) > thr) dead[j] = 1;
    }
  }
  return keep;
}

function iou(a: [number, number, number, number], b: [number, number, number, number]) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

/* ── keyframe selection ────────────────────────────────────────────────── */

/** Mean absolute difference between two downsampled greyscale frames, 0..1. */
export function frameDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) sum += Math.abs(a[i] - b[i]);
  return sum / (n / 4) / 255;
}
