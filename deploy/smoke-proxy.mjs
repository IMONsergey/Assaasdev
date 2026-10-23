import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:8080';
let healthy = false;
for (let attempt = 0; attempt < 30; ++attempt) {
  try { healthy = (await fetch(base + '/healthz', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Wait for Nginx startup. */ }
  if (healthy) break;
  await delay(250);
}
assert.ok(healthy, 'The container must become healthy');

for (const path of ['/auth/login', '/auth/signup', '/auth/verify', '/account/security', '/billing/return']) {
  const page = await fetch(base + path);
  assert.equal(page.status, 200, path + ' must be an SPA route');
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await page.text(), /id="root"/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((page.headers.get('content-security-policy') ?? '').includes("connect-src 'self' ws://127.0.0.1:8080;"), 'CSP must explicitly allow the same public WebSocket authority and port');
}
const runtime = await fetch(base + '/runtime-config.js');
assert.match(runtime.headers.get('cache-control') ?? '', /no-store/);
assert.match(await runtime.text(), /apiBaseUrl:\s*'\/backend\/'/);

const auth = await fetch(base + '/backend/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ identifier: 'ci-fixture', password: 'not-a-real-password' }) });
assert.equal(auth.status, 202, 'Pending2FA status must survive the proxy');
const cookie = auth.headers.get('set-cookie') ?? '';
for (const attribute of ['session_id=ci-fixture', 'Path=/', 'Secure', 'HttpOnly', 'SameSite=None']) assert.ok(cookie.includes(attribute), attribute);
const authData = await auth.json();
assert.equal(authData.received.identifier, 'ci-fixture');
assert.equal(authData.origin, base, 'Origin must not be hidden from the backend');
assert.equal(authData.forwardedProto, 'http');

const missing = await fetch(base + '/backend/nonexistent');
assert.equal(missing.status, 404);
assert.match(missing.headers.get('content-type') ?? '', /application\/json/);
assert.equal((await missing.json()).error, 'CI fixture route not found');
const callback = await fetch(base + '/auth/google/callback?code=fixture&state=fixture', { redirect: 'manual' });
assert.equal(callback.status, 302);
assert.equal(callback.headers.get('location'), '/login?2FA=true');

// The upstream deliberately waits for release. A buffering proxy deadlocks here.
const stream = await fetch(base + '/backend/download/bulk/stream', { method: 'POST', body: '{}', signal: AbortSignal.timeout(5000) });
assert.equal(stream.status, 200);
const reader = stream.body.getReader();
const first = await reader.read();
assert.equal(new TextDecoder().decode(first.value), '{"chunk":1}\n');
await fetch(base + '/backend/release-stream');
let rest = '';
for (;;) { const next = await reader.read(); if (next.done) break; rest += new TextDecoder().decode(next.value); }
assert.equal(rest, '{"chunk":2}\n');

await new Promise((resolve, reject) => {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/backend/ws');
  const timeout = setTimeout(() => { socket.close(); reject(new Error('WebSocket proxy timed out')); }, 5000);
  socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket upgrade failed')); }, { once: true });
  socket.addEventListener('message', event => {
    clearTimeout(timeout);
    try { assert.deepEqual(JSON.parse(event.data), { route: '/ws', upgraded: true }); socket.close(); resolve(); }
    catch (error) { socket.close(); reject(error); }
  }, { once: true });
});
process.stdout.write('PASS: SPA routes, runtime configuration, Pending2FA status and cookie flags, API errors, OAuth callback, unbuffered stream, WebSocket upgrade.\n');

