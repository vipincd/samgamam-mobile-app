import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const LOCAL_AUTH_SCHEME = 'samgamam';
const IOS_BUNDLE_ID = 'com.samgamam.mobile.poc';
const ANDROID_PACKAGE = 'com.samgamam.mobile.poc';

export default ({ config }: ConfigContext): ExpoConfig => {
  const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim();
  const supplied = [domain, clientId, audience].filter(Boolean).length;

  if (supplied !== 0 && supplied !== 3) {
    throw new Error('Auth0 POC configuration requires domain, client ID, and audience together.');
  }

  const base = appJson.expo as ExpoConfig;
  return {
    ...config,
    ...base,
    ios: {...base.ios, bundleIdentifier: IOS_BUNDLE_ID},
    android: {...base.android, package: ANDROID_PACKAGE},
    plugins: [
      ...(base.plugins ?? []),
      ...(domain ? [['react-native-auth0', {domain, customScheme: LOCAL_AUTH_SCHEME}] as [string, Record<string, string>]] : []),
    ],
    extra: {
      ...base.extra,
      auth0PocConfigured: supplied === 3,
    },
  };
};
