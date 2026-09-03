import Auth0, { AuthError, CredentialsManagerError, WebAuthError } from 'react-native-auth0';

const LOCAL_AUTH_SCHEME = 'samgamam';
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

export type AuthConfiguration = {
  domain: string;
  clientId: string;
  audience: string;
  scopes: readonly string[];
  customScheme: typeof LOCAL_AUTH_SCHEME;
};

export type AuthSessionState =
  | { status: 'unconfigured' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; expiresAt?: string };

export type VerifiedAccessTokenMetadata = { issuer: string; audience: string[] };

export type AuthenticationErrorKind = 'configuration' | 'cancelled' | 'network' | 'credentials' | 'provider';

export class AuthenticationError extends Error {
  constructor(public readonly kind: AuthenticationErrorKind) {
    super(`authentication_${kind}`);
    this.name = 'AuthenticationError';
  }
}

function validateIdentifier(name: string, value: string | undefined, maximum: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > maximum || /\s|:\/\//.test(normalized)) {
    throw new AuthenticationError('configuration');
  }
  return normalized;
}

export function readAuthConfiguration(): AuthConfiguration {
  const domain = validateIdentifier('domain', process.env.EXPO_PUBLIC_AUTH0_DOMAIN, 253).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain)) throw new AuthenticationError('configuration');
  const clientId = validateIdentifier('client ID', process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID, 256);
  const audience = validateIdentifier('audience', process.env.EXPO_PUBLIC_AUTH0_AUDIENCE, 1_024);
  return {domain, clientId, audience, scopes: DEFAULT_SCOPES, customScheme: LOCAL_AUTH_SCHEME};
}

function mapError(error: unknown): AuthenticationError {
  if (error instanceof AuthenticationError) return error;
  if (error instanceof CredentialsManagerError) return new AuthenticationError('credentials');
  if (error instanceof WebAuthError || error instanceof AuthError) {
    const code = `${error.name} ${error.message}`.toLowerCase();
    if (code.includes('cancel')) return new AuthenticationError('cancelled');
    if (code.includes('network') || code.includes('timeout')) return new AuthenticationError('network');
  }
  return new AuthenticationError('provider');
}

export function createAuthenticationClient(configuration = readAuthConfiguration()) {
  const auth0 = new Auth0({domain: configuration.domain, clientId: configuration.clientId});

  return {
    async login(additionalScopes: readonly string[] = []) {
      try {
        const scopes = [...new Set([...configuration.scopes, ...additionalScopes])];
        await auth0.webAuth.authorize(
          {audience: configuration.audience, scope: scopes.join(' ')},
          {customScheme: configuration.customScheme},
        );
      } catch (error) { throw mapError(error); }
    },

    async logout() {
      try {
        await auth0.webAuth.clearSession({}, {customScheme: configuration.customScheme});
      } catch (error) {
        throw mapError(error);
      } finally {
        await auth0.credentialsManager.clearCredentials();
      }
    },

    async getAccessToken(minimumTtlSeconds = 60): Promise<string> {
      try {
        const credentials = await auth0.credentialsManager.getCredentials(undefined, minimumTtlSeconds);
        if (!credentials.accessToken) throw new AuthenticationError('credentials');
        return credentials.accessToken;
      } catch (error) { throw mapError(error); }
    },

    async refreshAccessToken(): Promise<string> {
      try {
        const credentials = await auth0.credentialsManager.getCredentials(undefined, 60, {}, true);
        if (!credentials.accessToken) throw new AuthenticationError('credentials');
        return credentials.accessToken;
      } catch (error) { throw mapError(error); }
    },

    async getSessionState(): Promise<AuthSessionState> {
      try {
        if (!(await auth0.credentialsManager.hasValidCredentials())) return {status: 'signed-out'};
        const credentials = await auth0.credentialsManager.getCredentials();
        return {
          status: 'signed-in',
          ...(credentials.expiresAt ? {expiresAt: new Date(credentials.expiresAt * 1_000).toISOString()} : {}),
        };
      } catch (error) { throw mapError(error); }
    },
  };
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new AuthenticationError('credentials');
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    throw new AuthenticationError('credentials');
  }
}

export function inspectAccessToken(accessToken: string, configuration = readAuthConfiguration()): VerifiedAccessTokenMetadata {
  const claims = decodeJwtPayload(accessToken);
  const issuer = typeof claims.iss === 'string' ? claims.iss : '';
  const audience = Array.isArray(claims.aud)
    ? claims.aud.filter((entry): entry is string => typeof entry === 'string')
    : typeof claims.aud === 'string' ? [claims.aud] : [];
  if (issuer !== `https://${configuration.domain}/` || !audience.includes(configuration.audience)) {
    throw new AuthenticationError('credentials');
  }
  return {issuer, audience};
}

export const authRedirectDesign = {
  localDevelopment: 'samgamam://{auth0-domain}/{platform}/com.samgamam.mobile.poc/callback',
  production: 'https://{auth0-domain}/{platform}/{approved-bundle-or-package-id}/callback',
} as const;
