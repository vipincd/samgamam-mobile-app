import * as SecureStore from 'expo-secure-store';

import { ApiClient, apiClient, normalizeEventSummary, ApiError, DEFAULT_REQUEST_TIMEOUT_MS } from './client';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  isAvailableAsync: jest.fn(async () => true),
  setItemAsync: jest.fn(async () => undefined),
}));

describe('existing product API authentication', () => {
  it('retains the product SecureStore token key and bearer behavior', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'product-token-value',
            locale: 'en',
            viewer: {
              email: 'member@example.invalid',
              emailVerified: true,
              fullName: 'Example Member',
              id: 'member-id',
              roles: ['member'],
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, locale: 'en', viewer: null }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    global.fetch = fetchMock as never;

    await apiClient.login('member@example.invalid', 'test-password');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'samgamam.access_token',
      'product-token-value',
    );

    await apiClient.getSession();
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(request.headers).get('Authorization')).toBe(
      'Bearer product-token-value',
    );
  });
});

describe('development LAN backend URLs', () => {
  const originalDevelopmentDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');

  afterEach(() => {
    if (originalDevelopmentDescriptor) {
      Object.defineProperty(globalThis, '__DEV__', originalDevelopmentDescriptor);
    }
  });

  it.each(['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.0.77'])(
    'allows private HTTP host %s in development',
    async (host) => {
      Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
      const url = `http://${host}:3002`;
      await expect(apiClient.setApiBaseUrl(url)).resolves.toBe(url);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('samgamam.api_base_url', url);
    },
  );

  it.each(['172.15.255.255', '172.32.0.1', '192.169.0.1', 'example.com', '8.8.8.8'])(
    'rejects non-private HTTP host %s even in development',
    async (host) => {
      Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
      await expect(apiClient.setApiBaseUrl(`http://${host}:3002`)).rejects.toThrow('requires HTTPS');
    },
  );

  it.each(['10.1.2.3', '172.16.0.1', '192.168.0.77'])(
    'retains release HTTPS requirements for private host %s',
    async (host) => {
      Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: false });
      await expect(apiClient.setApiBaseUrl(`http://${host}:3002`)).rejects.toThrow('requires HTTPS');
    },
  );

  it('does not allow other protocols for development LAN hosts', async () => {
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
    await expect(apiClient.setApiBaseUrl('ftp://192.168.0.77')).rejects.toThrow('requires HTTPS');
  });

  it.each(['localhost', '127.0.0.1', '10.0.2.2'])(
    'rejects loopback HTTP host %s in release mode',
    async (host) => {
      Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: false });
      await expect(apiClient.setApiBaseUrl(`http://${host}:3000`)).rejects.toThrow('requires HTTPS');
    },
  );

  it.each(['localhost', '127.0.0.1', '10.0.2.2'])(
    'allows loopback HTTP host %s in development mode',
    async (host) => {
      Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: true });
      const url = `http://${host}:3000`;
      await expect(apiClient.setApiBaseUrl(url)).resolves.toBe(url);
    },
  );

  it('accepts HTTPS URLs in release mode', async () => {
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: false });
    const url = 'https://samgamam.vercel.app';
    await expect(apiClient.setApiBaseUrl(url)).resolves.toBe(url);
  });
});


