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
const { callLLMWithFallback, extractText, extractDelta, reachableVision } = require('../services/llm');
const sessions = require('../services/sceneSession');
const sceneStore = require('../services/sceneStore');
const prompt = require('../services/scenePrompt');
const multer = require('multer');

/* Bounded on purpose: the previous config accepted a file of any size into
   /tmp on an instance with an ephemeral disk and no cleanup on the error
   path, which is a slow disk-fill waiting to happen. */
const upload = multer({ dest: '/tmp/', limits: { fileSize: 80 * 1024 * 1024, files: 1 } });
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

/* ── Scenario session ───────────────────────────────────────────────────────
 *
 * GET  /api/scene/session?id=…   read (or mint) the scenario state
 * PUT  /api/scene/session        set the scenario text and the keyframe log
 *
 * TEXT ONLY. The store never receives an image; `sanitiseFrames` in
 * sceneSession.js strips the client's `thumb` data URIs rather than trusting
 * them not to arrive. The page's privacy claim — camera pixels do not leave
 * the device except as transient captioning requests — has to survive this
 * endpoint existing, so the boundary is enforced in code, not in a comment.
 *
 * State is in-memory with a 30-minute idle TTL. A deploy or a free-instance
 * spin-down loses it. That is reported to the client as `ephemeral: true`
 * rather than left to be discovered. */
router.get('/session', (req, res) => {
  const { id, session } = sessions.resolve(req.query.id);
  res.json(sessions.toPublic(id, session));
});

router.put('/session', (req, res) => {
  const { sessionId, scenario, frames, summary } = req.body || {};
  if (scenario !== undefined && typeof scenario !== 'string') {
    return res.status(400).json({ error: 'scenario must be a string' });
  }
  if (typeof scenario === 'string' && scenario.length > sessions.MAX_SCENARIO_CHARS) {
    return res.status(400).json({ error: `scenario is too long (max ${sessions.MAX_SCENARIO_CHARS} characters)` });
  }
  const { id, session } = sessions.update(sessionId, { scenario, frames, summary });
  res.json(sessions.toPublic(id, session));
});


/* Assemble the request for a scene question.
 *
 * Shared by /inspect, /ask and /ask/stream so that what the inspector shows a
 * visitor IS what the model receives. Reconstructing the prompt separately for
 * display would drift from the real one and quietly become a lie. */
function assemble(req) {
  const { question, frames, summary, history, contactSheet, sessionId, scenario } = req.body || {};

  if (typeof question !== 'string' || !question.trim()) {
    return { error: 'Expected { question }', status: 400 };
  }

  /* Server-held session state is the default source of truth; the explicit
     body fields override it, so the endpoint still works statelessly for a
     client that never called /session. */
  const stored = sessions.get(sessionId);
  const useFrames = Array.isArray(frames) && frames.length ? frames : (stored?.frames || []);
  const useScenario = typeof scenario === 'string' ? scenario : (stored?.scenario || '');
  const useSummary = typeof summary === 'string' ? summary : (stored?.summary || '');
  const useHistory = Array.isArray(history) && history.length ? history : (stored?.turns || []);

  if (!useFrames.length) {
    return { error: 'No scene context — analyse a clip or camera session first.', status: 400 };
  }

  const { sheet, error } = prompt.parseSheet(contactSheet);
  if (error) return { error, status: 400 };

  const built = prompt.build({
    question, scenario: useScenario, frames: useFrames,
    summary: useSummary, history: useHistory, sheet,
  });

  return { ...built, question, sessionId, hasSheet: !!sheet };
}


/* Exactly what would be sent to the model, without spending a call on it.
 *
 * This is what powers the "what the VLM sees" panel. It is a real endpoint and
 * not a client-side approximation precisely so it cannot disagree with the
 * answer path. */
router.post('/inspect', limit, (req, res) => {
  const a = assemble(req);
  if (a.error) return res.status(a.status).json({ error: a.error });
  res.json({
    ...a.inspect,
    model: config.llm.visionReady && a.hasSheet ? config.llm.visionModel : config.llm.model,
    provider: config.llm.visionReady && a.hasSheet ? config.llm.visionProvider : config.llm.provider,
    /* Stated rather than implied: no hosted VLM behind an OpenAI-compatible
       endpoint returns attention maps, so the honest transparency story is
       "here is the exact input", not a heatmap that would be invented. */
    attentionAvailable: false,
    note: 'This is the literal request payload. Hosted vision models expose no attention weights over the OpenAI-compatible API, so grounding is shown as the exact frames, detector labels and prompt text that were sent.',
  });
});


