import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type { ApiClient } from '../api/client';
import { NavigationTarget, parseNotificationData } from './deep-links';

const DEVICE_ID_KEY = 'samgamam_device_id';
const LAST_TOKEN_KEY = 'samgamam_last_registered_token';
const LAST_USER_KEY = 'samgamam_last_registered_user';

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

export function resolveEasProjectId(): string | undefined {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()) {
    return process.env.EXPO_PUBLIC_EAS_PROJECT_ID.trim();
  }
  return undefined;
}

export async function setupAndroidNotificationChannelAsync(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Samgamam Updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    } catch {
      // Ignore channel setup errors in non-Android or mock environments
    }
  }
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing && existing.length >= 8 && existing.length <= 256) {
      return existing;
    }
    const newId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return `dev-fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function checkPushPermissionAsync(): Promise<PushPermissionState> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.status === 'granted') {
      return 'granted';
    }
    if (settings.status === 'denied') {
      return 'denied';
    }
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export async function requestPushPermissionAsync(): Promise<PushPermissionState> {
  try {
    const settings = await Notifications.requestPermissionsAsync();
    if (settings.granted || settings.status === 'granted') {
      return 'granted';
    }
    if (settings.status === 'denied') {
      return 'denied';
    }
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export async function registerDevicePushTokenAsync(
  client: ApiClient,
  userId: string,
  options?: { appVersion?: string; locale?: string; forcePrompt?: boolean; projectId?: string }
): Promise<{ registered: boolean; token?: string; error?: string }> {
  // Only iOS and Android support native push registrations
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { registered: false, error: 'unsupported_platform' };
  }

  try {
    await setupAndroidNotificationChannelAsync();

    let permission = await checkPushPermissionAsync();
    if (permission === 'undetermined' && options?.forcePrompt) {
      permission = await requestPushPermissionAsync();
    }

    if (permission !== 'granted') {
      return { registered: false, error: 'permission_not_granted' };
    }

    const resolvedProjectId = options?.projectId || resolveEasProjectId();
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      resolvedProjectId ? { projectId: resolvedProjectId } : undefined
    );
    const pushToken = tokenResult?.data;

    if (!pushToken || typeof pushToken !== 'string' || pushToken.length < 16) {
      return { registered: false, error: 'invalid_token_retrieved' };
    }

    const deviceId = await getOrCreateDeviceId();
    const lastToken = await SecureStore.getItemAsync(LAST_TOKEN_KEY).catch(() => null);
    const lastUser = await SecureStore.getItemAsync(LAST_USER_KEY).catch(() => null);

    // If already registered with this exact token for this user, avoid redundant network requests
    if (lastToken === pushToken && lastUser === userId) {
      return { registered: true, token: pushToken };
    }

    await client.registerDevice({
      deviceId,
      platform: Platform.OS,
      pushToken,
      appVersion: options?.appVersion ?? '1.0.0',
      locale: options?.locale ?? 'en',
    });

    await SecureStore.setItemAsync(LAST_TOKEN_KEY, pushToken).catch(() => {});
    await SecureStore.setItemAsync(LAST_USER_KEY, userId).catch(() => {});

    return { registered: true, token: pushToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { registered: false, error: message };
  }
}

export async function unregisterDeviceOnLogoutAsync(
  client: ApiClient
): Promise<{ unregistered: boolean; error?: string }> {
  try {
    const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
    await SecureStore.deleteItemAsync(LAST_TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(LAST_USER_KEY).catch(() => {});

    if (deviceId) {
      await client.unregisterDevice(deviceId);
      return { unregistered: true };
    }

    return { unregistered: false };
  } catch (error) {
    // Non-blocking: security-critical logout must not be aborted on unregister failure
    const message = error instanceof Error ? error.message : String(error);
    return { unregistered: false, error: message };
  }
}

export function configureForegroundNotifications(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority?.HIGH,
      }),
    });
  } catch {
    // Ignore in unsupported environments
  }
}

export function addNotificationResponseListener(
  onNavigate: (target: NavigationTarget) => void
): { remove: () => void } {
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      const target = parseNotificationData(data);
      onNavigate(target);
    });
    return {
      remove: () => {
        subscription.remove();
      },
    };
  } catch {
    return { remove: () => {} };
  }
}

export async function checkColdStartNotificationAsync(): Promise<NavigationTarget | null> {
  try {
    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    if (lastResponse) {
      const data = lastResponse?.notification?.request?.content?.data;
      return parseNotificationData(data);
    }
  } catch {
    // Fall through
  }
  return null;
}

export function addPushTokenListener(
  onTokenChange: (token: string) => void
): { remove: () => void } {
  try {
    const subscription = Notifications.addPushTokenListener((token) => {
      if (token?.data) {
        onTokenChange(token.data);
      }
    });
    return {
      remove: () => subscription.remove(),
    };
  } catch {
    return { remove: () => {} };
  }
}
