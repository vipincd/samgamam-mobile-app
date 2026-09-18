import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,

  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Compass, UsersRound, MessageCircle, UserRound, FlaskConical } from 'lucide-react-native';
import { brand } from './src/brand';
import { BrandedLaunch } from './src/startup/BrandedLaunch';
import { useLaunchResources } from './src/startup/useLaunchResources';
import { within } from './src/startup/within';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: false });
const hideNativeSplash = () => { void SplashScreen.hideAsync().catch(() => undefined); };
const tabIcons = { discover: Compass, groups: UsersRound, help: MessageCircle, profile: UserRound, 'auth-test': FlaskConical };

import { apiClient, getErrorMessage } from './src/api/client';
import { sessionManager } from './src/auth/session';
import type { AuthSessionResponse } from './src/api/types';
import { InlineNotice } from './src/components/ui';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { AuthTestScreen } from './src/screens/AuthTestScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';


type ProductionTabKey = 'discover' | 'groups' | 'help' | 'profile';
type TabKey = ProductionTabKey | 'auth-test';

const defaultSession: AuthSessionResponse = {
  authenticated: false,
  locale: 'en',
  viewer: null,
};

export const productionTabs: Array<{
  key: ProductionTabKey;
  label: string;
  hint: string;
}> = [
  { key: 'discover', label: 'Discover', hint: 'Events' },
  { key: 'groups', label: 'Groups', hint: 'Community' },
  { key: 'help', label: 'Help', hint: 'AI guide' },
  { key: 'profile', label: 'Profile', hint: 'Account' },
];

export function getTabs(isDevelopment: boolean): Array<{
  key: TabKey;
  label: string;
  hint: string;
}> {
  return isDevelopment
    ? [...productionTabs, { key: 'auth-test', label: 'Auth Test', hint: 'Dev only' }]
    : productionTabs;
}

function normalizeSession(session: AuthSessionResponse | null | undefined): AuthSessionResponse {
  return {
    authenticated: Boolean(session?.authenticated),
    locale: session?.locale ?? 'en',
    viewer: session?.viewer ?? null,
  };
}

export type ProductAuthStatus =
  | 'unresolved'
  | 'authenticated'
  | 'signed-out'
  | 'reconciliation-failed'
  | 'initializing'
  | 'signedOut'
  | 'signingIn'
  | 'signedIn'
  | 'refreshing'
  | 'expired'
  | 'error';

export interface ProductAuthState {
  status: ProductAuthStatus;
  session: AuthSessionResponse;
  errorMessage: string | null;
}

export async function reconcileProductSession(
  client: typeof apiClient,
): Promise<ProductAuthState> {
  const hasToken = client.hasStoredAccessToken();

  if (!hasToken) {
    return {
      status: 'signed-out',
      session: defaultSession,
      errorMessage: null,
    };
  }

  try {
    const rawSession = await client.getSession();
    const session = normalizeSession(rawSession);

    if (session.authenticated) {
      return {
        status: 'authenticated',
        session,
        errorMessage: null,
      };
    }

    return {
      status: 'signed-out',
      session: defaultSession,
      errorMessage: null,
    };
  } catch (error) {
    if (!client.hasStoredAccessToken()) {
      return {
        status: 'signed-out',
        session: defaultSession,
        errorMessage: null,
      };
    }

    return {
      status: 'reconciliation-failed',
      session: defaultSession,
      errorMessage: getErrorMessage(error),
    };
  }
}

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

