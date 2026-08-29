/* In-memory fixed-window rate limiting.
 *
 * One process, one map — which is the right size for this deployment. If it
 * ever runs on more than one instance, this becomes per-instance and needs
 * Redis; that is a deliberate, documented limit, not an oversight.
 *
 * IMPORTANT: this keys on req.ip, which behind Fly/Render is only the real
 * client when `trust proxy` is set on the app. Without it every visitor shares
 * one bucket and a single caller can lock out the whole site. */
function createLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) if (b.resetAt < now) buckets.delete(ip);
  }, windowMs);
  timer.unref();

  return function limit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(ip, b); }
    b.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - b.count)));
    if (b.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = { createLimiter };
