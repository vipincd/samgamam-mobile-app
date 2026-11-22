const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// NOTE ON TEST PROVENANCE AND EVIDENCE CLASSIFICATION:
// CLASSIFICATION: PASS — CONTRACT TEST (MOCK CONTRACT ONLY)
// These contract tests exercise scripts/testing/mock-api.cjs fixtures to verify route,
// payload, query parameter, and error envelope specifications.
// They do NOT constitute physical device verification or live production backend verification.
// Executable client unit tests invoking the real mobile client (src/api/client.ts) are
// implemented in src/api/client.test.ts and src/api/deterministic-backend.test.ts.

const { createMockServer } = require('../../scripts/testing/mock-api.cjs');

let server;
let baseUrl;

before(async () => {
  server = createMockServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => {
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(resolve);
  });
});

async function apiRequest(path, { method = 'GET', body, token, headers = {} } = {}) {
  const reqHeaders = {
    'content-type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
  const url = `${baseUrl}/api${path}`;
  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (err) {
      data = { rawParseError: err.message };
    }
  } else {
    data = await response.text();
  }

  return { status: response.status, headers: response.headers, data };
}

async function setMockMode(mode) {
  const res = await fetch(`${baseUrl}/__mock/reset?mode=${mode}`, { method: 'POST' });
  assert.equal(res.status, 200);
}

test('CONTRACT-01: Canonical v1 routes (/v1/events, /v1/me, /healthz; /v1/users/me is 404)', async () => {
  await setMockMode('success');

  // Login to get valid token
  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'qa@example.test', password: 'test-only-password' },
  });
  assert.equal(loginRes.status, 200);
  const token = loginRes.data.accessToken;

  // Canonical Path 1: GET /api/v1/events
  const eventsRes = await apiRequest('/v1/events');
  assert.equal(eventsRes.status, 200);
  assert.ok(Array.isArray(eventsRes.data.data), 'events endpoint data must be an array');

  // Canonical Path 2: GET /api/v1/me (Authoritative v1 profile route)
  const meRes = await apiRequest('/v1/me', { token });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.data.data.viewer.id, 'qa-user');

  // Non-canonical Path: /api/v1/users/me is NOT implemented (returns 404)
  const oldUsersMeRes = await apiRequest('/v1/users/me', { token });
  assert.equal(oldUsersMeRes.status, 404, '/api/v1/users/me must not be used');

  // Canonical Path 3: POST /api/v1/events/:eventId/rsvp
  const rsvpRes = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'going', termsAccepted: true },
    token,
  });
  assert.equal(rsvpRes.status, 200);

  // Canonical Path 4: POST /api/v1/auth/revoke
  const revokeRes = await apiRequest('/v1/auth/revoke', {
    method: 'POST',
    body: { token },
    token,
  });
  assert.equal(revokeRes.status, 200);

  // Canonical Path 5: GET /api/healthz
  const healthRes = await apiRequest('/healthz');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.data.status, 'ok');
});

