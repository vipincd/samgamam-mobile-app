const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createMockServer } = require('../../scripts/testing/mock-api.cjs');
let server, base;
before(async () => { server = createMockServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
const reset = mode => fetch(`${base}/__mock/reset?mode=${mode}`, { method: 'POST' });
const call = (path, body, token) => fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('authentication, protected profile, consent, RSVP cancellation and revocation over real HTTP', async () => {
  await reset('success');
  assert.equal((await call('/v1/me')).status, 401);
  assert.equal((await call('/auth/login', { email: 'qa@example.test', password: 'wrong' })).status, 401);
  const login = await (await call('/auth/login', { email: 'qa@example.test', password: 'test-only-password' })).json();
  assert.equal(login.viewer.id, 'qa-user');
  assert.equal((await (await call('/v1/me', null, login.accessToken)).json()).data.viewer.id, 'qa-user');
  assert.equal((await call('/v1/events/qa-event/rsvp', { state: 'going' }, login.accessToken)).status, 400);
  for (const state of ['going', 'cancelled']) {
    const r = await call('/v1/events/qa-event/rsvp', { state, termsAccepted: true }, login.accessToken);
    assert.equal(r.status, 200); assert.equal((await r.json()).data.state, state);
    assert.equal((await (await call('/v1/events/qa-event')).json()).data.viewerRsvpState, state);
  }
  await call('/v1/auth/revoke', {}, login.accessToken);
  assert.equal((await call('/v1/me', null, login.accessToken)).status, 401);
});
test('discovery success, search, empty community and deterministic reset', async () => {
  await reset('success');
  assert.equal((await (await call('/v1/events')).json()).data[0].id, 'qa-event');
  assert.deepEqual((await (await call('/v1/events?q=nomatch')).json()).data, []);
  await reset('empty');
  assert.deepEqual((await (await call('/v1/groups')).json()).data, []);
  await reset('success');
  assert.equal((await (await call('/v1/groups')).json()).data[0].id, 'qa-group');
});
for (const [mode, status] of [['error', 503], ['unauthorized', 401], ['forbidden', 403]]) test(`${mode} HTTP contract`, async () => { await reset(mode); assert.equal((await call('/v1/events')).status, status); });
test('malformed JSON rejects parsing', async () => { await reset('malformed'); const r = await call('/v1/events'); await assert.rejects(r.json()); });
test('offline closes transport and success recovers', async () => { await reset('offline'); await assert.rejects(call('/v1/events')); await reset('success'); assert.equal((await call('/v1/events')).status, 200); });
test('timeout hangs until client aborts', async () => { await reset('timeout'); await assert.rejects(fetch(base + '/api/v1/events', { signal: AbortSignal.timeout(100) }), { name: 'TimeoutError' }); });
test('control endpoint rejects unsupported modes', async () => { assert.equal((await reset('not-real')).status, 400); });
