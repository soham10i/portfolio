import type { Detection } from '@/features/scene-lab/lib/yolo';

/* Descriptions built from the detector alone, with no language model.
 *
 * When the captioning service is down, the page used to throw the detections
 * away and show an em-dash: detection was working perfectly, and the visitor
 * saw nothing. But YOLO already knows what is in the frame, where it is, how
 * big it is and how confident it is — that is enough for a factual sentence.
 * It reads more plainly than a captioner's prose, and it is never wrong about
 * an object it did not see, because it only ever states what was detected.
 *
 * These are labelled `local` in the UI so nothing is misattributed to a model
 * that did not run. */

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const say = (n: number) => (n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n));

function plural(label: string, n: number) {
  if (n === 1) return label;
  if (/(s|x|z|ch|sh)$/.test(label)) return `${label}es`;
  if (/y$/.test(label) && !/[aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
  if (label === 'person') return 'people';
  if (label === 'mouse') return 'mice';
  return `${label}s`;
}

/** Nine-cell position name for a box centre. */
function whereIs(d: Detection, w: number, h: number) {
  const cx = (d.box[0] + d.box[2]) / 2 / w;
  const cy = (d.box[1] + d.box[3]) / 2 / h;
  const col = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  const row = cy < 0.34 ? 'upper' : cy > 0.66 ? 'lower' : '';
  if (!row) return col === 'centre' ? 'in the middle of the frame' : `on the ${col}`;
  return col === 'centre' ? `${row} centre` : `${row} ${col}`;
}

/** Fraction of the frame a box covers. */
const coverage = (d: Detection, w: number, h: number) =>
  ((d.box[2] - d.box[0]) * (d.box[3] - d.box[1])) / (w * h);

/**
 * One sentence for one frame, from detections only.
 * Returns null when there is nothing to say — the caller shows the
 * "no objects" state rather than a sentence claiming emptiness as a finding.
 */
export function describeFrame(found: Detection[], w: number, h: number): string | null {
  if (!found.length || !w || !h) return null;

  const byClass = new Map<string, Detection[]>();
  for (const d of found) {
    const list = byClass.get(d.label);
    if (list) list.push(d); else byClass.set(d.label, [d]);
  }

  // Most prominent first: biggest on screen, not merely most confident
  const groups = [...byClass.entries()]
    .map(([label, ds]) => ({
      label,
      ds,
      area: Math.max(...ds.map((d) => coverage(d, w, h))),
      best: ds.reduce((a, b) => (b.score > a.score ? b : a)),
    }))
    .sort((a, b) => b.area - a.area);

  const phrases = groups.slice(0, 4).map((g) =>
    g.ds.length === 1 ? `one ${g.label}` : `${say(g.ds.length)} ${plural(g.label, g.ds.length)}`);

  const listed = phrases.length === 1
    ? phrases[0]
    : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;

  const lead = groups[0];
  const pos = whereIs(lead.best, w, h);
  const pct = Math.round(lead.area * 100);
  const extra = groups.length > 4 ? `, plus ${groups.length - 4} other object type${groups.length - 4 === 1 ? '' : 's'}` : '';

  const size = pct >= 45 ? 'dominating the frame'
    : pct >= 18 ? 'large in frame'
      : pct >= 4 ? '' : 'small in frame';

  const tail = size ? `, ${size}` : '';
  return `Detected ${listed}${extra}. The ${lead.label} is ${pos}${tail} (confidence ${lead.best.score.toFixed(2)}).`;
}

export interface LogFrame { t: number; labels: string[]; caption?: string }

/**
 * A whole-clip account built from the keyframe log, again with no model.
 * Reports what was recognised, when each thing first and last appeared, where
 * the busiest moment was, and where the composition changed.
 */
export function summariseLog(frames: LogFrame[]): string {
  if (!frames.length) return 'Nothing was analysed.';

  const ordered = [...frames].sort((a, b) => a.t - b.t);
  const span = ordered[ordered.length - 1].t - ordered[0].t;

  // first seen / last seen / how many frames, per class
  const seen = new Map<string, { first: number; last: number; frames: number }>();
  for (const f of ordered) {
    for (const l of new Set(f.labels)) {
      const e = seen.get(l);
      if (e) { e.last = f.t; e.frames += 1; } else { seen.set(l, { first: f.t, last: f.t, frames: 1 }); }
    }
  }

  const withObjects = ordered.filter((f) => f.labels.length > 0);
  const empty = ordered.length - withObjects.length;

  if (!seen.size) {
    return `${ordered.length} keyframes were sampled across ${span.toFixed(1)} seconds, and the detector `
      + 'recognised nothing in any of them. That is a real result, not a failure: this model knows only the '
      + '80 everyday COCO classes, so rendered or synthetic footage — a simulator view, a screen recording, a '
      + 'diagram — usually contains nothing it was trained to name.';
  }

  const ranked = [...seen.entries()].sort((a, b) => b[1].frames - a[1].frames);
  const busiest = ordered.reduce((a, b) => (b.labels.length > a.labels.length ? b : a));

  // moments where the set of visible classes changed
  const changes: string[] = [];
  for (let i = 1; i < ordered.length && changes.length < 4; i++) {
    const prev = new Set(ordered[i - 1].labels);
    const now = new Set(ordered[i].labels);
    const gained = [...now].filter((l) => !prev.has(l));
    const lost = [...prev].filter((l) => !now.has(l));
    if (gained.length) changes.push(`t+${ordered[i].t.toFixed(1)}s — ${gained.join(', ')} appears`);
    else if (lost.length) changes.push(`t+${ordered[i].t.toFixed(1)}s — ${lost.join(', ')} leaves the frame`);
  }

  const top = ranked.slice(0, 5)
    .map(([l, e]) => `${l} (${e.frames}/${ordered.length} frames, t+${e.first.toFixed(1)}s to t+${e.last.toFixed(1)}s)`)
    .join('; ');

  const lines = [
    `Across ${ordered.length} keyframes spanning ${span.toFixed(1)} seconds, the detector recognised `
    + `${ranked.length} object type${ranked.length === 1 ? '' : 's'}: ${top}.`,
    `The busiest frame is t+${busiest.t.toFixed(1)}s with ${busiest.labels.length} object`
    + `${busiest.labels.length === 1 ? '' : 's'} visible`
    + (empty ? `, and ${empty} keyframe${empty === 1 ? ' has' : 's have'} no recognised objects at all.` : '.'),
    '',
    'This description is assembled from detector output only — no language model was involved, '
    + 'so it states what was detected and nothing beyond it.',
  ];

  if (changes.length) {
    lines.splice(2, 0, '', 'Changes:', ...changes.map((c) => `• ${c}`));
  }

  return lines.join('\n');
}
