// Loopback-only deterministic fixtures. Never import this server into the app.
const http = require('node:http');
const viewer = { id: 'qa-user', email: 'qa@example.test', fullName: 'QA Member', emailVerified: true, roles: ['member'] };
const event = { id: 'qa-event', groupId: 'qa-group', title: 'Berlin Community Walk', description: 'A deterministic gathering for mobile acceptance.', tags: ['outdoors'], category: 'Community', languages: ['en'], location: 'Berlin Test Park', startsAt: '2030-06-15T10:00:00.000Z', endsAt: '2030-06-15T12:00:00.000Z', timeZone: 'Europe/Berlin', capacityMode: 'limited', capacity: 10, remainingCapacity: 9, availability: 'available', status: 'published', ticketPriceCents: 0, currency: 'EUR', isPaid: false, attendeeCount: 1, goingCount: 1, waitlistCount: 0, viewerRsvpState: null };
const group = { id: 'qa-group', name: 'Berlin Neighbours', description: 'A local testing circle.', tags: ['community'], category: 'Community', city: 'Berlin', languages: ['en'], requiresApproval: false, discussionCount: 0, memberCount: 2, viewerMembershipStatus: null, viewerMembershipRole: null };
const modes = new Set(['success', 'empty', 'error', 'unauthorized', 'forbidden', 'timeout', 'offline', 'malformed']);
function createMockServer() {
  let mode = 'success'; let rsvp = null; let loggedIn = false;
  const history = [];
  const server = http.createServer(async (req, res) => {
    console.log(`[MOCK] ${req.method} ${req.url} (current_mode=${mode})`);
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const data = (value) => send(200, { data: value, meta: { requestId: 'qa-request' }, page: { hasNextPage: false, nextCursor: null } });
    if (url.pathname === '/__mock/health') {
      return send(200, {
        service: 'samgamam-acceptance-mock',
        runId: process.env.MOCK_RUN_ID || null,
        pid: process.pid,
      });
    }
    if (url.pathname === '/__mock/reset' && req.method === 'POST') {
      const next = url.searchParams.get('mode') || 'success';
      if (!modes.has(next)) return send(400, { error: 'Unknown scenario' });
      mode = next; rsvp = null; loggedIn = false; history.length = 0;
      return send(200, { mode });
    }
    if (url.pathname === '/__mock/history') return send(200, history);
    history.push({ method: req.method, path: url.pathname, query: url.searchParams.get('q') });
    if (mode === 'offline') return req.socket.destroy();
    if (mode === 'timeout') { const timer = setTimeout(() => send(504, { error: 'timeout' }), 20000); res.on('close', () => clearTimeout(timer)); return; }
    if (mode === 'malformed') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{invalid'); }
    if (mode === 'error') return send(503, { error: { code: 'unavailable', message: 'Mock service unavailable' } });
    if (mode === 'unauthorized') return send(401, { error: { code: 'expired', message: 'Session expired' } });
    if (mode === 'forbidden') return send(403, { error: { code: 'forbidden', message: 'Access denied' } });
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8192) return send(413, { error: 'Too large' }); }
    let input = {};
    try { input = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'Invalid JSON' }); }
    const path = url.pathname;
    if (path === '/api/healthz') return send(200, { status: 'ok' });
    if (path === '/api/auth/login' && req.method === 'POST') {
      if (input.email !== 'qa@example.test' || input.password !== 'test-only-password') return send(401, { error: { code: 'invalid_credentials', message: 'Invalid credentials' } });
      loggedIn = true;
      return send(200, { accessToken: 'qa-token', viewer, locale: 'en' });
    }
    if (path === '/api/v1/auth/revoke' || path === '/api/auth/logout') { loggedIn = false; return data({ revoked: true }); }
    if (path === '/api/v1/events') return data(mode === 'empty' || (url.searchParams.get('q') && !/berlin|walk/i.test(url.searchParams.get('q'))) ? [] : [{ ...event, viewerRsvpState: rsvp }]);
    if (path === '/api/v1/events/qa-event') return data({ ...event, viewerRsvpState: rsvp });
    if (path === '/api/v1/groups') return data(mode === 'empty' ? [] : [group]);
    if (path === '/api/v1/groups/qa-group') return data(group);
    if (path === '/api/v1/groups/qa-group/discussions') return data([]);
    if (!loggedIn || req.headers.authorization !== 'Bearer qa-token') return send(401, { error: { code: 'unauthorized', message: 'Sign in required' } });
    if (path === '/api/v1/me') return data({ viewer, locale: 'en' });
    if (path === '/api/v1/events/qa-event/rsvp' && req.method === 'POST') {
      if (!['going', 'cancelled'].includes(input.state)) return send(400, { error: { code: 'invalid_state' } });
      if (input.state === 'going' && input.termsAccepted !== true) return send(400, { error: { code: 'consent_required' } });
      rsvp = input.state;
      return data({ event: { ...event, viewerRsvpState: rsvp }, state: rsvp });
    }
    return send(404, { error: { code: 'not_implemented', message: 'Fixture endpoint not implemented' } });
  });
  return server;
}
module.exports = { createMockServer };
if (require.main === module) {
  const port = Number(process.env.MOCK_PORT || 4318);
  const server = createMockServer();
  server.listen(port, '127.0.0.1', () => console.log(`Samgamam mock: http://127.0.0.1:${port}`));
  process.on('SIGTERM', () => {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => process.exit(0));
  });
}
