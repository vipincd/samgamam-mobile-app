import type { Credentials } from 'react-native-auth0';

import {
  AuthenticationError,
  createAuthenticationClient,
  getSanitizedAuthMessage,
} from './auth0';

const credentials = {
  accessToken: 'opaque-test-value',
  expiresAt: 2_000_000_000,
  idToken: 'opaque-id-value',
  tokenType: 'Bearer',
} as Credentials;

function createSdkDouble() {
  return {
    credentialsManager: {
      clearCredentials: jest.fn(async () => undefined),
      getCredentials: jest.fn(async () => credentials),
      hasValidCredentials: jest.fn(async () => true),
      saveCredentials: jest.fn(async () => undefined),
    },
    webAuth: {
      authorize: jest.fn(async () => credentials),
      clearSession: jest.fn(async () => undefined),
    },
  };
}

describe('isolated Auth0 client', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_AUTH0_DOMAIN = 'tenant.example.invalid';
    process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID = 'public-client-id';
    process.env.EXPO_PUBLIC_AUTH0_AUDIENCE = 'https://api.example.invalid';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
    delete process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
  });

  it('sanitizes unknown errors without exposing their message', () => {
    const message = getSanitizedAuthMessage(
      new Error('sensitive provider detail: opaque-test-value'),
    );
    expect(message).toBe('The development authentication check failed.');
    expect(message).not.toContain('opaque-test-value');
  });

  it('saves credentials returned by authorize with audience and required scopes', async () => {
    const sdk = createSdkDouble();
    const client = createAuthenticationClient(sdk as never)!;
    await client.login();

    expect(sdk.webAuth.authorize).toHaveBeenCalledWith(
      {
        audience: 'https://api.example.invalid',
        scope: 'openid profile email offline_access',
      },
      { customScheme: 'samgamam' },
    );
    expect(sdk.credentialsManager.saveCredentials).toHaveBeenCalledWith(credentials);
  });

  it('restores safe session state from Credentials Manager', async () => {
    const sdk = createSdkDouble();
    const client = createAuthenticationClient(sdk as never)!;
    await expect(client.checkCredentials()).resolves.toEqual({
      expiresAt: new Date(credentials.expiresAt * 1000).toISOString(),
      status: 'signed-in',
    });
    expect(sdk.credentialsManager.hasValidCredentials).toHaveBeenCalled();
    expect(sdk.credentialsManager.getCredentials).toHaveBeenCalled();
  });

  it('forces refresh through Credentials Manager', async () => {
    const sdk = createSdkDouble();
    const client = createAuthenticationClient(sdk as never)!;
    await client.getAccessToken(true);
    expect(sdk.credentialsManager.getCredentials).toHaveBeenCalledWith(
      undefined,
      60,
      {},
      true,
    );
  });

  it('clears local credentials even when provider logout fails', async () => {
    const sdk = createSdkDouble();
    sdk.webAuth.clearSession.mockRejectedValueOnce(new Error('provider detail'));
    const client = createAuthenticationClient(sdk as never)!;
    await expect(client.logout()).rejects.toEqual(new AuthenticationError('provider'));
    expect(sdk.credentialsManager.clearCredentials).toHaveBeenCalled();
  });
});
