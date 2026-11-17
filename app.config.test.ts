import appConfig, {
  ANDROID_COMPONENT_REMOVALS_PLUGIN,
  BLOCKED_ANDROID_PERMISSIONS,
  CANONICAL_PRODUCTION_API_URL,
  AUTH0_ANDROID_PLACEHOLDERS_PLUGIN,
  readOptionalAuth0Configuration,
  resolveAppTransportSecurity,
  validateAppEnvironment,
  validateProductionApiUrl,
} from './app.config';

const { applyAndroidComponentRemovals } = require('./plugins/android-component-removals.js');

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
    const { applyAuth0AndroidPlaceholders } = require('./plugins/with-auth0-android-placeholders.cjs');

    it('sets Auth0 Android Gradle manifest placeholders idempotently', () => {
      const source = 'android {\n    defaultConfig {\n        applicationId "com.samgamam.mobile"\n    }\n}\n';
      const configured = applyAuth0AndroidPlaceholders(source, {
        customScheme: 'samgamam',
        domain: 'tenant.example.invalid',
      });
      expect(configured).toContain(
        'manifestPlaceholders += [auth0Domain: "tenant.example.invalid", auth0Scheme: "samgamam"]',
      );
      expect(
        applyAuth0AndroidPlaceholders(configured, {
          customScheme: 'samgamam',
          domain: 'tenant.example.invalid',
        }),
      ).toBe(configured);
      expect(
        applyAuth0AndroidPlaceholders(configured, {
          customScheme: 'samgamam',
          domain: 'other.example.invalid',
        }),
      ).toContain('auth0Domain: "other.example.invalid"');
    });

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
      expect(configured.plugins).toContainEqual([
        AUTH0_ANDROID_PLACEHOLDERS_PLUGIN,
        {
          customScheme: 'samgamam',
          domain: completeEnvironment.EXPO_PUBLIC_AUTH0_DOMAIN,
        },
      ]);
    });

    it('supplies inert native placeholders without enabling unconfigured development login', () => {
      process.env = { ...originalEnvironment, APP_ENV: 'development' };
      const unconfigured = appConfig({ config: {} } as never);
      // Keychain storage stays enabled; the app uses no biometrics, so no Face ID purpose string.
      expect(unconfigured.plugins).toContainEqual(['expo-secure-store', { faceIDPermission: false }]);
      expect(unconfigured.plugins).toContainEqual(['react-native-auth0', { customScheme: 'samgamam', domain: 'unconfigured.invalid' }]);
      expect(unconfigured.plugins).toContainEqual([
        AUTH0_ANDROID_PLACEHOLDERS_PLUGIN,
        { customScheme: 'samgamam', domain: 'unconfigured.invalid' },
      ]);
      expect(readOptionalAuth0Configuration(process.env)).toBeUndefined();
    });
  });
});

describe('local acceptance build configuration', () => {
  const local = { EXPO_PUBLIC_LOCAL_ACCEPTANCE: '1', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4318' };
  it('accepts only the local mock configuration', () => {
    expect(validateAppEnvironment(local).apiUrl).toBe(local.EXPO_PUBLIC_API_URL);
  });
  it.each([
    { APP_ENV: 'production' },
    { EXPO_PUBLIC_API_URL: 'https://samgamam.com' },
    { EXPO_PUBLIC_AUTH0_DOMAIN: 'tenant.example.invalid' },
  ])('rejects unsafe acceptance configuration %j', (override) => {
    expect(() => validateAppEnvironment({ ...local, ...override })).toThrow('Local acceptance requires');
  });
});

describe('release configuration safeguards', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it.each([
    ['production', { APP_ENV: 'production' }, false],
    ['preview', { APP_ENV: 'preview' }, false],
    ['staging', { APP_ENV: 'staging' }, false],
    ['development', { APP_ENV: 'development' }, true],
    [
      'local acceptance',
      {
        EXPO_PUBLIC_LOCAL_ACCEPTANCE: '1',
        EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4318',
      },
      true,
    ],
  ])('resolves local networking safely for %s', (_name, environment, allowsLocal) => {
    expect(resolveAppTransportSecurity(environment)).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: allowsLocal,
    });
  });

  it('injects production ATS restrictions and all blocked Android permissions', () => {
    process.env = { ...originalEnvironment, ...completeEnvironment };
    const config = appConfig({ config: {} } as never);

    expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: false,
    });
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining([...BLOCKED_ANDROID_PERMISSIONS]),
    );
    expect(config.android?.permissions).toEqual(['android.permission.CAMERA']);
  });

  it('pins production networking off in all non-development EAS profiles', () => {
    const eas = require('./eas.json') as {
      build: Record<string, { developmentClient?: boolean; env?: Record<string, string> }>;
    };

    for (const [name, profile] of Object.entries(eas.build)) {
      const environment = profile.env ?? {};
      expect(environment.APP_ENV?.trim()).toBeTruthy();
      expect(resolveAppTransportSecurity(environment).NSAllowsLocalNetworking).toBe(
        name === 'development',
      );
      if (name !== 'development') {
        expect(profile.developmentClient).not.toBe(true);
        expect(environment.EXPO_PUBLIC_LOCAL_ACCEPTANCE).toBeUndefined();
      }
    }
  });

  it('registers idempotent removal of the exported Compose preview activity', () => {
    const manifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        application: [
          {
            $: { 'android:name': '.MainApplication' },
            activity: [{ $: { 'android:name': '.MainActivity' } }],
          },
        ],
      },
    };
    const hardened = applyAndroidComponentRemovals(manifest);
    const repeated = applyAndroidComponentRemovals(hardened);

    expect(hardened.manifest.$).toMatchObject({
      'xmlns:tools': 'http://schemas.android.com/tools',
    });
    expect(repeated.manifest.application[0].activity).toContainEqual({
      $: {
        'android:name': 'androidx.compose.ui.tooling.PreviewActivity',
        'tools:node': 'remove',
      },
    });
    expect(
      repeated.manifest.application[0].activity.filter(
        (activity: { $: Record<string, string> }) =>
          activity.$['android:name'] === 'androidx.compose.ui.tooling.PreviewActivity',
      ),
    ).toHaveLength(1);
    expect(
      appConfig({ config: {} } as never).plugins,
    ).toContain(ANDROID_COMPONENT_REMOVALS_PLUGIN);
  });
});
