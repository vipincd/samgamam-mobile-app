import appConfig, {
  CANONICAL_PRODUCTION_API_URL,
  readOptionalAuth0Configuration,
  validateAppEnvironment,
  validateProductionApiUrl,
} from './app.config';

const completeEnvironment = {
  APP_ENV: 'production',
  EXPO_PUBLIC_AUTH0_AUDIENCE: 'https://api.example.invalid',
  EXPO_PUBLIC_AUTH0_CLIENT_ID: 'public-client-id',
  EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid',
  EXPO_PUBLIC_API_URL: 'https://samgamam.com',
};

describe('App Environment and Auth0 configuration', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  describe('Development Environment', () => {
    it('accepts no Auth0 configuration in development', () => {
      expect(readOptionalAuth0Configuration({ APP_ENV: 'development' })).toBeUndefined();
    });

    it.each([
      { APP_ENV: 'development', EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid' },
      {
        APP_ENV: 'development',
        EXPO_PUBLIC_AUTH0_CLIENT_ID: 'public-client-id',
        EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid',
      },
    ])('rejects partial Auth0 configuration in development', (environment) => {
      expect(() => readOptionalAuth0Configuration(environment)).toThrow(
        'requires domain, client ID, and audience together',
      );
    });

    it('allows localhost development API URL', () => {
      const result = validateAppEnvironment({
        APP_ENV: 'development',
        EXPO_PUBLIC_API_URL: 'http://localhost:3000',
      });
      expect(result.apiUrl).toBe('http://localhost:3000');
    });
  });

  describe('Production Environment (APP_ENV=production)', () => {
    it('succeeds with complete production configuration', () => {
      const result = validateAppEnvironment(completeEnvironment);
      expect(result.appEnv).toBe('production');
      expect(result.auth0).toEqual({
        audience: 'https://api.example.invalid',
        clientId: 'public-client-id',
        domain: 'tenant.example.invalid',
      });
      expect(result.apiUrl).toBe('https://samgamam.com');
    });

    it('fails closed if Auth0 configuration is missing in production', () => {
      expect(() =>
        validateAppEnvironment({
          APP_ENV: 'production',
          EXPO_PUBLIC_API_URL: 'https://samgamam.com',
        }),
      ).toThrow('Production configuration requires complete Auth0');
    });

    it('fails closed if Auth0 configuration is partial in production', () => {
      expect(() =>
        validateAppEnvironment({
          APP_ENV: 'production',
          EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid',
          EXPO_PUBLIC_API_URL: 'https://samgamam.com',
        }),
      ).toThrow('Production configuration requires complete Auth0');
    });

    it('fails closed if production API URL is insecure HTTP', () => {
      expect(() =>
        validateAppEnvironment({
          ...completeEnvironment,
          EXPO_PUBLIC_API_URL: 'http://samgamam.com',
        }),
      ).toThrow('Production EXPO_PUBLIC_API_URL must use HTTPS.');
    });

    it('fails closed if production API URL is not an approved Samgamam host', () => {
      expect(() =>
        validateAppEnvironment({
          ...completeEnvironment,
          EXPO_PUBLIC_API_URL: 'https://evil-hacker.com',
        }),
      ).toThrow("not an approved Samgamam production domain");
    });

    it('fails closed if production API URL contains user credentials', () => {
      expect(() =>
        validateProductionApiUrl('https://admin:pass@samgamam.com'),
      ).toThrow('embedded credentials');
    });

    it('defaults to canonical production API URL if omitted in production', () => {
      const result = validateAppEnvironment({
        APP_ENV: 'production',
        EXPO_PUBLIC_AUTH0_AUDIENCE: 'https://api.example.invalid',
        EXPO_PUBLIC_AUTH0_CLIENT_ID: 'public-client-id',
        EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid',
      });
      expect(result.apiUrl).toBe(CANONICAL_PRODUCTION_API_URL);
    });
  });

  describe('Plugin generation', () => {
    it('adds the Auth0 plugin for valid configuration', () => {
      process.env = { ...originalEnvironment, ...completeEnvironment };
      const configured = appConfig({ config: {} } as never);
      expect(configured.plugins).toContainEqual([
        'react-native-auth0',
        {
          customScheme: 'samgamam',
          domain: completeEnvironment.EXPO_PUBLIC_AUTH0_DOMAIN,
        },
      ]);
    });

    it('omits Auth0 plugin in development when unconfigured', () => {
      process.env = { ...originalEnvironment, APP_ENV: 'development' };
      const unconfigured = appConfig({ config: {} } as never);
      expect(unconfigured.plugins).toContain('expo-secure-store');
      expect(unconfigured.plugins).not.toContainEqual(expect.arrayContaining(['react-native-auth0']));
    });
  });
});
