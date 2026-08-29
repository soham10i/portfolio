/* MedQA RAG API routes
 * POST /api/medqa/ask       — ask a medical question with options
 * POST /api/medqa/followup  — follow-up question in a conversation
 * GET  /api/medqa/status    — index health / readiness
 * GET  /api/medqa/sample    — get a random sample question for the demo
 */
const express = require('express');
const { loadIndex, getStatus, ask, followUp } = require('../services/medqaRag');

const router = express.Router();

/* Warm the index on first request (lazy) */
let warmed = false;
async function ensureWarm() {
  if (!warmed) {
    await loadIndex();
    warmed = true;
  }
}

router.get('/status', async (req, res) => {
  try {
    await ensureWarm();
    res.json({ status: 'ok', ...getStatus() });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

router.get('/sample', async (req, res) => {
  try {
    await ensureWarm();
    const fs = require('fs');
    const path = require('path');
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'medqa-index.json'), 'utf-8'));
    const r = idx.records[Math.floor(Math.random() * idx.records.length)];
    res.json({ sample: r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ask', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    await ensureWarm();
    const { question, options, topK = 5, doNli = true } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }
    if (!options || typeof options !== 'object') {
      return res.status(400).json({ error: 'options object is required' });
    }
    const result = await ask({ question, options, topK, doNli });
    res.json(result);
  } catch (err) {
    console.error('[MedQA /ask]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/followup', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    await ensureWarm();
    const { sessionId, question, topK = 5 } = req.body;
    if (!sessionId || !question) {
      return res.status(400).json({ error: 'sessionId and question are required' });
    }
    const result = await followUp({ sessionId, question, topK });
    res.json(result);
  } catch (err) {
    console.error('[MedQA /followup]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
