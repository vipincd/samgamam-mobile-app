import appConfig, { readOptionalAuth0Configuration } from './app.config';

const completeEnvironment = {
  EXPO_PUBLIC_AUTH0_AUDIENCE: 'https://api.example.invalid',
  EXPO_PUBLIC_AUTH0_CLIENT_ID: 'public-client-id',
  EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid',
};

describe('Auth0 Expo configuration', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it('accepts no Auth0 configuration', () => {
    expect(readOptionalAuth0Configuration({})).toBeUndefined();
  });

  it.each([
    { EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid' },
    {
      EXPO_PUBLIC_AUTH0_CLIENT_ID: 'public-client-id',
      EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid',
    },
  ])('rejects partial Auth0 configuration', (environment) => {
    expect(() => readOptionalAuth0Configuration(environment)).toThrow(
      'requires domain, client ID, and audience together',
    );
  });

  it('adds the Auth0 plugin only for the complete group', () => {
    process.env = { ...originalEnvironment, ...completeEnvironment };
    const configured = appConfig({ config: {} } as never);
    expect(configured.plugins).toContainEqual([
      'react-native-auth0',
      {
        customScheme: 'samgamam',
        domain: completeEnvironment.EXPO_PUBLIC_AUTH0_DOMAIN,
      },
    ]);

    process.env = { ...originalEnvironment };
    delete process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
    delete process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
    const unconfigured = appConfig({ config: {} } as never);
    expect(unconfigured.plugins).toContain('expo-secure-store');
    expect(unconfigured.plugins).not.toContainEqual(expect.arrayContaining(['react-native-auth0']));
  });
});
