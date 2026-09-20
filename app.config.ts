import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';
import { readOptionalAuth0Configuration, validateAppEnvironment } from './src/auth/config';

export const AUTH0_CUSTOM_SCHEME = 'samgamam';
export const IOS_BUNDLE_IDENTIFIER = 'com.samgamam.mobile';
export const ANDROID_PACKAGE = 'com.samgamam.mobile';

export { readOptionalAuth0Configuration, validateAppEnvironment };

export default ({ config }: ConfigContext): ExpoConfig => {
  const validated = validateAppEnvironment(process.env);
  const auth0 = validated.auth0;
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
