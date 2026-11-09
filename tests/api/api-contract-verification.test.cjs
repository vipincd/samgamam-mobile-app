const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Test the real API client contracts against mock server
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

test('CONTRACT-01: Correct endpoint paths (v1 canonical routes)', async () => {
  await setMockMode('success');

  // Login to get valid token
  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'qa@example.test', password: 'test-only-password' },
  });
  assert.equal(loginRes.status, 200);
  const token = loginRes.data.accessToken;

  // Path 1: GET /api/v1/events
  const eventsRes = await apiRequest('/v1/events');
  assert.equal(eventsRes.status, 200);
  assert.ok(Array.isArray(eventsRes.data.data), 'events endpoint data must be an array');

  // Path 2: GET /api/v1/me (NOT /api/v1/users/me)
  const meRes = await apiRequest('/v1/me', { token });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.data.data.viewer.id, 'qa-user');

  // Verify /api/v1/users/me is NOT implemented (returns 404)
  const oldUsersMeRes = await apiRequest('/v1/users/me', { token });
  assert.equal(oldUsersMeRes.status, 404, '/api/v1/users/me must not be used');

  // Path 3: POST /api/v1/events/:eventId/rsvp
  const rsvpRes = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'going', termsAccepted: true },
    token,
  });
  assert.equal(rsvpRes.status, 200);

  // Path 4: POST /api/v1/auth/revoke
  const revokeRes = await apiRequest('/v1/auth/revoke', {
    method: 'POST',
    body: { token },
    token,
  });
  assert.equal(revokeRes.status, 200);

  // Path 5: GET /api/healthz
  const healthRes = await apiRequest('/healthz');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.data.status, 'ok');
});

test('CONTRACT-02: Correct pagination request parameters for event discovery', async () => {
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

test('CONTRACT-04: Page termination when hasNextPage=false', async () => {
  await setMockMode('success');

  const res = await apiRequest('/v1/events?limit=100');
  assert.equal(res.status, 200);
  assert.equal(res.data.page.hasNextPage, false, 'Terminal page must set hasNextPage to false');
  assert.equal(res.data.page.nextCursor, null, 'Terminal page must set nextCursor to null');
});

test('CONTRACT-05: Correct request authentication (Bearer token enforcement)', async () => {
  await setMockMode('success');

  // Unauthenticated request to protected endpoint must yield 401
  const unauthRes = await apiRequest('/v1/me');
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.data.error.code, 'unauthorized');

  // Request with invalid token must yield 401
  const badTokenRes = await apiRequest('/v1/me', { token: 'invalid-fake-token' });
  assert.equal(badTokenRes.status, 401);

  // Request with valid token succeeds
  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'qa@example.test', password: 'test-only-password' },
  });
  const validRes = await apiRequest('/v1/me', { token: loginRes.data.accessToken });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.data.data.viewer.email, 'qa@example.test');
});

test('CONTRACT-06: Correct RSVP payload ({ state, termsAccepted, riskAcknowledged })', async () => {
  await setMockMode('success');
  const loginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: 'qa@example.test', password: 'test-only-password' },
  });
  const token = loginRes.data.accessToken;

  // 1. Missing termsAccepted must fail with 400 consent_required
  const missingConsent = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'going' },
    token,
  });
  assert.equal(missingConsent.status, 400);
  assert.equal(missingConsent.data.error.code, 'consent_required');

  // 2. Outdated legacy status field alone must fail with 400 invalid_state
  const legacyStatus = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { status: 'going', termsAccepted: true },
    token,
  });
  assert.equal(legacyStatus.status, 400);
  assert.equal(legacyStatus.data.error.code, 'invalid_state');

  // 3. Complete valid contract payload succeeds
  const validRsvp = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'going', termsAccepted: true, riskAcknowledged: true },
    token,
  });
  assert.equal(validRsvp.status, 200);
  assert.equal(validRsvp.data.data.state, 'going');
  assert.equal(validRsvp.data.data.event.viewerRsvpState, 'going');

  // 4. RSVP cancellation payload
  const cancelRsvp = await apiRequest('/v1/events/qa-event/rsvp', {
    method: 'POST',
    body: { state: 'cancelled' },
    token,
  });
  assert.equal(cancelRsvp.status, 200);
  assert.equal(cancelRsvp.data.data.state, 'cancelled');
});

test('CONTRACT-07: Error-envelope parsing ({ error: { code, message, requestId } })', async () => {
  await setMockMode('error');

  const errRes = await apiRequest('/v1/events');
  assert.equal(errRes.status, 503);
  assert.ok(errRes.data.error, 'Payload must contain error object');
  assert.equal(typeof errRes.data.error.code, 'string');
  assert.equal(typeof errRes.data.error.message, 'string');
  assert.ok(errRes.data.error.message.length > 0, 'Error message must be present');
});

test('CONTRACT-08: HTTP 401 vs 403 semantic handling', async () => {
  // 401: Unauthorized / expired session (triggers re-auth or logout)
  await setMockMode('unauthorized');
  const res401 = await apiRequest('/v1/events');
  assert.equal(res401.status, 401);
  assert.equal(res401.data.error.code, 'expired');

  // 403: Forbidden / access denied (does NOT trigger refresh loop)
  await setMockMode('forbidden');
  const res403 = await apiRequest('/v1/events');
  assert.equal(res403.status, 403);
  assert.equal(res403.data.error.code, 'forbidden');
});

test('CONTRACT-09: Empty data handling returns uniform envelope with empty array', async () => {
  await setMockMode('empty');

  const res = await apiRequest('/v1/events');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.data, []);
  assert.deepEqual(res.data.page, { hasNextPage: false, nextCursor: null });
  assert.ok(res.data.meta?.requestId);

  const groupsRes = await apiRequest('/v1/groups');
  assert.equal(groupsRes.status, 200);
  assert.deepEqual(groupsRes.data.data, []);
});

test('CONTRACT-10: Malformed response handling', async () => {
  await setMockMode('malformed');

  const res = await apiRequest('/v1/events');
  assert.equal(res.status, 200);
  // Malformed JSON is caught gracefully by parser
  assert.ok(res.data.rawParseError, 'Malformed payload must be caught by parse guard');
});
