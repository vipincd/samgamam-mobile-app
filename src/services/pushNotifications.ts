import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';

export type PushRegistrationResult =
  | {
      message: string;
      status: 'blocked' | 'unavailable';
      token?: undefined;
      platform?: undefined;
    }
  | {
      message: string;
      platform: 'android' | 'ios' | 'web';
      status: 'registered';
      token: string;
    };

function getProjectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.expoConfig?.extra?.projectId
  );
}

function getPlatform(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }

  return 'web';
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return {
      message: 'Push notifications need a physical device for realistic staging tests.',
      status: 'unavailable',
    };
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') {
    return {
      message: 'Push permission was not granted. In-app notifications will still work.',
      status: 'blocked',
    };
  }

  const projectId = getProjectId();

  if (!projectId) {
    return {
      message: 'Set an Expo project ID before registering production push tokens.',
      status: 'unavailable',
    };
  }

  const response = await Notifications.getExpoPushTokenAsync({projectId});

  return {
    message: 'Push notifications are enabled for this device.',
    platform: getPlatform(),
    status: 'registered',
    token: response.data,
  };
}
