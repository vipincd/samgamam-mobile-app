import * as SecureStore from 'expo-secure-store';
import { SessionManager } from './session';
import { apiClient } from '../api/client';
import type { AuthenticationClient } from './auth0';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, val: string) => { store.set(key, val); }),
    deleteItemAsync: jest.fn(async (key: string) => { store.delete(key); }),
    _clear: () => store.clear(),
  };
});

describe('SessionManager & Token Lifecycle', () => {
  let mockAuth0: {
    checkCredentials: jest.Mock;
    getCredentials: jest.Mock;
    getAccessToken: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore as unknown as { _clear: () => void })._clear();

    mockAuth0 = {
      checkCredentials: jest.fn().mockResolvedValue({ status: 'signed-out' }),
      getCredentials: jest.fn().mockResolvedValue({
        accessToken: 'mock-auth0-access-token',
        idToken: 'header.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIn0.sig',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
      getAccessToken: jest.fn().mockResolvedValue('mock-auth0-access-token'),
      login: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('1. auth-state transitions: initializes to signedOut when no credentials exist', async () => {
    const manager = new SessionManager(mockAuth0 as unknown as AuthenticationClient); void manager;
    const states: string[] = [];
    manager.subscribe((s) => states.push(s.status));

    const result = await manager.initialize();
    expect(result.status).toBe('signedOut');
    expect(result.session.authenticated).toBe(false);
    expect(states).toContain('initializing');
    expect(states).toContain('signedOut');
  });

  it('2. session restoration: restores active session when valid credentials exist', async () => {
    mockAuth0.checkCredentials.mockResolvedValue({ status: 'signed-in' });
    jest.spyOn(apiClient, 'establishAuth0Session').mockResolvedValue({
      accessToken: 'samgamam-session-token-123',
      locale: 'en',
      viewer: {
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Test User',
        emailVerified: true,
        roles: ['user'],
      },
    });

    const manager = new SessionManager(mockAuth0 as unknown as AuthenticationClient); void manager;
    const result = await manager.initialize();

    expect(result.status).toBe('signedIn');
    expect(result.session.authenticated).toBe(true);
    expect(result.session.viewer?.email).toBe('user@example.com');
  });

  it('3. sign-in flow: executes Auth0 login, exchanges credentials, and transitions to signedIn', async () => {
    jest.spyOn(apiClient, 'establishAuth0Session').mockResolvedValue({
      accessToken: 'backend-session-jwt',
      locale: 'en',
      viewer: {
        id: 'auth0-user-99',
        email: 'member@samgamam.org',
        fullName: 'Samgamam Member',
        emailVerified: true,
        roles: ['user'],
      },
    });

    const manager = new SessionManager(mockAuth0 as unknown as AuthenticationClient); void manager;
    await manager.signIn();

    expect(mockAuth0.login).toHaveBeenCalled();
    expect(mockAuth0.getCredentials).toHaveBeenCalled();
    expect(manager.getState().status).toBe('signedIn');
    expect(manager.getState().session.authenticated).toBe(true);
    expect(manager.getState().session.viewer?.email).toBe('member@samgamam.org');
  });

  it('4. logout cleanup: clears Auth0 credentials, backend session, and resets to signedOut', async () => {
    const logoutSpy = jest.spyOn(apiClient, 'logout').mockResolvedValue(undefined);
    await apiClient.setAccessToken('existing-token');

    const manager = new SessionManager(mockAuth0 as unknown as AuthenticationClient); void manager;
    await manager.signOut();

    expect(logoutSpy).toHaveBeenCalled();
    expect(mockAuth0.logout).toHaveBeenCalled();
    expect(apiClient.hasStoredAccessToken()).toBe(false);
    expect(manager.getState().status).toBe('signedOut');
    expect(manager.getState().session.authenticated).toBe(false);
  });

  it('5. token lifecycle: 401 response triggers refresh once and retries original request', async () => {
    const manager = new SessionManager(mockAuth0 as unknown as AuthenticationClient); void manager;
    await apiClient.setAccessToken('initial-expired-token');

    // Mock establishAuth0Session for the refresh
    jest.spyOn(apiClient, 'establishAuth0Session').mockResolvedValue({
      accessToken: 'refreshed-backend-token',
      locale: 'en',
      viewer: {
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Test User',
        emailVerified: true,
        roles: ['user'],
      },
    });

    // Mock global fetch to return 401 on first call, then 200 on retry
    let callCount = 0;
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: { code: 'invalid_access_token', message: 'Token expired' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: {
            viewer: { id: 'user-1', email: 'user@example.com', fullName: 'Test User', roles: ['user'], emailVerified: true },
            locale: 'en',
          },
          meta: { requestId: 'req-retry' },
        }),
      };
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as never;

    // Trigger authenticated request
    const profile = await apiClient.getViewerProfile();

    expect(profile.data.viewer?.email).toBe('user@example.com');
    // First request failed with 401, then establishAuth0Session (/v1/auth/session), then retry of /v1/me
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(mockAuth0.getCredentials).toHaveBeenCalledWith(true); // forceRefresh = true
  });

  it('6. failed refresh path: when refresh fails, clears session and transitions to expired without infinite loop', async () => {
    mockAuth0.getCredentials.mockRejectedValue(new Error('Refresh token revoked'));

    const manager = new SessionManager(mockAuth0 as unknown as AuthenticationClient); void manager;
    await apiClient.setAccessToken('expired-token');

    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: { code: 'invalid_access_token', message: 'Token expired' } }),
    }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as never;

    await expect(apiClient.getViewerProfile()).rejects.toThrow();
    expect(manager.getState().status).toBe('expired');
    expect(apiClient.hasStoredAccessToken()).toBe(false);
  });
});