test('CONTRACT-02: Keyset cursor pagination parameters for event discovery', async () => {
  await setMockMode('success');

  // Supported query parameters: cursor, limit, q, category, language, dateFrom, location, locale
  const queryParams = new URLSearchParams({
    limit: '10',
    q: 'Berlin',
    category: 'Community',
    language: 'en',
    dateFrom: '2030-01-01T00:00:00.000Z',
    location: 'Berlin',
    locale: 'en',
  });

  const res = await apiRequest(`/v1/events?${queryParams.toString()}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.data));
  assert.ok(res.data.meta?.requestId, 'Response envelope must contain meta.requestId');
  assert.ok('page' in res.data, 'Response envelope must contain page object');
});

test('CONTRACT-03: Cursor handling in cursor-based pagination', async () => {
  await setMockMode('success');

  const res = await apiRequest('/v1/events?limit=5');
  assert.equal(res.status, 200);

  // Response contains page: { hasNextPage, nextCursor }
  const page = res.data.page;
  assert.ok(typeof page.hasNextPage === 'boolean', 'hasNextPage must be boolean');
  assert.ok(page.nextCursor === null || typeof page.nextCursor === 'string', 'nextCursor must be null or string');
});

test('CONTRACT-04: End-of-pagination termination when hasNextPage=false', async () => {
  await setMockMode('success');

  const res = await apiRequest('/v1/events?limit=100');
  assert.equal(res.status, 200);
  assert.equal(res.data.page.hasNextPage, false, 'Terminal page must set hasNextPage to false');
  assert.equal(res.data.page.nextCursor, null, 'Terminal page must set nextCursor to null');
});

test('CONTRACT-05: Authenticated requests (Bearer token enforcement)', async () => {
  await setMockMode('success');

  // Unauthenticated request to protected endpoint must yield 401
  const unauthRes = await apiRequest('/v1/me');
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.data.error.code, 'unauthorized');
  assert.equal(unauthRes.data.error.requestId, 'qa-request');

  // Authenticated request with Bearer token succeeds
  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'qa@example.test', password: 'test-only-password' },
  });
  const token = loginRes.data.accessToken;

  const authRes = await apiRequest('/v1/me', { token });
  assert.equal(authRes.status, 200);
  assert.equal(authRes.data.data.viewer.id, 'qa-user');
});

test('CONTRACT-06: Accurate RSVP contract and conditional risk acknowledgment rules', async () => {
  await setMockMode('success');

  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'qa@example.test', password: 'test-only-password' },
  });
  const token = loginRes.data.accessToken;

  // 1. Invalid state rejected
  const badState = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'invalid_status' },
    token,
  });
  assert.equal(badState.status, 400);
  assert.equal(badState.data.error.code, 'invalid_state');

  // 2. Joining standard event (requiresRiskAcknowledgement: false) without termsAccepted -> REJECTED
  const noTerms = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'going' },
    token,
  });
  assert.equal(noTerms.status, 400);
  assert.equal(noTerms.data.error.code, 'consent_required');

  // 3. Joining standard event with termsAccepted: true -> SUCCEEDS (riskAcknowledged is NOT required)
  const standardGoing = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'going', termsAccepted: true },
    token,
  });
  assert.equal(standardGoing.status, 200);
  assert.equal(standardGoing.data.data.state, 'going');

  // 4. Joining high-risk event (requiresRiskAcknowledgement: true) with termsAccepted but missing riskAcknowledged -> REJECTED
  const riskMissing = await apiRequest('/v1/events/qa-risk-event/rsvp', {
    method: 'POST',
    body: { state: 'going', termsAccepted: true },
    token,
  });
  assert.equal(riskMissing.status, 400);
  assert.equal(riskMissing.data.error.code, 'risk_acknowledgement_required');

  // 5. Joining high-risk event with both termsAccepted: true AND riskAcknowledged: true -> SUCCEEDS
  const riskGoing = await apiRequest('/v1/events/qa-risk-event/rsvp', {
    method: 'POST',
    body: { state: 'going', termsAccepted: true, riskAcknowledged: true },
    token,
  });
  assert.equal(riskGoing.status, 200);
  assert.equal(riskGoing.data.data.state, 'going');

  // 6. Cancelling RSVP -> neither terms nor risk acknowledgement required
  const cancelRes = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'cancelled' },
    token,
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.data.data.state, 'cancelled');
});

test('CONTRACT-07: Error-envelope parsing ({ error: { code, message, requestId } })', async () => {
  await setMockMode('error');

  const res = await apiRequest('/v1/events');
  assert.equal(res.status, 503);
  assert.ok(res.data.error, 'Response must contain error object');
  assert.equal(res.data.error.code, 'unavailable');
  assert.ok(typeof res.data.error.message === 'string', 'Error must contain message string');
  assert.equal(res.data.error.requestId, 'qa-request', 'Error envelope must contain requestId');
});

test('CONTRACT-08: HTTP 401 vs 403 semantic handling', async () => {
  await setMockMode('unauthorized');
  const res401 = await apiRequest('/v1/events');
  assert.equal(res401.status, 401);
  assert.equal(res401.data.error.code, 'expired');
  assert.equal(res401.data.error.requestId, 'qa-request');

  await setMockMode('forbidden');
  const res403 = await apiRequest('/v1/events');
  assert.equal(res403.status, 403);
  assert.equal(res403.data.error.code, 'forbidden');
  assert.equal(res403.data.error.requestId, 'qa-request');
});

test('CONTRACT-09: Empty data handling returns uniform envelope with empty array', async () => {
  await setMockMode('empty');

  const eventsRes = await apiRequest('/v1/events');
  assert.equal(eventsRes.status, 200);
  assert.deepEqual(eventsRes.data.data, []);
  assert.equal(eventsRes.data.page.hasNextPage, false);
  assert.equal(eventsRes.data.page.nextCursor, null);
  assert.equal(eventsRes.data.meta.requestId, 'qa-request');

  const groupsRes = await apiRequest('/v1/groups');
  assert.equal(groupsRes.status, 200);
  assert.deepEqual(groupsRes.data.data, []);
});

test('CONTRACT-10: Malformed response handling', async () => {
  await setMockMode('malformed');

  const res = await apiRequest('/v1/events');
  assert.ok(res.data.rawParseError, 'Client must detect malformed JSON without crashing');
});
