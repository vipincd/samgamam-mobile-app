import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json' with { type: 'json' };

export const AUTH0_CUSTOM_SCHEME = 'samgamam';
export const IOS_BUNDLE_IDENTIFIER = 'com.samgamam.mobile';
export const ANDROID_PACKAGE = 'com.samgamam.mobile';
export const CANONICAL_PRODUCTION_API_URL = 'https://samgamam.com';
export const ALLOWED_PRODUCTION_HOSTS = new Set(['samgamam.com', 'api.samgamam.com']);
export const BLOCKED_ANDROID_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  // Merged from expo-secure-store's library manifest for requireAuthentication.
  // Samgamam never requests biometric-gated keychain items (guarded by
  // tests/security/native-capabilities.test.cjs), so these stay out of the APK.
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
] as const;

// Build-time manifest hardening lives in plugins/ because this module is also
// imported by the app bundle (src/auth/config.ts) and must stay Node-free.
export const ANDROID_COMPONENT_REMOVALS_PLUGIN = './plugins/android-component-removals.js';

export type AppTransportSecurityConfig = {
  NSAllowsArbitraryLoads: false;
  NSAllowsLocalNetworking: boolean;
};

// Local networking is an allow-list, not "anything except production": preview,
// staging, typos and any future profile fail closed. An unset APP_ENV is the
// documented local-development default (validateAppEnvironment), so `expo run:ios`
// against localhost keeps working; every EAS profile pins APP_ENV explicitly
// (enforced in app.config.test.ts).
export function allowsLocalNetworking(
  environment: PublicEnvironment = process.env,
): boolean {
  if (isProductionEnvironment(environment)) {
    return false;
  }
  if (environment.EXPO_PUBLIC_LOCAL_ACCEPTANCE === '1') {
    return true;
  }
  const appEnv = (environment.APP_ENV?.trim() || 'development').toLowerCase();
  return appEnv === 'development';
}

export function resolveAppTransportSecurity(
  environment: PublicEnvironment = process.env,
): AppTransportSecurityConfig {
  return {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: allowsLocalNetworking(environment),
  };
}

type PublicEnvironment = Record<string, string | undefined>;

export type Auth0PublicConfiguration = {
  audience: string;
  clientId: string;
  domain: string;
};

export function isProductionEnvironment(
  environment: PublicEnvironment = process.env,
): boolean {
  return (environment.APP_ENV?.trim() || '').toLowerCase() === 'production';
}

export function validateProductionApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Production API URL cannot be empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Production EXPO_PUBLIC_API_URL must be a valid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Production EXPO_PUBLIC_API_URL must use HTTPS.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Production API URL must not contain embedded credentials.');
  }

  if (parsed.port && parsed.port !== '443') {
    throw new Error('Production API URL must use standard HTTPS port (443).');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_PRODUCTION_HOSTS.has(hostname)) {
    throw new Error(
      `Production API host '${hostname}' is not an approved Samgamam production domain.`,
    );
  }

  return parsed.origin;
}

export function validateAppEnvironment(
  environment: PublicEnvironment = process.env,
) {
  const appEnv = environment.APP_ENV?.trim() || 'development';
  const isProd = isProductionEnvironment(environment);
  const domain = environment.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  const clientId = environment.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const audience = environment.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim();
  const apiUrl = environment.EXPO_PUBLIC_API_URL?.trim();

  if (environment.EXPO_PUBLIC_LOCAL_ACCEPTANCE === '1' &&
      (isProd || apiUrl !== 'http://127.0.0.1:4318' || domain || clientId || audience)) {
    throw new Error('Local acceptance requires loopback API, no Auth0 configuration, and a non-production environment.');
  }

  if (isProd) {
    if (!domain || !clientId || !audience) {
      throw new Error(
        'Production configuration requires complete Auth0 domain, client ID, and audience.',
      );
    }

    const validatedApiUrl = apiUrl
      ? validateProductionApiUrl(apiUrl)
      : CANONICAL_PRODUCTION_API_URL;

    return {
      appEnv: 'production' as const,
      auth0: { domain, clientId, audience },
      apiUrl: validatedApiUrl,
    };
  }

  const suppliedCount = [domain, clientId, audience].filter(Boolean).length;
  if (suppliedCount !== 0 && suppliedCount !== 3) {
    throw new Error(
      'Auth0 development configuration requires domain, client ID, and audience together.',
    );
  }

  return {
    appEnv,
    auth0:
      suppliedCount === 3
        ? { domain: domain!, clientId: clientId!, audience: audience! }
        : undefined,
    apiUrl: apiUrl || undefined,
  };
}

export function readOptionalAuth0Configuration(
  environment: PublicEnvironment = process.env,
): Auth0PublicConfiguration | undefined {
  const validated = validateAppEnvironment(environment);
  return validated.auth0;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const validated = validateAppEnvironment(process.env);
  const auth0 = validated.auth0;
  const base = (appJson as { expo: ExpoConfig }).expo;

  return {
    ...config,
    ...base,
    android: {
      ...base.android,
      package: ANDROID_PACKAGE,
      blockedPermissions: Array.from(
        new Set([
          ...(base.android?.blockedPermissions ?? []),
          ...BLOCKED_ANDROID_PERMISSIONS,
        ]),
      ),
    },
    ios: {
      ...base.ios,
      bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
      infoPlist: {
        ...base.ios?.infoPlist,
        NSAppTransportSecurity: resolveAppTransportSecurity(process.env),
      },
    },
    plugins: [
      ...(base.plugins ?? []),
      ANDROID_COMPONENT_REMOVALS_PLUGIN,
      // The native Auth0 library requires manifest placeholders even when login
      // is not configured. The reserved .invalid domain cannot reach a tenant.
      ['react-native-auth0', {
        customScheme: AUTH0_CUSTOM_SCHEME,
        domain: auth0?.domain ?? 'unconfigured.invalid',
      }],
    ],
  };
};
