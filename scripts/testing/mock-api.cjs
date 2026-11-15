// Loopback-only deterministic fixtures. Never import this server into the app.
const http = require('node:http');

const viewer = {
  id: 'qa-user',
  email: 'qa@example.test',
  fullName: 'QA Member',
  emailVerified: true,
  roles: ['member'],
};

const event = {
  id: 'qa-event',
  groupId: 'qa-group',
  title: 'Berlin Community Walk',
  description: 'A deterministic gathering for mobile acceptance.',
  tags: ['outdoors'],
  category: 'Community',
  languages: ['en'],
  location: 'Berlin Test Park',
  startsAt: '2030-06-15T10:00:00.000Z',
  endsAt: '2030-06-15T12:00:00.000Z',
  timeZone: 'Europe/Berlin',
  capacityMode: 'limited',
  capacity: 10,
  remainingCapacity: 9,
  availability: 'available',
  status: 'published',
  ticketPriceCents: 0,
  currency: 'EUR',
  isPaid: false,
  attendeeCount: 1,
  goingCount: 1,
  waitlistCount: 0,
  viewerRsvpState: null,
  requiresRiskAcknowledgement: false,
};

const riskEvent = {
  ...event,
  id: 'qa-risk-event',
  title: 'Berlin High-Altitude Climbing',
  description: 'A strenuous activity requiring explicit risk acknowledgement.',
  requiresRiskAcknowledgement: true,
};

const group = {
  id: 'qa-group',
  name: 'Berlin Neighbours',
  description: 'A local testing circle.',
  tags: ['community'],
  category: 'Community',
  city: 'Berlin',
  languages: ['en'],
  requiresApproval: false,
  discussionCount: 0,
  memberCount: 2,
  viewerMembershipStatus: null,
  viewerMembershipRole: null,
};

const modes = new Set([
  'success',
  'empty',
  'error',
  'unauthorized',
  'forbidden',
  'timeout',
  'offline',
  'malformed',
]);

