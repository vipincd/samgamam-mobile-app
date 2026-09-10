import { getTabs, productionTabs, reconcileProductSession } from './App';

describe('navigation isolation', () => {
  it('keeps production navigation at exactly four canonical tabs', () => {
    expect(getTabs(false)).toEqual(productionTabs);
    expect(getTabs(false).map((tab) => tab.key)).toEqual([
      'discover',
      'groups',
      'help',
      'profile',
    ]);
  });

  it('adds Auth Test only in development', () => {
    expect(getTabs(true).map((tab) => tab.key)).toEqual([
      'discover',
      'groups',
      'help',
      'profile',
      'auth-test',
    ]);
  });
});

describe('product session reconciliation', () => {
  it('returns signed-out when no stored access token exists', async () => {
    const mockClient = {
      hasStoredAccessToken: jest.fn(() => false),
      getSession: jest.fn(),
    };

    const result = await reconcileProductSession(mockClient as never);
    expect(result).toEqual({
      status: 'signed-out',
      session: { authenticated: false, locale: 'en', viewer: null },
      errorMessage: null,
    });
    expect(mockClient.getSession).not.toHaveBeenCalled();
  });

  it('returns authenticated when session is verified by backend', async () => {
    const mockViewer = {
      id: 'vipin-id',
      email: 'vipin@example.local',
      fullName: 'Vipin organizer',
      emailVerified: true,
      roles: ['organizer' as const],
    };
    const mockClient = {
      hasStoredAccessToken: jest.fn(() => true),
      getSession: jest.fn().mockResolvedValue({
        authenticated: true,
        locale: 'en',
        viewer: mockViewer,
      }),
    };

    const result = await reconcileProductSession(mockClient as never);
    expect(result).toEqual({
      status: 'authenticated',
      session: { authenticated: true, locale: 'en', viewer: mockViewer },
      errorMessage: null,
    });
  });

  it('returns signed-out when 401 unauthenticated response cleared stored token', async () => {
    let hasToken = true;
    const mockClient = {
      hasStoredAccessToken: jest.fn(() => hasToken),
      getSession: jest.fn().mockImplementation(async () => {
        hasToken = false;
        throw new Error('Unauthorized');
      }),
    };

    const result = await reconcileProductSession(mockClient as never);
    expect(result).toEqual({
      status: 'signed-out',
      session: { authenticated: false, locale: 'en', viewer: null },
      errorMessage: null,
    });
  });

  it('returns reconciliation-failed and preserves credentials when network is unreachable', async () => {
    const mockClient = {
      hasStoredAccessToken: jest.fn(() => true),
      getSession: jest.fn().mockRejectedValue(new Error('Network request failed')),
    };

    const result = await reconcileProductSession(mockClient as never);
    expect(result.status).toBe('reconciliation-failed');
    expect(result.session.authenticated).toBe(false);
    expect(result.errorMessage).toBe('Network request failed');
    expect(mockClient.hasStoredAccessToken).toHaveBeenCalled();
  });
});