describe('verified /api/v1 screen contracts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches Discover events from /api/v1/events and normalizes keyset response', async () => {
    const mockEvents = [
      {
        id: 'event-1',
        groupId: 'group-1',
        title: 'Community Gathering',
        description: 'A great gathering',
        category: 'culture',
        tags: ['social'],
        languages: ['en'],
        location: 'Berlin',
        startsAt: '2026-10-15T18:00:00.000Z',
        capacityMode: 'limited' as const,
        capacity: 50,
        remainingCapacity: 10,
        availability: 'available' as const,
        status: 'published',
        isPaid: false,
        ticketPriceCents: 0,
        currency: 'EUR',
      },
      {
        id: 'event-2',
        groupId: 'group-2',
        title: 'Open Picnic',
        description: 'Unlimited capacity',
        category: 'outdoor',
        tags: ['park'],
        languages: ['en'],
        location: 'Tiergarten',
        startsAt: '2026-10-16T12:00:00.000Z',
        capacityMode: 'unlimited' as const,
        capacity: null,
        remainingCapacity: null,
        availability: 'available' as const,
        status: 'published',
        isPaid: false,
        ticketPriceCents: 0,
        currency: 'EUR',
      },
    ];

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: mockEvents,
          page: { hasNextPage: true, nextCursor: 'cursor-token-123' },
          meta: { requestId: 'req-abc-1' },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    global.fetch = fetchMock as never;

    const result = await apiClient.getEvents({ locale: 'en', limit: 12, category: 'culture' });
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/events?');
    expect(calledUrl).toContain('locale=en');
    expect(calledUrl).toContain('limit=12');
    expect(calledUrl).toContain('category=culture');

    expect(result.events).toHaveLength(2);
    expect(result.events[0].attendeeCount).toBeUndefined(); // never derived from capacity - remainingCapacity
    expect(result.events[1].capacityMode).toBe('unlimited');
    expect(result.events[1].remainingCapacity).toBeNull();
    expect(result.page?.hasNextPage).toBe(true);
    expect(result.page?.nextCursor).toBe('cursor-token-123');
    expect(result.meta?.requestId).toBe('req-abc-1');
  });

  it('searches events via /api/v1/events with q parameter strictly without unknown params', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          page: { hasNextPage: false, nextCursor: null },
          meta: { requestId: 'req-search-1' },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    global.fetch = fetchMock as never;

    const result = await apiClient.searchEvents('berlin meetup', 'en');
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/events?');
    expect(calledUrl).toContain('q=berlin+meetup');
    expect(calledUrl).not.toContain('pageSize=');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('mutates RSVP via POST /api/v1/events/{id}/rsvp', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            event: {
              id: 'event-rsvp-1',
              groupId: 'group-1',
              title: 'Confirmed Gathering',
              description: 'Desc',
              category: 'social',
              tags: [],
              languages: ['en'],
              location: 'Munich',
              startsAt: '2026-11-01T10:00:00.000Z',
              capacityMode: 'limited',
              capacity: 20,
              remainingCapacity: 5,
              availability: 'available',
              status: 'published',
              isPaid: false,
              ticketPriceCents: 0,
              currency: 'EUR',
            },
            state: 'going',
          },
          meta: { requestId: 'req-rsvp-1' },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    global.fetch = fetchMock as never;

    const result = await apiClient.rsvpToEvent('event-rsvp-1', 'going');
    expect(fetchMock).toHaveBeenCalled();
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/api/v1/events/event-rsvp-1/rsvp');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body as string)).toEqual({ state: 'going' });
    expect(result.event.viewerRsvpState).toBe('going');
    expect(result.event.attendeeCount).toBeUndefined();
  });


  it('preserves authoritative attendeeCount or goingCount when provided and omits when unavailable', () => {
    const withCount = normalizeEventSummary({
      id: 'ev-1',
      groupId: 'g-1',
      title: 'Test',
      description: 'Test',
      tags: [],
      category: 'general',
      languages: ['en'],
      location: 'Berlin',
      startsAt: '2026-10-15T18:00:00.000Z',
      ticketPriceCents: 0,
      currency: 'EUR',
      isPaid: false,
      attendeeCount: 25,
      capacity: 50,
      remainingCapacity: 25,
    });
    expect(withCount.attendeeCount).toBe(25);

    const withGoingCount = normalizeEventSummary({
      id: 'ev-2',
      groupId: 'g-1',
      title: 'Test',
      description: 'Test',
      tags: [],
      category: 'general',
      languages: ['en'],
      location: 'Berlin',
      startsAt: '2026-10-15T18:00:00.000Z',
      ticketPriceCents: 0,
      currency: 'EUR',
      isPaid: false,
      goingCount: 18,
    });
    expect(withGoingCount.attendeeCount).toBe(18);

    const withoutCount = normalizeEventSummary({
      id: 'ev-3',
      groupId: 'g-1',
      title: 'Test',
      description: 'Test',
      tags: [],
      category: 'general',
      languages: ['en'],
      location: 'Berlin',
      startsAt: '2026-10-15T18:00:00.000Z',
      ticketPriceCents: 0,
      currency: 'EUR',
      isPaid: false,
      capacity: 100,
      remainingCapacity: 80,
    });
    expect(withoutCount.attendeeCount).toBeUndefined();
    expect(withoutCount.attendeeCount).not.toBe(0);
    expect(withoutCount.attendeeCount).not.toBe(20);
  });

  it('fetches groups and discussions via /api/v1/groups contracts', async () => {
    const mockGroups = [
      {
        id: 'group-1',
        name: 'Berlin Tech Circle',
        description: 'Tech enthusiasts in Berlin',
        category: 'technology',
        city: 'Berlin',
        tags: ['coding'],
        languages: ['en', 'de'],
        requiresApproval: false,
        memberCount: 42,
        discussionCount: 7,
        viewerMembershipStatus: 'active',
        viewerMembershipRole: 'member',
      },
    ];

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: mockGroups,
            page: { hasNextPage: false, nextCursor: null },
            meta: { requestId: 'req-groups-1' },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'post-1',
                authorId: 'author-1',
                authorName: 'Alex',
                body: 'Hello everyone!',
                pinned: true,
                createdAt: '2026-09-12T00:00:00.000Z',
              },
            ],
            meta: { requestId: 'req-discussions-1' },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      );
    global.fetch = fetchMock as never;

    const groupResult = await apiClient.getGroups('en');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/groups?locale=en');
    expect(groupResult.groups).toHaveLength(1);
    expect(groupResult.groups[0].viewerMembershipStatus).toBe('active');
    expect(groupResult.groups[0].city).toBe('Berlin');

    const discussionResult = await apiClient.getDiscussions('group-1', 'en');
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/groups/group-1/discussions?locale=en');
    expect(discussionResult.discussions).toHaveLength(1);
    expect(discussionResult.discussions[0].authorName).toBe('Alex');
    expect(discussionResult.discussions[0].pinned).toBe(true);
  });

  it('fetches viewer profile via /api/v1/me and registers push device via /api/v1/devices/register', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                id: 'viewer-v1',
                email: 'viewer@example.local',
                fullName: 'Verified Viewer',
                roles: ['user'],
                emailVerified: true,
              },
              locale: 'en',
            },
            meta: { requestId: 'req-me-1' },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { deviceId: 'test-device-uuid', registered: true },
            meta: { requestId: 'req-device-1' },
          }),
          { headers: { 'content-type': 'application/json' }, status: 201 },
        ),
      );
    global.fetch = fetchMock as never;

    const profile = await apiClient.getViewerProfile('en');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/me?locale=en');
    expect(profile.data.viewer?.fullName).toBe('Verified Viewer');

    const reg = await apiClient.registerDevice({
      deviceId: 'test-device-uuid',
      platform: 'ios',
      pushToken: 'ExponentPushToken[abc]',
      locale: 'en',
    });
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/devices/register');
    expect(reg.data.registered).toBe(true);
  });
});

