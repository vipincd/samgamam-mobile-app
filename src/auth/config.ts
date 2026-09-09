export const AUTH0_CUSTOM_SCHEME = 'samgamam';

type PublicEnvironment = Record<string, string | undefined>;

export type Auth0PublicConfiguration = {
  audience: string;
  clientId: string;
  domain: string;
};

export function readOptionalAuth0Configuration(
  environment: PublicEnvironment = process.env,
): Auth0PublicConfiguration | undefined {
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
