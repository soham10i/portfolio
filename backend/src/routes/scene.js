/* Real-time scene understanding — the server half.
 *
 * Detection runs entirely in the visitor's browser (YOLOv8n-seg on ONNX
 * Runtime Web), so camera and video frames never leave their device. Only
 * sampled keyframes come here, and only while narration is switched on. This
 * proxy exists so the page never talks to the captioning service directly:
 * same origin means no CORS, the service URL and credentials stay server-side,
 * and an expensive route gets its own tighter budget. */
const express = require('express');
const config = require('../config');
const { createLimiter } = require('../middleware/rateLimit');
const { caption, blipHealth } = require('../services/captioner');
const { callLLMWithFallback, extractText, reachableVision } = require('../services/llm');
const multer = require('multer');

const upload = multer({ dest: '/tmp/' });
const router = express.Router();
const limit = createLimiter({
  ...config.limits.scene,
  message: `Frame budget reached (${config.limits.scene.max} per 5 minutes). Detection keeps running locally — only narration is paused.`,
});

router.get('/status', async (req, res) => {
  const vlm = await reachableVision();
  const blip = await blipHealth();

  if (blip.up) return res.json({ available: true, engine: 'blip', blip: true, vlm, upstream: blip.upstream });

  const reason = config.scene.baseUrl
    ? `BLIP service ${blip.reason}${vlm ? ' — falling back to the vision model' : ''}`
    : vlm
      ? 'BLIP service not configured — captioning with the self-hosted vision model'
      : config.llm.visionReady
        ? `no captioning engine reachable — nothing is answering at ${config.llm.visionBaseUrl}`
        : 'no captioning engine configured';

  res.json({ available: vlm, engine: vlm ? 'vlm' : null, blip: false, vlm, reason });
});

router.post('/describe', limit, async (req, res) => {
  const { image, labels } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Expected { image: "data:image/jpeg;base64,..." }' });
  }

  let bytes;
  try {
    bytes = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  } catch {
    return res.status(400).json({ error: 'Malformed base64 image' });
  }
  if (bytes.length > config.scene.maxImageBytes) {
    return res.status(413).json({ error: 'Frame too large — downscale before sending.' });
  }

  const safeLabels = Array.isArray(labels)
    ? labels.filter((l) => typeof l === 'string').slice(0, 12)
    : [];

  const result = await caption(bytes, safeLabels);
  if (!result) {
    return res.status(503).json({ error: 'No captioning engine is available right now. Detection is unaffected.' });
  }
  res.json(result);
});

/* Turn the keyframe log into one chronological line per frame. Text in, text
   out for both routes below — no images, so they are cheap and fast. */
function renderLog(frames, max, capChars) {
  return frames.slice(0, max).map((f) => {
    const t = Number(f?.t);
    const at = Number.isFinite(t) ? `t+${t.toFixed(1)}s` : 't+?';
    const labels = Array.isArray(f?.labels) ? f.labels.slice(0, 10).join(', ') : '';
    const cap = typeof f?.caption === 'string' ? f.caption.slice(0, capChars) : '';
    return `${at} | objects: ${labels || 'none'} | ${cap}`;
  }).join('\n');
}

/* Per-frame captions are independent and read like a list of stills. This
   folds them into one account of what happened over the clip — the part a
   viewer actually reads. */
