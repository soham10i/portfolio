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

/* In-memory LRU cache for synthesized audio chunks — drops repeat latency to 0ms. */
const ttsCache = new Map();
const MAX_CACHE = 80;

/**
 * Voice module text preprocessor: translates URLs, markdown links, code blocks,
 * and mathematical equations into fluent, spoken English before sending to ElevenLabs.
 */
function cleanForTTS(text) {
  let s = String(text || '').trim();

  // Strip code blocks completely
  s = s.replace(/```[\s\S]*?```/g, ' (code block omitted) ');

  // Soham's primary profiles & repositories
  s = s.replace(/https?:\/\/github\.com\/soham10i\/stf[-_]hw\b/gi, "Soham's Smart Tabletop Factory repository on GitHub");
  s = s.replace(/github\.com\/soham10i\/stf[-_]hw\b/gi, "Soham's Smart Tabletop Factory repository on GitHub");
  s = s.replace(/https?:\/\/github\.com\/soham10i\b/gi, "Soham's GitHub profile");
  s = s.replace(/github\.com\/soham10i\b/gi, "Soham's GitHub profile");
  s = s.replace(/https?:\/\/([a-z0-9.-]+\.)?linkedin\.com\/in\/soham-patel-10i\/?/gi, "Soham's LinkedIn profile");
  s = s.replace(/linkedin\.com\/in\/soham-patel-10i\/?/gi, "Soham's LinkedIn profile");
  s = s.replace(/soham\.patel\.2201@gmail\.com/gi, "Soham's email address");

  // Markdown links [Label](url) -> speak label (unless label is a URL)
  s = s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_match, label) => {
    if (/https?:\/\/|github\.com|linkedin\.com/i.test(label)) {
      return 'the link';
    }
    return label;
  });

  // Generic URLs
  s = s.replace(/https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/gi, 'the $2 repository on GitHub');
  s = s.replace(/https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/gi, '$1 on GitHub');
  s = s.replace(/https?:\/\/[^\s]+/gi, 'the link');

  // Math equations & LaTeX formatting
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
  s = s.replace(/\^2\b/g, ' squared ');
  s = s.replace(/\^3\b/g, ' cubed ');
  s = s.replace(/\^([a-zA-Z0-9]+)/g, ' to the power of $1 ');
  s = s.replace(/_([a-zA-Z0-9]+)/g, ' sub $1 ');

  // Units, abbreviations and technical terms
  s = s.replace(/\b1\.2\s*mm\s*RMS\b/gi, '1.2 millimeters R M S');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*mm\b/gi, '$1 millimeters');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*cm\b/gi, '$1 centimeters');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*m\b(?!\w)/gi, '$1 meters');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*Hz\b/gi, '$1 Hertz');
  s = s.replace(/\bRMSE\b/g, 'R M S E');
  s = s.replace(/\bA\*(?!\w)/g, 'A star');
  s = s.replace(/\bYOLOv8\b/gi, 'YOLO version 8');
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
  s = s.replace(/\bCI\/CD\b/gi, 'C I C D');

  // Strip remaining markdown formatting symbols
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  s = s.replace(/[*_~|]/g, ' ');
  s = s.replace(/[[\]()]/g, ' ');
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

/* Lets the frontend pick its speaker once per session instead of discovering
   a 503 mid-sentence. */
router.get('/status', (req, res) => {
  res.json({ ready: config.tts.ready });
});

router.post('/', limit, async (req, res) => {
  if (!config.tts.ready) return res.status(503).json({ error: NOT_CONFIGURED });
  const rawText = String(req.body?.text || '').trim();
  if (!rawText) return res.status(400).json({ error: 'Text is required' });

  const text = cleanForTTS(rawText);
  if (!text) return res.status(400).json({ error: 'No speakable text' });
  if (text.length > config.tts.maxChars) {
    return res.status(400).json({ error: `Text too long (max ${config.tts.maxChars} characters)` });
  }

  // 1. Check in-memory audio cache for 0ms repeat latency
  if (ttsCache.has(text)) {
    const cached = ttsCache.get(text);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': cached.length,
      'Cache-Control': 'public, max-age=86400',
    });
    return res.end(cached);
  }

  try {
    // 2. Call ElevenLabs streaming endpoint with optimize_streaming_latency=3
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.tts.voiceId}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`,
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

    // 3. Pipe stream immediately for minimal TTFB while accumulating chunks for cache
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    const chunks = [];
    const stream = Readable.fromWeb(upstream.body);
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      const fullBuffer = Buffer.concat(chunks);
      if (ttsCache.size >= MAX_CACHE) {
        const firstKey = ttsCache.keys().next().value;
        ttsCache.delete(firstKey);
      }
      ttsCache.set(text, fullBuffer);
    });
    stream.pipe(res);
  } catch (err) {
    console.error('TTS error:', err.message || err);
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'The voice service timed out.' : 'Internal server error',
    });
  }
});

module.exports = router;
