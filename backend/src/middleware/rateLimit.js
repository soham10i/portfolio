/* In-memory fixed-window rate limiting.
 *
 * One process, one map — which is the right size for this deployment. If it
 * ever runs on more than one instance, this becomes per-instance and needs
 * Redis; that is a deliberate, documented limit, not an oversight. */

/* Cloudflare's published edge ranges (https://www.cloudflare.com/ips). The
 * site is served through the Cloudflare proxy, so a proxied request's direct
 * peer is always one of these. The list changes rarely; it is checked into
 * code rather than fetched per boot so a cold start never depends on an
 * external call. If Cloudflare adds ranges and buckets look wrong, refresh it
 * from the URL above. */
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CLOUDFLARE_V6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

function ipToBigInt(ip) {
  if (ip.includes(':')) {
    const groups = ip.split('::');
    const head = groups[0] ? groups[0].split(':') : [];
    const tail = groups[1] ? groups[1].split(':') : [];
    const fill = 8 - head.length - tail.length;
    const parts = [...head, ...Array(fill).fill('0'), ...tail].map((g) => parseInt(g || '0', 16));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, n) => (acc << 16n) + BigInt(n), 0n);
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => n > 255 || Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => (acc << 8n) + BigInt(n), 0n);
}

function inCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = BigInt(Number(bitsStr));
  const ipNum = ipToBigInt(ip);
  const baseNum = ipToBigInt(base);
  if (ipNum === null || baseNum === null) return false;
  const size = ip.includes(':') ? 128n : 32n;
  const mask = bits === 0n ? 0n : ((1n << bits) - 1n) << (size - bits);
  return (ipNum & mask) === (baseNum & mask);
}

function isCloudflarePeer(ip) {
  if (!ip) return false;
  const ranges = ip.includes(':') ? CLOUDFLARE_V6 : CLOUDFLARE_V4;
  return ranges.some((cidr) => inCidr(ip, cidr));
}

/* The identity a bucket belongs to.
 *
 * sohampatel.dev is served through the Cloudflare proxy: every request the
 * container sees arrives from a Cloudflare edge address, so keying on req.ip
 * alone would give every visitor on earth ONE shared bucket — and exhausting
 * it would lock the real users out. Cloudflare forwards the true client in
 * CF-Connecting-IP. That header is trivially forgeable, so it is only trusted
 * when the direct peer really is a Cloudflare edge IP; a request that forges
 * it while bypassing Cloudflare falls back to its real peer IP and lands in
 * that IP's bucket instead of an invented one. The direct run.app URL sends
 * no CF header at all and simply keys on req.ip. */
function clientKey(req) {
  const peer = req.ip || req.socket.remoteAddress || 'unknown';
  const cf = req.headers['cf-connecting-ip'];
  if (cf && isCloudflarePeer(peer) && /^[0-9a-fA-F.:]{3,45}$/.test(cf)) return `cf:${cf}`;
  return `ip:${peer}`;
}

function createLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) if (b.resetAt < now) buckets.delete(ip);
  }, windowMs);
  timer.unref();

  return function limit(req, res, next) {
    const ip = clientKey(req);
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

module.exports = { createLimiter, clientKey, isCloudflarePeer };
