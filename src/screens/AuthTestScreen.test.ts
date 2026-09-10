import {
  AuthenticationError,
  type AuthenticationClient,
  type AuthSessionState,
} from '../auth/auth0';
import { callAuth0PocBackend, executeAndReconcile, logoutAndReconcileSession, reconcileSession } from './AuthTestScreen';

describe('Auth Test logout session reconciliation', () => {
  const providerError = new AuthenticationError('network');
  const providerMessage = 'Authentication could not reach the provider.';
  const signedIn: AuthSessionState = {
    status: 'signed-in',
    expiresAt: '2033-05-18T03:33:20.000Z',
  };

  function createClient(session: AuthSessionState) {
    return {
      logout: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      checkCredentials: jest.fn<Promise<AuthSessionState>, []>().mockResolvedValue(session),
    };
  }

  it.each([
    ['absent', { status: 'signed-out' } as AuthSessionState],
    ['still usable', signedIn],
  ])('preserves the provider error when credentials are %s', async (_label, session) => {
    const client = createClient(session);
    client.logout.mockRejectedValue(providerError);

    const result = await logoutAndReconcileSession(client as unknown as AuthenticationClient);

    expect(result).toEqual({ session, message: providerMessage });
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(client.checkCredentials).toHaveBeenCalledTimes(1);
    expect(client.logout.mock.invocationCallOrder[0]).toBeLessThan(
      client.checkCredentials.mock.invocationCallOrder[0],
    );
  });

  it('returns a signed-out display without expiry after successful logout', async () => {
    const client = createClient({ status: 'signed-out' });
    const result = await logoutAndReconcileSession(client as unknown as AuthenticationClient);

    expect(result.session).toEqual({ status: 'signed-out' });
    expect(result.session).not.toHaveProperty('expiresAt');
    expect(result.message).toBe('Auth0 credentials were cleared.');
    expect(client.checkCredentials).toHaveBeenCalledTimes(1);
  });

  it('does not claim clearing when logout resolves but credentials remain usable', async () => {
    const client = createClient(signedIn);
    await expect(logoutAndReconcileSession(client as unknown as AuthenticationClient))
      .resolves.toEqual({
        session: signedIn,
        message: 'Auth0 credential clearing could not be confirmed.',
      });
  });

  it('uses unknown state and keeps the original logout error when reconciliation fails', async () => {
    const client = createClient(signedIn);
    client.logout.mockRejectedValue(providerError);
    client.checkCredentials.mockRejectedValue(new AuthenticationError('credentials'));

    await expect(logoutAndReconcileSession(client as unknown as AuthenticationClient))
      .resolves.toEqual({ session: { status: 'unknown' }, message: providerMessage });
  });

  it('sanitizes a reconciliation failure after successful logout without claiming success', async () => {
    const client = createClient(signedIn);
    client.checkCredentials.mockRejectedValue(new Error('synthetic private diagnostic'));

    await expect(logoutAndReconcileSession(client as unknown as AuthenticationClient))
      .resolves.toEqual({
        session: { status: 'unknown' },
        message: 'The development authentication check failed.',
      });
  });
});

describe('Auth0 development backend call', () => {
  it('does not fetch when credentials are unavailable', async () => {
    const client = {
      getAccessToken: jest.fn(async () => {
        throw new AuthenticationError('credentials');
      }),
    } as unknown as AuthenticationClient;
    const fetchImplementation = jest.fn();

    await expect(
      callAuth0PocBackend(client, fetchImplementation as never),
    ).rejects.toEqual(new AuthenticationError('credentials'));
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe('Auth0 credential reconciliation', () => {
  it('uses unknown state rather than a stale signed-out state when credential lookup fails', async () => {
    const client = {
      checkCredentials: jest.fn().mockRejectedValue(new AuthenticationError('network')),
    } as unknown as AuthenticationClient;

    await expect(reconcileSession(client)).resolves.toEqual({
      session: {status: 'unknown'},
      message: 'Authentication could not reach the provider.',
    });
  });

  it('uses unconfigured state only when no configured client exists', async () => {
    await expect(reconcileSession(undefined)).resolves.toEqual({
      session: {status: 'unconfigured'},
    });
  });
});

describe('Auth Test non-logout action execution and reconciliation', () => {
  const signedIn: AuthSessionState = {
    status: 'signed-in',
    expiresAt: '2033-05-18T03:33:20.000Z',
  };

  it('reconciles session after successful action', async () => {
    const client = {
      checkCredentials: jest.fn().mockResolvedValue(signedIn),
    } as unknown as AuthenticationClient;

    const action = jest.fn().mockResolvedValue('Action succeeded.');
    const result = await executeAndReconcile(client, action);

    expect(result).toEqual({
      session: signedIn,
      message: 'Action succeeded.',
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(client.checkCredentials).toHaveBeenCalledTimes(1);
  });

  it('transitions to unknown when action fails and credentials cannot be confirmed', async () => {
    const client = {
      checkCredentials: jest.fn().mockRejectedValue(new AuthenticationError('network')),
    } as unknown as AuthenticationClient;

    const action = jest.fn().mockRejectedValue(new AuthenticationError('network'));
    const result = await executeAndReconcile(client, action);

    expect(result).toEqual({
      session: { status: 'unknown' },
      message: 'Authentication could not reach the provider.',
    });
    expect(client.checkCredentials).toHaveBeenCalledTimes(1);
  });

  it('sanitizes backend HTTP status errors without exposing internal traces', async () => {
    const client = {
      checkCredentials: jest.fn().mockResolvedValue(signedIn),
    } as unknown as AuthenticationClient;

    const action = jest.fn().mockRejectedValue(new Error('backend_status_500'));
    const result = await executeAndReconcile(client, action);

    expect(result).toEqual({
      session: signedIn,
      message: 'The development backend rejected the request.',
    });
  });
});