router.post('/summarise', limit, async (req, res) => {
  if (!config.llm.ready) {
    return res.status(503).json({ error: 'Summarisation needs a language model configured on the backend (LLM_API_BASE).' });
  }
  const { frames } = req.body || {};
  if (!Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'Expected { frames: [{ t, caption, labels }] }' });
  }

  const log = renderLog(frames, 40, 240).slice(0, 6000);
  const messages = [
    {
      role: 'system',
      content: 'You summarise a video from its keyframe log. Ground every statement in the log. Never invent objects or events that are not in it.',
    },
    {
      role: 'user',
      content:
        'Below is a chronological log of keyframes from one video: timestamp, ' +
        'objects a detector found, and a caption for that frame.\n\n' + log +
        '\n\nWrite a short account of the scene, grounded strictly in this log:\n' +
        '1) Two or three sentences describing the setting and what takes place over time.\n' +
        '2) Then a line "Changes:" followed by up to four short bullet points marking ' +
        'moments where the scene meaningfully changed, each prefixed with its timestamp.\n' +
        'If the log is too sparse to say much, say so plainly in one sentence.',
    },
  ];

  try {
    const r = await callLLMWithFallback({ messages, maxTokens: 700, temperature: 0.3, timeoutMs: config.scene.timeoutMs });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: `Summariser returned ${r.status}`, detail: detail.slice(0, 200) });
    }
    const { text } = extractText(await r.json());
    if (!text) return res.status(502).json({ error: 'Summariser returned an empty response.' });
    res.json({ summary: text, framesUsed: Math.min(frames.length, 40) });
  } catch {
    res.status(504).json({ error: 'Summariser timed out.' });
  }
});

/* Ask a question about a session's video.
 *
 * The "memory" is deliberately client-held and session-scoped: the browser
 * keeps the keyframe log and prior turns and sends them with each question.
 * Nothing about a visitor's camera or clip is stored on the server — which is
 * the same privacy claim the rest of the page makes, and it means no cleanup
 * job, no retention policy and no per-user state to leak. */
router.post('/ask', limit, async (req, res) => {
  if (!config.llm.ready) {
    return res.status(503).json({ error: 'Q&A needs a language model configured on the backend (LLM_API_BASE).' });
  }
  const { question, frames, summary, history } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Expected { question }' });
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'No scene context — analyse a clip or camera session first.' });
  }

  const log = renderLog(frames, 60, 220).slice(0, 9000);
  const turns = (Array.isArray(history) ? history : []).slice(-8).map((h) => ({
    role: h?.role === 'assistant' ? 'assistant' : 'user',
    content: String(h?.content ?? '').slice(0, 1200),
  }));

  const system =
    'You answer questions about ONE video, using only the keyframe log below. ' +
    'The log is the complete record: timestamp, objects a detector found, and a ' +
    'caption for that moment.\n\n' +
    (summary ? `Overall summary:\n${String(summary).slice(0, 2000)}\n\n` : '') +
    `Keyframe log:\n${log}\n\n` +
    'Rules: answer in two or three sentences. Cite timestamps when they help. ' +
    'If the log does not contain the answer, say so plainly rather than guessing — ' +
    'the detector only recognises 80 common object classes, so it genuinely ' +
    'cannot see everything.';

  try {
    const r = await callLLMWithFallback({
      messages: [{ role: 'system', content: system }, ...turns, { role: 'user', content: question.slice(0, 600) }],
      maxTokens: 500,
      temperature: 0.3,
      timeoutMs: config.scene.timeoutMs,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: `Q&A returned ${r.status}`, detail: detail.slice(0, 200) });
    }
    const { text: answer } = extractText(await r.json());
    if (!answer) return res.status(502).json({ error: 'Empty answer.' });
    res.json({ answer });
  } catch {
    res.status(504).json({ error: 'Q&A timed out.' });
  }
});

router.post('/interpolate', upload.single('file'), async (req, res) => {
  if (!config.scene.baseUrl) {
    return res.status(503).json({ error: 'Backend API is not configured (missing SCENE_API_BASE)' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    const fs = require('fs');
    const form = new FormData();
    // Wrap file in a Blob for fetch
    const fileBytes = fs.readFileSync(req.file.path);
    form.append('file', new Blob([fileBytes], { type: req.file.mimetype }), req.file.originalname);
    
    // Clean up tmp file
    fs.unlinkSync(req.file.path);

    const r = await fetch(`${config.scene.baseUrl}/interpolate`, {
      method: 'POST',
      body: form,
    });
    
    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: `Interpolation failed: ${errText}` });
    }

    res.set('Content-Type', r.headers.get('content-type') || 'video/mp4');
    // Pipe the response stream back to the client
    const Readable = require('stream').Readable;
    if (r.body) {
      Readable.fromWeb(r.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    res.status(500).json({ error: `Interpolation proxy error: ${error.message}` });
  }
});

module.exports = router;
