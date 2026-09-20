export const AUTH0_CUSTOM_SCHEME = 'samgamam';

type PublicEnvironment = Record<string, string | undefined>;

export type Auth0PublicConfiguration = {
  audience: string;
  clientId: string;
  domain: string;
};

export function validateAppEnvironment(
  environment: PublicEnvironment = process.env,
) {
  const appEnv = environment.APP_ENV?.trim() || 'development';
  const domain = environment.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  const clientId = environment.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const audience = environment.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim();
  const apiUrl = environment.EXPO_PUBLIC_API_URL?.trim();

  if (appEnv === 'production') {
    if (!domain || !clientId || !audience) {
      throw new Error(
        'Production configuration requires complete Auth0 domain, client ID, and audience.',
      );
    }
    if (apiUrl && !apiUrl.startsWith('https://')) {
      throw new Error(
        'Production EXPO_PUBLIC_API_URL must use HTTPS.',
      );
    }
    return {
      appEnv,
      auth0: { domain, clientId, audience },
      apiUrl: apiUrl || 'https://samgamam.com',
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
    auth0: suppliedCount === 3 ? { domain: domain!, clientId: clientId!, audience: audience! } : undefined,
    apiUrl: apiUrl || undefined,
  };
}

export function readOptionalAuth0Configuration(
  environment: PublicEnvironment = process.env,
): Auth0PublicConfiguration | undefined {
  const validated = validateAppEnvironment(environment);
  return validated.auth0;
}
