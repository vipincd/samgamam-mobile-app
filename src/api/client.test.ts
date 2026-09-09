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