function AppContent() {
  const resources = useLaunchResources();
  const [slowStartup, setSlowStartup] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [authState, setAuthState] = useState<ProductAuthState>(() => {
    const s = sessionManager.getState();
    return {
      status: s.status,
      session: s.session,
      errorMessage: s.errorMessage,
    };
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(apiClient.getBaseUrl());
  const [bootstrapping, setBootstrapping] = useState(true);

  async function refreshSession() {
    const s = await sessionManager.initialize();
    return s.session;
  }

  async function bootstrapApp() {
    setBootstrapping(true);

    try {
      const bootstrapState = await within(apiClient.initialize(), 8000);
      setApiBaseUrl(bootstrapState.apiBaseUrl);
      await within(sessionManager.initialize(), 8000);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      setAuthState({
        status: 'error',
        session: defaultSession,
        errorMessage: errorMsg,
      });
    } finally {
      setBootstrapping(false);
    }
  }

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((s) => {
      setAuthState({
        status: s.status,
        session: s.session,
        errorMessage: s.errorMessage,
      });
    });
    void bootstrapApp();
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      SplashScreen.setOptions({ fade: !reduced, duration: 160 });
    });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      SplashScreen.setOptions({ fade: !reduced, duration: 160 });
    });
    return () => {
      unsubscribe();
      motion.remove();
    };
  }, []);

  useEffect(() => {
    if (!bootstrapping) { setSlowStartup(false); return; }
    const timer = setTimeout(() => setSlowStartup(true), 10000);
    return () => clearTimeout(timer);
  }, [bootstrapping]);

  async function handleSaveApiBaseUrl(value: string | null) {
    const nextBaseUrl = await apiClient.setApiBaseUrl(value);
    setApiBaseUrl(nextBaseUrl);
    await refreshSession();
    return nextBaseUrl;
  }

  async function handleLogin() {
    await sessionManager.signIn();
  }

  async function handleLogout() {
    await sessionManager.signOut();
  }

  function openProfileTab() {
    setActiveTab('profile');
  }

  const session = authState.session;
  const connectionError = authState.errorMessage;
  const locale = session.locale ?? 'en';
  const sharedScreenProps = {
    isFocused: false,
    locale,
    onRequestSignIn: openProfileTab,
  };
  const tabs = getTabs(__DEV__);

  let screen = (
    <DiscoverScreen
      {...sharedScreenProps}
      authenticated={session.authenticated}
      isFocused={activeTab === 'discover'}
      viewerName={session.viewer?.fullName ?? null}
    />
  );

  if (activeTab === 'groups') {
    screen = (
      <GroupsScreen
        {...sharedScreenProps}
        authenticated={session.authenticated}
        isFocused
      />
    );
  } else if (activeTab === 'help') {
    screen = (
      <HelpScreen
        {...sharedScreenProps}
        authenticated={session.authenticated}
        isFocused
        roles={session.viewer?.roles ?? []}
        viewerName={session.viewer?.fullName ?? null}
      />
    );
  } else if (activeTab === 'profile') {
    screen = (
      <ProfileScreen
        apiBaseUrl={apiBaseUrl}
        connectionError={connectionError}
        isFocused
        locale={locale}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefreshSession={async () => {
          await refreshSession();
        }}
        onSaveApiBaseUrl={handleSaveApiBaseUrl}
        authStatus={authState.status}
        session={session}
      />
    );
  } else if (__DEV__ && activeTab === 'auth-test') {
    screen = <AuthTestScreen />;
  }

  if (!resources.ready || (bootstrapping && !recovering)) {
    return <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <BrandedLaunch onReady={hideNativeSplash} slow={slowStartup && resources.ready}
        assetError={resources.error} onRetry={resources.retry} onRecover={() => {
          setRecovering(true);
          setActiveTab('profile');
        }} />
    </View>;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']} onLayout={hideNativeSplash}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {connectionError ? (
          <View style={styles.banner}>
            <InlineNotice
              message="Check your connection or update the backend URL in Profile."
              tone="warning"
              title="You’re offline"
            />
          </View>
        ) : null}
        <View style={styles.content}>{screen}</View>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tabIcons[tab.key];

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [styles.tabButton, pressed && { opacity: 0.65 }]}
              >
                <View style={[styles.iconWell, isActive && styles.iconWellActive]}><Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? brand.primaryStrong : brand.muted} /></View>
                <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : undefined]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.canvas },
  container: { flex: 1, backgroundColor: brand.canvas },
  content: { flex: 1 },
  banner: { paddingHorizontal: 20, paddingTop: 8 },
  tabBar: { backgroundColor: brand.surface, borderTopColor: brand.border, borderTopWidth: 1,
    flexDirection: 'row', paddingTop: 8, paddingBottom: 7, paddingHorizontal: 8 },
  tabButton: { alignItems: 'center', flex: 1, minHeight: 52, gap: 3 },
  iconWell: { width: 48, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconWellActive: { backgroundColor: brand.primarySoft },
  tabLabel: { color: brand.muted, fontFamily: brand.fonts.medium, fontSize: 10 },
  tabLabelActive: { color: brand.primaryStrong },
});
