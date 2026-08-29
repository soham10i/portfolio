const crypto = require('crypto');
const config = require('../config');

/* Compare by SHA-256 digest, not by padded bytes.
 *
 * The previous version padded both sides to 64 characters before
 * timingSafeEqual, which silently ignored everything after the 64th character
 * of a longer token. Hashing first gives two equal-length buffers whatever the
 * input length, so the constant-time compare is both correct and total. */
function tokenMatches(sent) {
  const expected = config.notes.adminToken;
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(sent || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!config.notes.adminToken) {
    return res.status(503).json({ error: 'Editing is disabled — no ADMIN_TOKEN is set on this deployment.' });
  }
  if (!tokenMatches(req.get('x-admin-token'))) {
    return res.status(401).json({ error: 'Bad admin token.' });
  }
  next();
}

module.exports = { requireAdmin, tokenMatches };
