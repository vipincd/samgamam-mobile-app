import * as SecureStore from 'expo-secure-store';

import { apiClient } from './client';

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
});
