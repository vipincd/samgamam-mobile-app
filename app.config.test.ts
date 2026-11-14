import appConfig, {
  BLOCKED_ANDROID_PERMISSIONS,
  ANDROID_COMPONENT_REMOVALS_PLUGIN,
  CANONICAL_PRODUCTION_API_URL,
  readOptionalAuth0Configuration,
  resolveAppTransportSecurity,
  validateAppEnvironment,
  validateProductionApiUrl,
} from './app.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const componentRemovals = require('./plugins/android-component-removals.js') as {
  applyAndroidComponentRemovals: (manifest: unknown) => unknown;
  REMOVED_ANDROID_COMPONENTS: readonly { tag: string; name: string }[];
};
const { applyAndroidComponentRemovals, REMOVED_ANDROID_COMPONENTS } = componentRemovals;

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

    it('supplies inert native placeholders without enabling unconfigured development login', () => {
      process.env = { ...originalEnvironment, APP_ENV: 'development' };
      const unconfigured = appConfig({ config: {} } as never);
      expect(unconfigured.plugins).toContain('expo-secure-store');
      expect(unconfigured.plugins).toContainEqual(['react-native-auth0', { customScheme: 'samgamam', domain: 'unconfigured.invalid' }]);
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

describe('iOS App Transport Security and Local Networking', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it('disables NSAllowsLocalNetworking and keeps NSAllowsArbitraryLoads false in production', () => {
    const ats = resolveAppTransportSecurity({ APP_ENV: 'production' });
    expect(ats).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: false,
    });
  });

  it('enables NSAllowsLocalNetworking for development while keeping NSAllowsArbitraryLoads false', () => {
    const ats = resolveAppTransportSecurity({ APP_ENV: 'development' });
    expect(ats).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    });
  });

  it('enables NSAllowsLocalNetworking for local acceptance while keeping NSAllowsArbitraryLoads false', () => {
    const ats = resolveAppTransportSecurity({
      EXPO_PUBLIC_LOCAL_ACCEPTANCE: '1',
      EXPO_PUBLIC_API_URL: 'http://127.0.0.1:4318',
    });
    expect(ats).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    });
  });

  it('injects ATS into the generated Expo iOS configuration for production', () => {
    process.env = { ...originalEnvironment, ...completeEnvironment, APP_ENV: 'production' };
    const config = appConfig({ config: {} } as never);
    const ats = config.ios?.infoPlist?.NSAppTransportSecurity as {
      NSAllowsArbitraryLoads: boolean;
      NSAllowsLocalNetworking: boolean;
    };
    expect(ats.NSAllowsArbitraryLoads).toBe(false);
    expect(ats.NSAllowsLocalNetworking).toBe(false);
  });

  it('injects ATS into the generated Expo iOS configuration for development', () => {
    process.env = { ...originalEnvironment, APP_ENV: 'development' };
    const config = appConfig({ config: {} } as never);
    const ats = config.ios?.infoPlist?.NSAppTransportSecurity as {
      NSAllowsArbitraryLoads: boolean;
      NSAllowsLocalNetworking: boolean;
    };
    expect(ats.NSAllowsArbitraryLoads).toBe(false);
    expect(ats.NSAllowsLocalNetworking).toBe(true);
  });
});

describe('Android permission hardening', () => {
  it('includes all required blocked permissions in the Expo config', () => {
    const config = appConfig({ config: {} } as never);
    const blocked = config.android?.blockedPermissions ?? [];
    for (const permission of BLOCKED_ANDROID_PERMISSIONS) {
      expect(blocked).toContain(permission);
    }
    expect(blocked).toContain('android.permission.RECORD_AUDIO');
    expect(blocked).toContain('android.permission.SYSTEM_ALERT_WINDOW');
    expect(blocked).toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(blocked).toContain('android.permission.WRITE_EXTERNAL_STORAGE');
  });

  it('ensures camera is the only requested dangerous permission in android.permissions', () => {
    const config = appConfig({ config: {} } as never);
    expect(config.android?.permissions).toEqual(['android.permission.CAMERA']);
  });
});

