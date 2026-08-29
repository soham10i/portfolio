/* Contact form → an append-only JSONL mailbox on disk. */
const express = require('express');
const fs = require('fs');
const config = require('../config');
const { createLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const limit = createLimiter({ ...config.limits.chat, message: 'Too many messages — try again shortly.' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', limit, (req, res) => {
  const { name, email, message } = req.body || {};
  if (
    !name || typeof name !== 'string' || name.length > 200 ||
    !email || typeof email !== 'string' || email.length > 200 || !EMAIL_RE.test(email) ||
    !message || typeof message !== 'string' || !message.trim() || message.length > 5000
  ) {
    return res.status(400).json({ error: 'Please fill in a valid name, email, and message.' });
  }
  try {
    /* Cap the mailbox. The rate limiter alone still allows roughly 8,600
       messages a day per IP, which over time is a disk-exhaustion path on a
       512 MB instance. Past the cap the form fails closed and says so. */
    const size = fs.existsSync(config.contact.file) ? fs.statSync(config.contact.file).size : 0;
    if (size > config.contact.maxFileBytes) {
      console.warn('Contact mailbox is full:', size, 'bytes');
      return res.status(507).json({ error: 'The message store is full — please email directly.' });
    }
    const entry = JSON.stringify({
      name: name.trim(), email: email.trim(), message: message.trim(), at: new Date().toISOString(),
    });
    fs.appendFileSync(config.contact.file, entry + '\n');
    res.json({ ok: true });
  } catch (err) {
    console.error('Contact save error:', err.message || err);
    res.status(500).json({ error: 'Could not save your message — please email directly.' });
  }
});

module.exports = router;
