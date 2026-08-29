/* Study notes: read for everyone, write for whoever holds ADMIN_TOKEN. */
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const store = require('../services/notesStore');
const { createLimiter } = require('../middleware/rateLimit');
const { requireAdmin, tokenMatches } = require('../middleware/adminAuth');

const router = express.Router();
const limit = createLimiter({ ...config.limits.chat, message: 'Too many requests — try again shortly.' });

function validDraft(req, res) {
  const { title, body } = req.body || {};
  if (!title || typeof title !== 'string' || title.length > 200) {
    res.status(400).json({ error: 'A title is required (max 200 characters).' });
    return false;
  }
  if (typeof body !== 'string' || !body.trim()) {
    res.status(400).json({ error: 'The note body is empty.' });
    return false;
  }
  if (Buffer.byteLength(body, 'utf8') > config.notes.maxBytes) {
    res.status(413).json({ error: `Note too large (max ${config.notes.maxBytes / 1000} kB).` });
    return false;
  }
  return true;
}

/* Does this browser hold a usable token? Lets the UI decide whether to offer
   the editor at all, without the client ever learning the token's value. */
router.post('/auth', limit, (req, res) => {
  if (!config.notes.adminToken) {
    return res.json({ ok: false, editing: false, reason: 'no ADMIN_TOKEN set on this deployment' });
  }
  res.json({ ok: tokenMatches(req.body?.token), editing: true });
});

// Metadata only, so the index stays small however long the notes get.
router.get('/', (req, res) => {
  try {
    res.json({ notes: store.list(), editable: !!config.notes.adminToken });
  } catch (err) {
    console.error('Notes list error:', err.message || err);
    res.status(500).json({ error: 'Could not read the notes directory.' });
  }
});

router.get('/:slug', (req, res) => {
  const { slug } = req.params;
  if (!store.SLUG_RE.test(slug)) return res.status(400).json({ error: 'Bad slug.' });
  const note = store.read(slug);
  if (!note) return res.status(404).json({ error: 'No note with that slug.' });
  res.json(note);
});

router.post('/', requireAdmin, (req, res) => {
  const { slug } = req.body || {};
  if (!store.SLUG_RE.test(String(slug || ''))) {
    return res.status(400).json({ error: 'Slug must be lowercase letters, digits and hyphens (2–64 chars).' });
  }
  if (!validDraft(req, res)) return;
  if (store.exists(slug)) return res.status(409).json({ error: 'A note with that slug already exists.' });
  try {
    store.write(slug, req.body);
    res.status(201).json(store.read(slug));
  } catch (err) {
    console.error('Note create error:', err.message || err);
    res.status(500).json({ error: 'Could not write the note.' });
  }
});

router.put('/:slug', requireAdmin, (req, res) => {
  const { slug } = req.params;
  if (!store.SLUG_RE.test(slug)) return res.status(400).json({ error: 'Bad slug.' });
  if (!store.exists(slug)) return res.status(404).json({ error: 'No note with that slug.' });
  if (!validDraft(req, res)) return;
  try {
    store.write(slug, { ...req.body, updated: new Date().toISOString() });
    res.json(store.read(slug));
  } catch (err) {
    console.error('Note update error:', err.message || err);
    res.status(500).json({ error: 'Could not write the note.' });
  }
});

router.delete('/:slug', requireAdmin, (req, res) => {
  const { slug } = req.params;
  if (!store.SLUG_RE.test(slug)) return res.status(400).json({ error: 'Bad slug.' });
  if (!store.exists(slug)) return res.status(404).json({ error: 'No note with that slug.' });
  try {
    store.remove(slug);
    res.json({ ok: true });
  } catch (err) {
    console.error('Note delete error:', err.message || err);
    res.status(500).json({ error: 'Could not delete the note.' });
  }
});

module.exports = router;