describe('MOB-01 release network and component hardening (2026-11-14 review)', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it.each([
    ['preview', { APP_ENV: 'preview' }],
    ['staging', { APP_ENV: 'staging' }],
    ['mixed-case production', { ...completeEnvironment, APP_ENV: 'Production' }],
    ['typo of development', { APP_ENV: 'develop' }],
  ])('keeps NSAllowsLocalNetworking disabled for non-development APP_ENV (%s)', (_label, environment) => {
    expect(resolveAppTransportSecurity(environment)).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: false,
    });
  });

  it('keeps local networking for an unset APP_ENV so `expo run:ios` against localhost keeps working', () => {
    expect(resolveAppTransportSecurity({}).NSAllowsLocalNetworking).toBe(true);
  });

  it('injects disabled local networking into the generated preview iOS configuration', () => {
    process.env = { ...originalEnvironment, APP_ENV: 'preview' };
    const config = appConfig({ config: {} } as never);
    expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: false,
    });
  });

  it('blocks biometric permissions that expo-secure-store adds but the app never uses', () => {
    const config = appConfig({ config: {} } as never);
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT']),
    );
  });

  it('removes the exported Compose PreviewActivity that dev-client tooling merges into release builds', () => {
    const manifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        application: [{ $: { 'android:name': '.MainApplication' }, activity: [{ $: { 'android:name': '.MainActivity' } }] }],
      },
    };
    const hardened = applyAndroidComponentRemovals(manifest as never) as typeof manifest;
    expect(hardened.manifest.$['xmlns:tools' as never]).toBe('http://schemas.android.com/tools');
    expect(hardened.manifest.application[0].activity).toContainEqual({
      $: { 'android:name': 'androidx.compose.ui.tooling.PreviewActivity', 'tools:node': 'remove' },
    });
    // Idempotent across repeated prebuilds.
    const again = applyAndroidComponentRemovals(hardened as never) as typeof manifest;
    expect(
      again.manifest.application[0].activity.filter((a) => a.$['android:name'] === 'androidx.compose.ui.tooling.PreviewActivity'),
    ).toHaveLength(1);
    for (const component of REMOVED_ANDROID_COMPONENTS) {
      expect(component.name).not.toMatch(/^com\.samgamam\./);
    }
  });

  it('registers the component-removal plugin in every environment', () => {
    for (const environment of [{ APP_ENV: 'development' }, { APP_ENV: 'preview' }, completeEnvironment]) {
      process.env = { ...originalEnvironment, ...environment };
      expect(appConfig({ config: {} } as never).plugins).toContain(ANDROID_COMPONENT_REMOVALS_PLUGIN);
    }
  });
});

describe('EAS build profiles never ship development networking', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const eas = require('./eas.json') as {
    build: Record<string, { developmentClient?: boolean; env?: Record<string, string> }>;
  };

  it('pins APP_ENV explicitly on every profile', () => {
    for (const [name, profile] of Object.entries(eas.build)) {
      expect({ name, appEnv: profile.env?.APP_ENV?.trim() }).toEqual({ name, appEnv: expect.any(String) });
    }
  });

  it('only the development profile is a development client with local networking', () => {
    for (const [name, profile] of Object.entries(eas.build)) {
      const environment = profile.env ?? {};
      const localNetworking = resolveAppTransportSecurity(environment).NSAllowsLocalNetworking;
      if (name === 'development') {
        expect(profile.developmentClient).toBe(true);
        expect(localNetworking).toBe(true);
      } else {
        expect({ name, developmentClient: Boolean(profile.developmentClient), localNetworking }).toEqual({
          name,
          developmentClient: false,
          localNetworking: false,
        });
        expect(environment.EXPO_PUBLIC_LOCAL_ACCEPTANCE).toBeUndefined();
      }
    }
  });
});
