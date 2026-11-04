import React from 'react';
import { act, create } from 'react-test-renderer';
import App from './App';
import { sessionManager } from './src/auth/session';
import { registerDevicePushTokenAsync, addPushTokenListener } from './src/services/notifications';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./src/startup/useLaunchResources', () => ({ useLaunchResources: () => ({ ready: false, error: false, retry: jest.fn() }) }));
jest.mock('./src/startup/BrandedLaunch', () => ({ BrandedLaunch: () => null }));
jest.mock('./src/auth/session', () => ({ sessionManager: { getState: jest.fn(), subscribe: jest.fn(() => jest.fn()), initialize: jest.fn() } }));
jest.mock('./src/services/notifications', () => ({
  configureForegroundNotifications: jest.fn(),
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  checkColdStartNotificationAsync: jest.fn(async () => null),
  registerDevicePushTokenAsync: jest.fn(async () => undefined),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

it('registers push for the SessionManager signedIn state and removes its listener on unmount', async () => {
  const state = { status: 'signedIn', session: { authenticated: true, locale: 'en', viewer: { id: 'qa-user' } }, errorMessage: null };
  (sessionManager.getState as jest.Mock).mockReturnValue(state);
  (sessionManager.initialize as jest.Mock).mockResolvedValue(state);
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<App />); });
  expect(registerDevicePushTokenAsync).toHaveBeenCalledWith(expect.anything(), 'qa-user', { locale: 'en' });
  const subscription = (addPushTokenListener as jest.Mock).mock.results[0].value;
  await act(async () => tree!.unmount());
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});
it('does not register a signed-out user', async () => {
  jest.clearAllMocks();
  const state = { status: 'signedOut', session: { authenticated: false, locale: 'en', viewer: null }, errorMessage: null };
  (sessionManager.getState as jest.Mock).mockReturnValue(state);
  (sessionManager.initialize as jest.Mock).mockResolvedValue(state);
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<App />); });
  expect(registerDevicePushTokenAsync).not.toHaveBeenCalled();
  await act(async () => tree!.unmount());
});