describe("Phase 2 API contract hardening and error model", () => {
  beforeEach(async () => {
    await apiClient.setAccessToken(null);
    apiClient.setTokenExpiredHandler(async () => false);
  });

  it("configures a default bounded request timeout of 15 seconds", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(15000);
  });

  it("handles successful response and captures x-request-id in meta", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "ev-1", title: "Test Event" }],
          meta: { requestId: "req-success-123" },
        }),
        {
          headers: { "content-type": "application/json", "x-request-id": "req-success-123" },
          status: 200,
        },
      ),
    );
    global.fetch = fetchMock as never;

    const res = await apiClient.getEvents("en");
    expect(res.events).toHaveLength(1);
    expect(res.meta?.requestId).toBe("req-success-123");
  });

  it("handles empty successful response without error", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          page: { hasNextPage: false, nextCursor: null },
          meta: { requestId: "req-empty-1" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    global.fetch = fetchMock as never;

    const res = await apiClient.getEvents("en");
    expect(res.events).toEqual([]);
    expect(res.page?.hasNextPage).toBe(false);
  });

  it("handles 401 authentication error and clears local access token", async () => {
    await apiClient.setAccessToken("expired-tok");
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "authentication_required", message: "Sign in required", requestId: "req-401" },
        }),
        { headers: { "content-type": "application/json" }, status: 401 },
      ),
    );
    global.fetch = fetchMock as never;

    await expect(apiClient.getViewerProfile("en")).rejects.toThrow(ApiError);
    expect(apiClient.hasStoredAccessToken()).toBe(false);
  });

  it("handles 403 authorization error without triggering token refresh", async () => {
    await apiClient.setAccessToken("valid-user-tok");
    const refreshSpy = jest.fn().mockResolvedValue(true);
    apiClient.setTokenExpiredHandler(refreshSpy);

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "forbidden", message: "Only active members can access", requestId: "req-403" },
        }),
        { headers: { "content-type": "application/json", "x-request-id": "req-403" }, status: 403 },
      ),
    );
    global.fetch = fetchMock as never;

    let caughtError: ApiError | null = null;
    try {
      await apiClient.getDiscussions("group-private", "en");
    } catch (err) {
      caughtError = err as ApiError;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError?.status).toBe(403);
    expect(caughtError?.code).toBe("forbidden");
    expect(caughtError?.isForbidden).toBe(true);
    expect(caughtError?.isAuthError).toBe(false);
    expect(caughtError?.requestId).toBe("req-403");
    // CRITICAL: 403 must NOT trigger token refresh!
    expect(refreshSpy).not.toHaveBeenCalled();
    // 403 must NOT clear access token
    expect(apiClient.hasStoredAccessToken()).toBe(true);
  });

  it("handles 404 not found with machine-readable error code", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "event_not_found", message: "Event not found", requestId: "req-404" },
        }),
        { headers: { "content-type": "application/json" }, status: 404 },
      ),
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.getEvent("missing-event");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(404);
    expect(caught?.code).toBe("event_not_found");
    expect(caught?.isNotFound).toBe(true);
  });

  it("handles 409 conflict (e.g. event_cancelled)", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "event_cancelled", message: "Event cancelled", requestId: "req-409" },
        }),
        { headers: { "content-type": "application/json" }, status: 409 },
      ),
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("cancelled-event", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(409);
    expect(caught?.code).toBe("event_cancelled");
    expect(caught?.isConflict).toBe(true);
  });

  it("handles 400 validation error with details array", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "validation_failed",
            message: "The request is invalid.",
            details: [{ field: "limit", code: "out_of_range" }],
            requestId: "req-val-1",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 400 },
      ),
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.getEvents({ limit: 999 });
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(400);
    expect(caught?.code).toBe("validation_failed");
    expect(caught?.isValidationError).toBe(true);
    expect(caught?.details).toEqual([{ field: "limit", code: "out_of_range" }]);
  });

  it("handles 500 server error", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "internal_error", message: "Internal server error" },
        }),
        { headers: { "content-type": "application/json" }, status: 500 },
      ),
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.getEvents("en");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(500);
    expect(caught?.isServerError).toBe(true);
  });

  it("handles network failure (fetch rejected)", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("Network connection lost"));
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.getEvents("en");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(0);
    expect(caught?.code).toBe("network_error");
    expect(caught?.isNetworkError).toBe(true);
  });

  it("handles invalid JSON responses gracefully", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response("<html>Bad Gateway 502</html>", {
        headers: { "content-type": "application/json" },
        status: 502,
      }),
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.getEvents("en");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.code).toBe("invalid_json");
    expect(caught?.status).toBe(502);
  });

  it("executes a single 401 refresh retry cycle and succeeds", async () => {
    await apiClient.setAccessToken("stale-tok");
    let refreshAttempts = 0;
    apiClient.setTokenExpiredHandler(async () => {
      refreshAttempts++;
      await apiClient.setAccessToken("fresh-tok");
      return true;
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "token_expired", message: "Expired" } }),
          { headers: { "content-type": "application/json" }, status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { viewer: { id: "u-1", email: "u@ex.local", fullName: "U", emailVerified: true, roles: ["user"] }, locale: "en" },
            meta: { requestId: "req-refreshed" },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );
    global.fetch = fetchMock as never;

    const res = await apiClient.getViewerProfile("en");
    expect(refreshAttempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.data.viewer?.id).toBe("u-1");
  });

  it("posts discussions to versioned /api/v1/groups/:id/discussions route", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "post-v1-new",
            authorId: "user-1",
            authorName: "Vipin",
            body: "New v1 discussion message",
            pinned: false,
            createdAt: "2026-09-18T20:00:00.000Z",
          },
          meta: { requestId: "req-disc-post-1" },
        }),
        { headers: { "content-type": "application/json" }, status: 201 },
      ),
    );
    global.fetch = fetchMock as never;

    const result = await apiClient.createDiscussion("group-123", "New v1 discussion message");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/api/v1/groups/group-123/discussions");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({
      body: "New v1 discussion message",
      pinned: false,
    });
    // Supports both .post and .data for backward and forward compatibility
    expect(result.post.id).toBe("post-v1-new");
    expect(result.data.id).toBe("post-v1-new");
  });

  it("revokes token durably via /api/v1/auth/revoke on logout", async () => {
    await apiClient.setAccessToken("token-to-revoke");
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { revoked: true },
          meta: { requestId: "req-revoke-1" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    global.fetch = fetchMock as never;

    await apiClient.logout();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/api/v1/auth/revoke");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({ token: "token-to-revoke" });
    expect(apiClient.hasStoredAccessToken()).toBe(false);
  });

  describe("Production API Security Policy", () => {
    const origEnv = process.env;

    afterEach(() => {
      process.env = origEnv;
    });

    it("enforces canonical origin https://samgamam.com in production", () => {
      process.env = { ...origEnv, APP_ENV: "production" };
      expect(apiClient.getBaseUrl()).toBe("https://samgamam.com");
    });

    it("ignores and clears previously stored development API override in production", async () => {
      process.env = { ...origEnv, APP_ENV: "production" };
      jest.spyOn(SecureStore, "getItemAsync").mockImplementation((async (...args: unknown[]) => {
        const key = args[0] as string;
        if (key === "samgamam.api_base_url") return "https://dev-override.example.com";
        return null;
      }) as any);
      const deleteSpy = jest.spyOn(SecureStore, "deleteItemAsync");

      const freshClient = new ApiClient();
      const state = await freshClient.initialize();
      expect(state.apiBaseUrl).toBe("https://samgamam.com");
      expect(freshClient.getBaseUrl()).toBe("https://samgamam.com");
      expect(deleteSpy).toHaveBeenCalledWith("samgamam.api_base_url");
    });

    it("disables setApiBaseUrl in production and throws error", async () => {
      process.env = { ...origEnv, APP_ENV: "production" };
      const freshClient = new ApiClient();
      await expect(freshClient.setApiBaseUrl("https://attacker.example.com")).rejects.toThrow(
        "Overriding API base URL is disabled in production."
      );
      expect(freshClient.getBaseUrl()).toBe("https://samgamam.com");
    });

    it("validates approved production origin strictly", () => {
      process.env = {
        ...origEnv,
        APP_ENV: "production",
        EXPO_PUBLIC_AUTH0_DOMAIN: "tenant.example.invalid",
        EXPO_PUBLIC_AUTH0_CLIENT_ID: "client-id",
        EXPO_PUBLIC_AUTH0_AUDIENCE: "audience",
        EXPO_PUBLIC_API_URL: "https://api.samgamam.com",
      };
      const freshClient = new ApiClient();
      expect(freshClient.getBaseUrl()).toBe("https://api.samgamam.com");
    });
  });
});
