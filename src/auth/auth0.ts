import Auth0, {
  AuthError,
  CredentialsManagerError,
  WebAuthError,
  WebAuthErrorCodes,
  type Credentials,
} from 'react-native-auth0';

import { AUTH0_CUSTOM_SCHEME, readOptionalAuth0Configuration } from './config';

const AUTH0_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;
const MINIMUM_TOKEN_TTL_SECONDS = 60;

export type AuthSessionState =
  | { status: 'unconfigured' }
  | { status: 'unknown' }
  | { status: 'signed-out' }
  | { expiresAt?: string; status: 'signed-in' };

export type AuthenticationErrorKind =
  | 'cancelled'
  | 'configuration'
  | 'credentials'
  | 'network'
  | 'provider';

export class AuthenticationError extends Error {
  constructor(readonly kind: AuthenticationErrorKind) {
    super(`authentication_${kind}`);
    this.name = 'AuthenticationError';
  }
}

type Auth0Client = {
  credentialsManager: {
    clearCredentials(): Promise<void>;
    getCredentials(
      scope?: string,
      minTtl?: number,
      parameters?: Record<string, unknown>,
      forceRefresh?: boolean,
    ): Promise<Credentials>;
    hasValidCredentials(): Promise<boolean>;
    saveCredentials(credentials: Credentials): Promise<void>;
  };
  webAuth: {
    authorize(
      parameters: { audience: string; scope: string },
      options: { customScheme: string },
    ): Promise<Credentials>;
    clearSession(
      parameters: Record<string, never>,
      options: { customScheme: string },
    ): Promise<void>;
  };
};

export function sanitizeAuthenticationError(error: unknown): AuthenticationError {
  if (error instanceof AuthenticationError) {
    return error;
  }

  if (error instanceof CredentialsManagerError) {
    return new AuthenticationError('credentials');
  }

  if (error instanceof WebAuthError || error instanceof AuthError) {
    if (
      error instanceof WebAuthError &&
      error.type === WebAuthErrorCodes.USER_CANCELLED
    ) {
      return new AuthenticationError('cancelled');
    }

    const safeCode = `${error.name} ${error.code}`.toLowerCase();
    if (safeCode.includes('network') || safeCode.includes('timeout')) {
      return new AuthenticationError('network');
    }
  }

  return new AuthenticationError('provider');
}

export function getSanitizedAuthMessage(error: unknown): string {
  const sanitized = sanitizeAuthenticationError(error);
  const messages: Record<AuthenticationErrorKind, string> = {
    cancelled: 'Authentication was cancelled.',
    configuration: 'Development authentication is not configured.',
    credentials: 'No usable Auth0 credentials are available.',
    network: 'Authentication could not reach the provider.',
    provider: 'The development authentication check failed.',
  };
  return messages[sanitized.kind];
}

export function createAuthenticationClient(clientOverride?: Auth0Client) {
  let configuration;

  try {
    configuration = readOptionalAuth0Configuration();
  } catch {
    throw new AuthenticationError('configuration');
  }

  if (!configuration) {
    return undefined;
  }

  const client =
    clientOverride ??
    (new Auth0({
      clientId: configuration.clientId,
      domain: configuration.domain,
    }) as Auth0Client);

  async function getCredentials(forceRefresh = false) {
    try {
      const credentials = await client.credentialsManager.getCredentials(
        undefined,
        MINIMUM_TOKEN_TTL_SECONDS,
        {},
        forceRefresh,
      );

      if (!credentials.accessToken) {
        throw new AuthenticationError('credentials');
      }

      return credentials;
    } catch (error) {
      throw sanitizeAuthenticationError(error);
    }
  }

  return {
    async checkCredentials(): Promise<AuthSessionState> {
      try {
        if (!(await client.credentialsManager.hasValidCredentials())) {
          return { status: 'signed-out' };
        }

        const credentials = await getCredentials();
        return {
          status: 'signed-in',
          ...(credentials.expiresAt
            ? { expiresAt: new Date(credentials.expiresAt * 1000).toISOString() }
            : {}),
        };
      } catch (error) {
        throw sanitizeAuthenticationError(error);
      }
    },

    async getAccessToken(forceRefresh = false): Promise<string> {
      return (await getCredentials(forceRefresh)).accessToken;
    },

    async login(): Promise<void> {
      try {
        const credentials = await client.webAuth.authorize(
          {
            audience: configuration.audience,
            scope: AUTH0_SCOPES.join(' '),
          },
          { customScheme: AUTH0_CUSTOM_SCHEME },
        );
        await client.credentialsManager.saveCredentials(credentials);
      } catch (error) {
        throw sanitizeAuthenticationError(error);
      }
    },

    async logout(): Promise<void> {
      let sessionError: AuthenticationError | undefined;

      try {
        await client.webAuth.clearSession({}, { customScheme: AUTH0_CUSTOM_SCHEME });
      } catch (error) {
        sessionError = sanitizeAuthenticationError(error);
      }

      try {
        await client.credentialsManager.clearCredentials();
      } catch (error) {
        throw sanitizeAuthenticationError(error);
      }

      if (sessionError) {
        throw sessionError;
      }
    },
  };
}

export type AuthenticationClient = NonNullable<
  ReturnType<typeof createAuthenticationClient>
>;