/* Ask a question about the clip.
 *
 * A contact sheet, when supplied, routes this to the VISION model — one image
 * containing many frames, because meta/llama-3.2-11b-vision-instruct returns
 * 400 "At most 1 image(s) may be provided in one prompt". Without a sheet the
 * question goes to the text model against the keyframe log alone, which is
 * cheaper and still useful. */
function targetModel(hasSheet) {
  return hasSheet && config.llm.visionReady
    ? { model: config.llm.visionModel, baseUrl: config.llm.visionBaseUrl, apiKey: config.llm.visionApiKey }
    : { model: config.llm.model, baseUrl: config.llm.baseUrl, apiKey: config.llm.apiKey };
}

router.post('/ask', limit, async (req, res) => {
  if (!config.llm.ready && !config.llm.visionReady) {
    return res.status(503).json({ error: 'Q&A needs a model configured on the backend (LLM_PROVIDER or LLM_API_BASE).' });
  }
  const a = assemble(req);
  if (a.error) return res.status(a.status).json({ error: a.error });

  try {
    const r = await callLLMWithFallback({
      messages: a.messages,
      maxTokens: 700,
      temperature: 0.3,
      timeoutMs: config.scene.timeoutMs,
      ...targetModel(a.hasSheet),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: `Q&A returned ${r.status}`, detail: detail.slice(0, 300) });
    }
    const { text: answer } = extractText(await r.json());
    if (!answer) return res.status(502).json({ error: 'The model returned an empty answer. Try rephrasing?' });

    if (a.sessionId) {
      sessions.addTurn(a.sessionId, 'user', a.question);
      sessions.addTurn(a.sessionId, 'assistant', answer);
    }
    res.json({ answer, inspect: a.inspect });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'The model took too long — try a smaller contact sheet.' : 'Q&A failed.',
    });
  }
});


/* Streaming variant. A contact-sheet question takes about four seconds on the
   11B vision model; streaming turns that from a spinner into visible progress,
   which is the difference between "slow" and "broken" to someone watching. */
router.post('/ask/stream', limit, async (req, res) => {
  if (!config.llm.ready && !config.llm.visionReady) {
    return res.status(503).json({ error: 'Q&A needs a model configured on the backend.' });
  }
  const a = assemble(req);
  if (a.error) return res.status(a.status).json({ error: a.error });

  try {
    const upstream = await callLLMWithFallback({
      messages: a.messages,
      maxTokens: 700,
      temperature: 0.3,
      stream: true,
      timeoutMs: config.scene.timeoutMs,
      ...targetModel(a.hasSheet),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      return res.status(502).json({ error: `Q&A returned ${upstream.status}`, detail: detail.slice(0, 300) });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    /* The inspection payload goes out first, so the panel can render what was
       sent while the answer is still generating. */
    send({ inspect: a.inspect });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const text = extractDelta(JSON.parse(payload));
          if (text) { answer += text; send({ delta: text }); }
        } catch { /* partial JSON across a chunk boundary */ }
      }
    }

    if (!answer) send({ error: 'The model returned an empty answer. Try rephrasing?' });
    else if (a.sessionId) {
      sessions.addTurn(a.sessionId, 'user', a.question);
      sessions.addTurn(a.sessionId, 'assistant', answer);
    }
    send({ done: true });
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      res.status(timedOut ? 504 : 500).json({ error: timedOut ? 'The model took too long.' : 'Q&A failed.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted — try again.' })}\n\n`);
      res.end();
    }
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

/* ── Saved analyses (opt-in, text only — services/sceneStore.js) ────────── */
const savedLimit = createLimiter({ windowMs: 5 * 60 * 1000, max: 120, message: 'Too many save requests — try again in a few minutes.' });

const reply = (res, r) => (r.error ? res.status(r.status).json({ error: r.error }) : r.body ? res.status(r.status).json(r.body) : res.status(r.status).end());
const guard = (fn) => async (req, res) => {
  try { reply(res, await fn(req)); }
  catch (err) {
    console.error('scene store:', err.message || err);
    res.status(500).json({ error: 'Could not reach the session store' });
  }
};

router.post('/saved', savedLimit, guard((req) => sceneStore.save(req.body)));
router.get('/saved', savedLimit, guard((req) => sceneStore.list(String(req.query.client || ''))));
router.get('/saved/:id', savedLimit, guard((req) => sceneStore.load(req.params.id, String(req.query.client || ''))));
router.delete('/saved/:id', savedLimit, guard((req) => sceneStore.remove(req.params.id, String(req.query.client || ''))));

module.exports = router;
