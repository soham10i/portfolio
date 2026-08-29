/* Security headers, hand-rolled rather than pulled from helmet.
 *
 * The set is small and every line is here on purpose, which matters more for a
 * portfolio than saving twenty lines: a reviewer can read exactly what policy
 * this site enforces. */
const config = require('../config');

/* The CSP has to allow what the site genuinely uses:
 *   - Google Fonts stylesheets and font files (index.css @import)
 *   - blob: workers and wasm-unsafe-eval for onnxruntime-web
 *   - blob: media for the visitor's own uploaded video and camera stream
 *   - data: images for keyframe thumbnails
 * Everything else is denied. Note there is no external script host: three.js,
 * onnxruntime, KaTeX and marked are all served from this origin. */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob:",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // HSTS only over TLS, and only in production — never on a localhost deploy,
  // where it would pin the browser to https for a server that has no cert.
  if (config.isProd && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

module.exports = { securityHeaders, CSP };
