import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// CRIT-1 residual: the companion's auth + anti-DNS-rebinding gates had no tests.
// Establish a known token via the env var (never touches the user's real token
// file), then populate the module cache before exercising the middleware.
process.env.USBVAULT_COMPANION_TOKEN = 'test-companion-token-abc123';
import { requireAuth, validateHost, getCompanionToken } from '../middleware/auth.js';
getCompanionToken();

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function run(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

describe('requireAuth (companion bearer-token gate)', () => {
  it('accepts a request carrying the valid bearer token', () => {
    const { res, nextCalled } = run(requireAuth, {
      method: 'POST', headers: { authorization: 'Bearer test-companion-token-abc123' }, path: '/usb/reset',
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });

  it('rejects a request with no Authorization header (401)', () => {
    const { res, nextCalled } = run(requireAuth, { method: 'POST', headers: {}, path: '/usb/reset' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects a wrong token (401)', () => {
    const { res, nextCalled } = run(requireAuth, {
      method: 'POST', headers: { authorization: 'Bearer not-the-token' }, path: '/usb/reset',
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects a malformed (non-Bearer) Authorization header (401)', () => {
    const { res, nextCalled } = run(requireAuth, {
      method: 'POST', headers: { authorization: 'test-companion-token-abc123' }, path: '/usb/reset',
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  it('lets a CORS preflight (OPTIONS) through without a token', () => {
    const { res, nextCalled } = run(requireAuth, { method: 'OPTIONS', headers: {}, path: '/usb/reset' });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });
});

describe('validateHost (DNS-rebinding gate)', () => {
  const mw = validateHost(3001);

  it('accepts loopback hosts (with and without the bound port)', () => {
    for (const host of ['localhost', '127.0.0.1', 'localhost:3001', '127.0.0.1:3001', '[::1]', '[::1]:3001']) {
      const { res, nextCalled } = run(mw, { method: 'POST', headers: { host }, path: '/usb/reset' });
      assert.equal(nextCalled, true, `expected ${host} accepted`);
      assert.equal(res.statusCode, null, `expected ${host} not rejected`);
    }
  });

  it('rejects a non-loopback Host (403) — DNS rebinding', () => {
    const { res, nextCalled } = run(mw, { method: 'POST', headers: { host: 'evil.example.com' }, path: '/usb/reset' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it('rejects a missing Host header (403)', () => {
    const { res, nextCalled } = run(mw, { method: 'POST', headers: {}, path: '/usb/reset' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it('rejects a loopback host on the wrong port (403)', () => {
    const { res, nextCalled } = run(mw, { method: 'POST', headers: { host: 'localhost:9999' }, path: '/usb/reset' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});
