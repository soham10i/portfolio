/* Building the VLM request for a scene question — and being able to show it.
 *
 * ── The one-image constraint that shapes this whole design ───────────────────
 * Measured against meta/llama-3.2-11b-vision-instruct on NVIDIA NIM,
 * 2026-08-30, sending two images in one prompt returns:
 *
 *     400  "At most 1 image(s) may be provided in one prompt."
 *
 * So "send the recent frames to the VLM" cannot mean N image parts. The three
 * options were: N separate calls (N× latency and N× quota for one question),
 * text-only (the model sees nothing and can only paraphrase captions), or ONE
 * composite image. This module assumes the third: the client tiles the recent
 * keyframes into a single timestamped contact sheet and sends that.
 *
 * Verified working: a 2×2 sheet at 768×432, 36 KB, answered in 4 077 ms, and
 * the model read it as a time sequence — "the robot's position changes across
 * frames" — rather than as four unrelated pictures. The system prompt below
 * does that work, so it is load-bearing, not decoration.
 *
 * ── Why build() returns the messages instead of sending them ─────────────────
 * The UI has an inspector that shows the visitor exactly what goes to the
 * model. If the inspector reconstructed the prompt separately it would drift
 * from the real one within a week and quietly become a lie. Both the inspector
 * and the answer path call this function, so what is displayed IS what is sent.
 */

const MAX_SHEET_BYTES = 1_500_000;      // ~1.5 MB of JPEG; the sheet is normally <100 KB
const MAX_LOG_FRAMES = 60;
const MAX_QUESTION_CHARS = 600;

/* One line per frame: when, what the detector found, what the captioner said.
   The detector labels are included because they are ground truth from a
   separate model — the VLM is told to trust them over its own impression. */
function renderLog(frames, max = MAX_LOG_FRAMES, capChars = 220) {
  return frames.slice(0, max).map((f) => {
    const t = Number(f?.t);
    const at = Number.isFinite(t) ? `t+${t.toFixed(1)}s` : 't+?';
    const labels = Array.isArray(f?.labels) ? f.labels.slice(0, 10).join(', ') : '';
    const cap = typeof f?.caption === 'string' ? f.caption.slice(0, capChars) : '';
    return `${at} | objects: ${labels || 'none'} | ${cap || '(no caption)'}`;
  }).join('\n');
}

function systemPrompt({ scenario, sheet, summary }) {
  const parts = [];

  parts.push(
    'You answer questions about ONE video using two sources: a contact sheet '
    + 'image and a text keyframe log. Both describe the same clip.',
  );

  if (sheet) {
    parts.push(
      `The image is a CONTACT SHEET — a ${sheet.cols}×${sheet.rows} grid of `
      + `${sheet.count} keyframes from that video in chronological order, left to `
      + 'right then top to bottom, each stamped with its timestamp in the '
      + 'top-left corner. Read it as a TIME SEQUENCE, not as separate pictures: '
      + 'what persists across cells is a stable part of the scene, what appears '
      + 'or disappears is an event.',
    );
  } else {
    parts.push('No image is available for this question — answer from the log alone, and say so if the log cannot support an answer.');
  }

  /* The visitor's stated scenario. Measured to change the answer materially:
     with "I am looking for my keys in the living room" the model replied
     "look at the objects on the coffee table and the floor near it" instead of
     a generic description. It goes in the system role so a later user turn
     cannot casually override it, and it is quoted so the model treats it as
     the user's words rather than as an instruction to itself. */
  if (scenario) {
    parts.push(
      `The person watching has stated their situation and goal, in their own words:\n"""\n${scenario}\n"""\n`
      + 'Interpret everything you see through that goal. Prioritise what is '
      + 'relevant to it, and say plainly when the footage does not contain what '
      + 'they are looking for.',
    );
  }

  if (summary) parts.push(`A previously generated summary of the clip:\n${summary}`);

  parts.push(
    'Rules. Ground every claim in the sheet or the log; cite timestamps where '
    + 'they help. The object detector recognises a fixed set of common classes '
    + 'and genuinely cannot see everything, so absence from the labels is not '
    + 'evidence of absence from the scene — say "I cannot tell from this" rather '
    + 'than guessing. Answer in two or three sentences unless asked for more.',
  );

  return parts.join('\n\n');
}

/* Build the exact messages array sent to the model.
 *
 * Returns { messages, inspect } where `inspect` is a UI-safe description of the
 * same request: no base64, but the byte size, the grid shape, the frame
 * timestamps, the rendered log and the full system prompt text. */
function build({ question, scenario = '', frames = [], summary = '', history = [], sheet = null }) {
  const q = String(question || '').slice(0, MAX_QUESTION_CHARS);
  const log = renderLog(frames);
  const system = systemPrompt({ scenario, sheet, summary });

  const turns = (Array.isArray(history) ? history : []).slice(-8).map((h) => ({
    role: h?.role === 'assistant' ? 'assistant' : 'user',
    content: String(h?.content ?? '').slice(0, 1200),
  }));

  const userText = `Keyframe log for the clip:\n${log || '(empty)'}\n\nQuestion: ${q}`;

  /* The image goes in the final user turn, not the system turn: every provider
     accepts it there, and several reject image parts in a system message. */
  const finalUser = sheet
    ? {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: sheet.dataUrl } },
        ],
      }
    : { role: 'user', content: userText };

  const messages = [{ role: 'system', content: system }, ...turns, finalUser];

  return {
    messages,
    inspect: {
      systemPrompt: system,
      userText,
      historyTurns: turns.length,
      log,
      logFrames: frames.slice(0, MAX_LOG_FRAMES).map((f) => ({ t: f.t, labels: f.labels, caption: f.caption })),
      image: sheet
        ? {
            present: true,
            cols: sheet.cols,
            rows: sheet.rows,
            frameCount: sheet.count,
            timestamps: sheet.timestamps || [],
            bytes: sheet.bytes,
            width: sheet.width,
            height: sheet.height,
          }
        : { present: false },
      /* Rough, and labelled rough. ~4 chars per token for prose; an image on
         these models bills around 1 token per 28×28 patch. Shown so a visitor
         can see why a big sheet is slow, not for billing. */
      approxTokens: Math.round((system.length + userText.length) / 4)
        + (sheet ? Math.round((sheet.width * sheet.height) / 784) : 0),
    },
  };
}

/* Validate an incoming contact sheet and turn it into the shape build() wants.
   Returns { sheet } or { error }. */
function parseSheet(raw) {
  if (raw == null) return { sheet: null };
  const { dataUrl, cols, rows, count, width, height, timestamps } = raw;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { error: 'contactSheet.dataUrl must be a data:image/... URI' };
  }
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > MAX_SHEET_BYTES) {
    return { error: `Contact sheet is ${(bytes / 1e6).toFixed(1)} MB — downscale it before sending (limit ${MAX_SHEET_BYTES / 1e6} MB).` };
  }
  return {
    sheet: {
      dataUrl,
      bytes,
      cols: Number(cols) || 1,
      rows: Number(rows) || 1,
      count: Number(count) || 1,
      width: Number(width) || 0,
      height: Number(height) || 0,
      timestamps: Array.isArray(timestamps) ? timestamps.slice(0, 24) : [],
    },
  };
}

module.exports = { build, parseSheet, renderLog, MAX_SHEET_BYTES };
