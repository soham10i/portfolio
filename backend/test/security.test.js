const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { securityHeaders, CSP } = require('../src/middleware/security');

test('security headers: CSP includes correct hash for inline theme script in index.html', () => {
  const indexHtmlPath = path.resolve(__dirname, '../../app/index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const match = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'inline theme script found in app/index.html');

  const expectedHash = 'sha256-' + crypto.createHash('sha256').update(match[1]).digest('base64');
  assert.ok(
    CSP.includes(expectedHash),
    `CSP must include expected hash '${expectedHash}' for inline theme script. Current CSP: ${CSP}`
  );
});

test('security headers: middleware sets Content-Security-Policy and Permissions-Policy allowing mic and camera', () => {
  const headers = {};
  const mockRes = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
  };

  let nextCalled = false;
  securityHeaders({}, mockRes, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled, 'next() should be called');
  assert.equal(headers['content-security-policy'], CSP);
  assert.match(headers['permissions-policy'], /microphone=\(self\)/);
  assert.match(headers['permissions-policy'], /camera=\(self\)/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['x-frame-options'], 'DENY');
});