// When a run id is configured (mock-manager always sets MOCK_RUN_ID), the
// state-changing and state-revealing control endpoints only answer callers
// that present the same id in `x-mock-run-id`. A runner that reaches a mock it
// does not own (e.g. Android Maestro hitting an iOS-owned mock on 4318) gets
// 409 instead of silently switching the owner's scenario.
function createMockServer({ runId = process.env.MOCK_RUN_ID || null } = {}) {
  let mode = 'success';
  let rsvp = null;
  let riskRsvp = null;
  let loggedIn = false;
  const history = [];

  const server = http.createServer(async (req, res) => {
    console.log(`[MOCK] ${req.method} ${req.url} (current_mode=${mode})`);
    const url = new URL(req.url, 'http://localhost');

    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const sendError = (status, code, message) => {
      send(status, {
        error: {
          code,
          message,
          requestId: 'qa-request',
        },
      });
    };

    const data = (value) =>
      send(200, {
        data: value,
        meta: { requestId: 'qa-request' },
        page: { hasNextPage: false, nextCursor: null },
      });

    if (url.pathname === '/__mock/health') {
      return send(200, {
        service: 'samgamam-acceptance-mock',
        runId,
        pid: process.pid,
      });
    }

    if (runId && url.pathname.startsWith('/__mock/') && req.headers['x-mock-run-id'] !== runId) {
      return sendError(409, 'mock_run_mismatch', 'Control request does not belong to the run that owns this mock');
    }

    if (url.pathname === '/__mock/reset' && req.method === 'POST') {
      const next = url.searchParams.get('mode') || 'success';
      if (!modes.has(next)) {
        return sendError(400, 'unknown_scenario', 'Unknown scenario');
      }
      mode = next;
      rsvp = null;
      riskRsvp = null;
      loggedIn = false;
      history.length = 0;
      return send(200, { mode });
    }

    if (url.pathname === '/__mock/history') return send(200, history);

    history.push({
      method: req.method,
      path: url.pathname,
      query: url.searchParams.get('q'),
    });

    if (mode === 'offline') return req.socket.destroy();
    if (mode === 'timeout') {
      const timer = setTimeout(() => sendError(504, 'timeout', 'Gateway timeout'), 20000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    if (mode === 'malformed') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{invalid');
    }
    if (mode === 'error') {
      return sendError(503, 'unavailable', 'Mock service unavailable');
    }
    if (mode === 'unauthorized') {
      return sendError(401, 'expired', 'Session expired');
    }
    if (mode === 'forbidden') {
      return sendError(403, 'forbidden', 'Access denied');
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8192) {
        return sendError(413, 'payload_too_large', 'Too large');
      }
    }

    let input = {};
    try {
      input = body ? JSON.parse(body) : {};
    } catch {
      return sendError(400, 'invalid_json', 'Invalid JSON');
    }

    const path = url.pathname;
    if (path === '/api/healthz') return send(200, { status: 'ok' });

    if (path === '/api/auth/login' && req.method === 'POST') {
      if (input.email !== 'qa@example.test' || input.password !== 'test-only-password') {
        return sendError(401, 'invalid_credentials', 'Invalid credentials');
      }
      loggedIn = true;
      return send(200, { accessToken: 'qa-token', viewer, locale: 'en' });
    }

    if (path === '/api/v1/auth/revoke' || path === '/api/auth/logout') {
      loggedIn = false;
      return data({ revoked: true });
    }

    if (path === '/api/v1/events') {
      return data(
        mode === 'empty' || (url.searchParams.get('q') && !/berlin|walk|climb/i.test(url.searchParams.get('q')))
          ? []
          : [{ ...event, viewerRsvpState: rsvp }],
      );
    }

    if (path === '/api/v1/events/qa-event') {
      return data({ ...event, viewerRsvpState: rsvp });
    }

    if (path === '/api/v1/events/qa-risk-event') {
      return data({ ...riskEvent, viewerRsvpState: riskRsvp });
    }

    if (path === '/api/v1/groups') {
      return data(mode === 'empty' ? [] : [group]);
    }
    if (path === '/api/v1/groups/qa-group') return data(group);
    if (path === '/api/v1/groups/qa-group/discussions') return data([]);

    if (!loggedIn || req.headers.authorization !== 'Bearer qa-token') {
      return sendError(401, 'unauthorized', 'Sign in required');
    }

    if (path === '/api/v1/me') {
      return data({ viewer, locale: 'en' });
    }

    // RSVP endpoint for standard event (requires termsAccepted, does not require riskAcknowledged)
    if (path === '/api/v1/events/qa-event/rsvp' && req.method === 'POST') {
      if (!['going', 'waitlist', 'cancelled'].includes(input.state)) {
        return sendError(400, 'invalid_state', 'Invalid RSVP state');
      }
      if (input.state !== 'cancelled' && input.termsAccepted !== true) {
        return sendError(400, 'consent_required', 'You must accept the terms of service');
      }
      rsvp = input.state;
      return data({ event: { ...event, viewerRsvpState: rsvp }, state: input.state });
    }

    // RSVP endpoint for high-risk event (requires termsAccepted AND riskAcknowledged)
    if (path === '/api/v1/events/qa-risk-event/rsvp' && req.method === 'POST') {
      if (!['going', 'waitlist', 'cancelled'].includes(input.state)) {
        return sendError(400, 'invalid_state', 'Invalid RSVP state');
      }
      if (input.state !== 'cancelled') {
        if (input.termsAccepted !== true) {
          return sendError(400, 'consent_required', 'You must accept the terms of service');
        }
        if (input.riskAcknowledged !== true) {
          return sendError(
            400,
            'risk_acknowledgement_required',
            'This event requires acknowledging the inherent physical and safety risks.',
          );
        }
      }
      riskRsvp = input.state;
      return data({ event: { ...riskEvent, viewerRsvpState: riskRsvp }, state: input.state });
    }

    return sendError(404, 'not_implemented', 'Fixture endpoint not implemented');
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
