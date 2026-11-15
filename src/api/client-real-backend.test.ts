import { apiClient } from './client';

describe('real backend live integration against /api/v1', () => {
  const REAL_BACKEND_URL =
    process.env.REAL_BACKEND_URL || '';

  beforeAll(async () => {
    if (process.env.RUN_STAGING_INTEGRATION !== '1' || !REAL_BACKEND_URL ||
        !process.env.STAGING_TEST_EMAIL || !process.env.STAGING_TEST_PASSWORD ||
        !process.env.STAGING_TEST_EVENT_ID) {
      throw new Error('Staging integration requires explicit opt-in, URL, owned test credentials and an owned test event.');
    }
    const url = new URL(REAL_BACKEND_URL);
    const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
    if (['samgamam.com', 'www.samgamam.com', 'api.samgamam.com'].includes(url.hostname) ||
        (!local && url.protocol !== 'https:') || url.username || url.password) {
      throw new Error('Production or insecure staging integration target is not allowed.');
    }

    let isBackendLive = false;
    try {
      const res = await fetch(`${REAL_BACKEND_URL}/api/healthz`);
      isBackendLive = res.ok;
    } catch {
      isBackendLive = false;
    }

    if (!isBackendLive) {
      throw new Error(
        `Real backend is unavailable at ${REAL_BACKEND_URL}. Live integration tests require a running backend server. Start the server (e.g. PORT=3002 npm run dev) before running this test.`,
      );
    }
  });

  afterAll(async () => {
    if (apiClient.hasStoredAccessToken()) {
      await apiClient.unregisterDevice('iphone17-sim-integration-uuid').catch(() => undefined);
      if (process.env.STAGING_TEST_EVENT_ID) await apiClient.cancelRsvp(process.env.STAGING_TEST_EVENT_ID).catch(() => undefined);
      await apiClient.logout();
    }
  });

  it('verifies real backend healthz, auth login, and v1 endpoints', async () => {
    await apiClient.setApiBaseUrl(REAL_BACKEND_URL);

    // 1. Health
    const health = await apiClient.healthCheck();
    expect(health.status).toBe('ok');

    // 2. Discover: getEvents via /api/v1/events
    const eventsRes = await apiClient.getEvents('en');
    expect(eventsRes.data).toBeDefined();
    expect(eventsRes.events).toBeDefined();
    expect(Array.isArray(eventsRes.events)).toBe(true);
    if (eventsRes.events.length > 0) {
      const e = eventsRes.events[0];
      expect(e.id).toBeDefined();
      expect(e.title).toBeDefined();
      if (typeof e.attendeeCount !== 'undefined') {
        expect(typeof e.attendeeCount).toBe('number');
      }
      expect(e.timeZone).toBe('UTC');
    }

    // 3. Discover: searchEvents via /api/v1/events?q=...
    const searchRes = await apiClient.searchEvents('reunion', 'en');
    expect(searchRes.items).toBeDefined();
    expect(Array.isArray(searchRes.items)).toBe(true);

    // 4. Session Login: login with demo user
    const login = await apiClient.login(process.env.STAGING_TEST_EMAIL!, process.env.STAGING_TEST_PASSWORD!);
    expect(login.accessToken).toBeDefined();
    expect(login.viewer.email).toBe(process.env.STAGING_TEST_EMAIL);

    // 5. Profile: getSession uses /api/v1/me with Bearer token
    const session = await apiClient.getSession();
    expect(session.authenticated).toBe(true);
    expect(session.viewer?.email).toBe(process.env.STAGING_TEST_EMAIL);

    // 6. Profile: getViewerProfile uses /api/v1/me
    const profile = await apiClient.getViewerProfile('en');
    expect(profile.data.viewer?.email).toBe(process.env.STAGING_TEST_EMAIL);
    expect(profile.meta.requestId).toBeDefined();

    // 7. Groups: getGroups uses /api/v1/groups
    const groupsRes = await apiClient.getGroups('en');
    expect(groupsRes.groups).toBeDefined();
    expect(Array.isArray(groupsRes.groups)).toBe(true);
    if (groupsRes.groups.length > 0) {
      const g = groupsRes.groups[0];
      expect(g.id).toBeDefined();
      expect(g.name).toBeDefined();
      expect(typeof g.memberCount).toBe('number');
      expect(typeof g.discussionCount).toBe('number');
    }

    // 8. Discover RSVP: rsvpToEvent via /api/v1/events/{id}/rsvp
    if (eventsRes.events.length > 0) {
      const targetEvent = (await apiClient.getEvent(process.env.STAGING_TEST_EVENT_ID!)).event;
      const rsvp = await apiClient.rsvpToEvent(targetEvent.id, 'going', { termsAccepted: true, riskAcknowledged: targetEvent.requiresRiskAcknowledgement });
      expect(rsvp.event.id).toBe(targetEvent.id);
      expect(rsvp.event.viewerRsvpState).toBe('going');
      await apiClient.cancelRsvp(targetEvent.id);
    }

    // 9. Device registration: registerDevice via /api/v1/devices/register
    const deviceReg = await apiClient.registerDevice({
      deviceId: 'iphone17-sim-integration-uuid',
      platform: 'ios',
      pushToken: 'ExponentPushToken[integration-real-token]',
      locale: 'en',
      appVersion: '1.0.0',
    });
    expect(deviceReg.data.deviceId).toBe('iphone17-sim-integration-uuid');
    expect(deviceReg.data.platform).toBe('ios');
    expect(deviceReg.data.registeredAt).toBeDefined();

    // 10. Device unregistration: unregisterDevice via DELETE /api/v1/devices/register
    const deviceUnreg = await apiClient.unregisterDevice('iphone17-sim-integration-uuid');
    expect(deviceUnreg.data.unregistered).toBe(true);
  });
});
