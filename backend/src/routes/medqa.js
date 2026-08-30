/* MedQA — retrieval-augmented answering over a local medical corpus.
 *
 *   GET  /api/medqa/status    index health and readiness
 *   GET  /api/medqa/sample    a random question, to seed the demo UI
 *   POST /api/medqa/ask       a question plus multiple-choice options
 *   POST /api/medqa/followup  a follow-up turn inside one session
 *
 * The index and its embedding model are loaded lazily on the first request
 * rather than at boot. That is not laziness for its own sake: the embedder is
 * the largest allocation in this process, and a free-tier instance should not
 * spend it — or the cold-start seconds — on visitors who never open this demo.
 * A single in-flight promise guards the load so a burst of concurrent first
 * requests warms it once instead of N times.
 */
const express = require('express');
const config = require('../config');
const { loadIndex, getStatus, ask, followUp, randomRecord } = require('../services/medqaRag');

const router = express.Router();

const DISABLED = {
  error: 'The MedQA demo is switched off on this deployment (MEDQA_ENABLED=false). '
       + 'It loads an embedding model that does not fit comfortably in a 512 MB instance.',
};

let warming = null;
function ensureWarm() {
  if (!warming) {
    warming = loadIndex().catch((err) => { warming = null; throw err; });
  }
  return warming;
}

/* Every route below needs the index; this turns "not ready" into one honest
   503 with a reason rather than five different stack traces. */
router.use(async (req, res, next) => {
  if (!config.medqa.enabled) return res.status(503).json(DISABLED);
  try {
    await ensureWarm();
    next();
  } catch (err) {
    console.error('[MedQA] index load failed:', err.message);
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

router.get('/status', (req, res) => res.json({ status: 'ok', ...getStatus() }));

router.get('/sample', (req, res) => {
  const sample = randomRecord();
  if (!sample) return res.status(503).json({ error: 'Index is empty.' });
  res.json({ sample });
});

router.post('/ask', async (req, res) => {
  const { question, options, topK = 5, doNli = true } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }
  if (!options || typeof options !== 'object') {
    return res.status(400).json({ error: 'options object is required' });
  }
  try {
    res.json(await ask({ question, options, topK, doNli }));
  } catch (err) {
    console.error('[MedQA /ask]', err);
    res.status(500).json({ error: 'MedQA failed to answer. Try again.' });
  }
});

router.post('/followup', async (req, res) => {
  const { sessionId, question, topK = 5 } = req.body || {};
  if (!sessionId || !question) {
    return res.status(400).json({ error: 'sessionId and question are required' });
  }
  try {
    res.json(await followUp({ sessionId, question, topK }));
  } catch (err) {
    console.error('[MedQA /followup]', err);
    res.status(500).json({ error: 'MedQA failed to answer. Try again.' });
  }
});

module.exports = router;
