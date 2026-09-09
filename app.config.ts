import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

export const AUTH0_CUSTOM_SCHEME = 'samgamam';
export const IOS_BUNDLE_IDENTIFIER = 'com.samgamam.mobile';
export const ANDROID_PACKAGE = 'com.samgamam.mobile';

type PublicEnvironment = Record<string, string | undefined>;

export function readOptionalAuth0Configuration(
  environment: PublicEnvironment = process.env,
) {
  const domain = environment.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  const clientId = environment.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const audience = environment.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim();
  const suppliedCount = [domain, clientId, audience].filter(Boolean).length;

  if (suppliedCount !== 0 && suppliedCount !== 3) {
    throw new Error(
      'Auth0 development configuration requires domain, client ID, and audience together.',
    );
  }

  if (suppliedCount === 0) {
    return undefined;
  }

  return {
    audience: audience as string,
    clientId: clientId as string,
    domain: domain as string,
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const auth0 = readOptionalAuth0Configuration();
  const base = appJson.expo as ExpoConfig;

  return {
    ...config,
    ...base,
    android: {
      ...base.android,
      package: ANDROID_PACKAGE,
    },
    ios: {
      ...base.ios,
      bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    },
    plugins: [
      ...(base.plugins ?? []),
      ...(auth0
        ? [
            [
              'react-native-auth0',
              { customScheme: AUTH0_CUSTOM_SCHEME, domain: auth0.domain },
            ] as [string, Record<string, string>],
          ]
        : []),
    ],
  };
};
