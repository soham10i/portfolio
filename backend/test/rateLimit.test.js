/* Rate-limit identity: which client a bucket belongs to.
 *
 * The site is served through the Cloudflare proxy, so the security properties
 * are: every proxied visitor gets their OWN bucket (keyed on CF-Connecting-IP),
 * a forged CF-Connecting-IP from a non-Cloudflare peer is IGNORED (the request
 * lands in the peer's bucket instead of an invented one), and direct run.app
 * traffic keys on the plain peer IP. */
const { test } = require('node:test');
const assert = require('node:assert');
const { clientKey, isCloudflarePeer } = require('../src/middleware/rateLimit');

function req({ ip, cf } = {}) {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: cf ? { 'cf-connecting-ip': cf } : {},
  };
}

test('isCloudflarePeer: real edge IPs match, strangers do not', () => {
  assert.ok(isCloudflarePeer('188.114.96.3'));      // Cloudflare anycast range
  assert.ok(isCloudflarePeer('104.16.1.1'));
  assert.ok(isCloudflarePeer('2606:4700:3033::6815:2b41'));
  assert.ok(!isCloudflarePeer('203.0.113.7'));      // TEST-NET-3, not Cloudflare
  assert.ok(!isCloudflarePeer('8.8.8.8'));
  assert.ok(!isCloudflarePeer('not-an-ip'));
  assert.ok(!isCloudflarePeer(''));
});

test('clientKey: Cloudflare peer + CF-Connecting-IP keys on the real client', () => {
  const r = req({ ip: '188.114.96.3', cf: '203.0.113.7' });
  assert.equal(clientKey(r), 'cf:203.0.113.7');
});

test('clientKey: forged CF-Connecting-IP from a stranger is ignored', () => {
  const r = req({ ip: '203.0.113.7', cf: '1.2.3.4' });
  assert.equal(clientKey(r), 'ip:203.0.113.7');
});

test('clientKey: direct traffic without CF header keys on the peer IP', () => {
  assert.equal(clientKey(req({ ip: '198.51.100.22' })), 'ip:198.51.100.22');
});

test('clientKey: garbage CF header value is rejected', () => {
  const r = req({ ip: '188.114.96.3', cf: 'x-forwarded-for: evil' });
  assert.equal(clientKey(r), 'ip:188.114.96.3');
});
