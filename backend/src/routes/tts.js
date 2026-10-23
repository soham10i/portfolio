/* JARVIS's voice — server-side text-to-speech through ElevenLabs.
 *
 * POST /api/tts { text } → audio/mpeg. This exists because the browser's own
 * speechSynthesis is inconsistent: some platforms ship no voices at all, and
 * the robotic default sits badly next to the rest of the site. The browser
 * voice remains the fallback — unconfigured (503) or a failed call, and the
 * frontend reads the reply aloud locally instead.
 *
 * ElevenLabs charges per character, so text is capped and the route sits on
 * the tightest rate limit of any endpoint here. */
const express = require('express');
const { Readable } = require('stream');
const config = require('../config');
const { createLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const limit = createLimiter({
  ...config.limits.tts,
  message: 'Voice is taking a breather — the reply above is still readable.',
});

const NOT_CONFIGURED = 'Text-to-speech is not configured on this deployment.';

/* Lets the frontend pick its speaker once per session instead of discovering
   a 503 mid-sentence. */
router.get('/status', (req, res) => {
  res.json({ ready: config.tts.ready });
});

router.post('/', limit, async (req, res) => {
  if (!config.tts.ready) return res.status(503).json({ error: NOT_CONFIGURED });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text is required' });
  if (text.length > config.tts.maxChars) {
    return res.status(400).json({ error: `Text too long (max ${config.tts.maxChars} characters)` });
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.tts.voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': config.tts.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: config.tts.model }),
        signal: AbortSignal.timeout(config.tts.timeoutMs),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.text().catch(() => '');
      console.error('ElevenLabs error:', upstream.status, err.slice(0, 200));
      // 502 tells the frontend to fall back to the browser voice for the rest.
      return res.status(502).json({ error: 'The voice service did not answer.' });
    }

    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('TTS error:', err.message || err);
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'The voice service timed out.' : 'Internal server error',
    });
  }
});

module.exports = router;
