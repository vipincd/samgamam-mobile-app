import * as ExpoLinking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { apiClient, getErrorMessage } from './src/api/client';
import type { AuthSessionResponse } from './src/api/types';
import { InlineNotice } from './src/components/ui';
import {
  describeRoute,
  parseSamgamamRoute,
  routeNeedsAuthentication,
  routeToTab,
  type MobileRoute,
} from './src/navigation/deepLinks';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { EcosystemScreen } from './src/screens/EcosystemScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { registerForPushNotifications } from './src/services/pushNotifications';
import { theme } from './src/theme';

type TabKey = 'discover' | 'groups' | 'ecosystem' | 'help' | 'profile';

const defaultSession: AuthSessionResponse = {
  authenticated: false,
  locale: 'en',
  viewer: null,
};

const tabs: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: 'discover', label: 'Discover', hint: 'Events' },
  { key: 'groups', label: 'Groups', hint: 'Community' },
  { key: 'ecosystem', label: 'Ecosystem', hint: 'Network' },
  { key: 'help', label: 'Help', hint: 'AI guide' },
  { key: 'profile', label: 'Profile', hint: 'Account' },
];

function normalizeSession(session: AuthSessionResponse | null | undefined): AuthSessionResponse {
  return {
    authenticated: Boolean(session?.authenticated),
    locale: session?.locale ?? 'en',
    viewer: session?.viewer ?? null,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [session, setSession] = useState<AuthSessionResponse>(defaultSession);
  const [apiBaseUrl, setApiBaseUrl] = useState(apiClient.getBaseUrl());
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [navigationTarget, setNavigationTarget] = useState<{
    id: number;
    route: MobileRoute;
  } | null>(null);
  const [pendingAuthRoute, setPendingAuthRoute] = useState<MobileRoute | null>(null);
  const initialUrlHandledRef = useRef(false);
  const routeCounterRef = useRef(0);

  const applyRoute = useCallback(
    (route: MobileRoute, options?: { authenticated?: boolean; source?: 'link' | 'notification' | 'pending' }) => {
      const isAuthenticated = options?.authenticated ?? session.authenticated;

      if (route.kind === 'unknown') {
        setGlobalNotice(route.message);
        return;
      }

      if (!isAuthenticated && routeNeedsAuthentication(route)) {
        setPendingAuthRoute(route);
        setActiveTab('profile');
        setGlobalNotice(`Sign in to continue to ${describeRoute(route)}.`);
        return;
      }

      routeCounterRef.current += 1;
      setNavigationTarget({
        id: routeCounterRef.current,
        route,
      });
      setActiveTab(routeToTab(route));
      setGlobalNotice(
        options?.source === 'notification'
          ? `Opened ${describeRoute(route)} from a notification.`
          : null,
      );
    },
    [session.authenticated],
  );

  async function refreshSession() {
    const nextSession = await apiClient.getSession();
    const normalized = normalizeSession(nextSession);
    setSession(normalized);
    setConnectionError(null);
    return normalized;
  }

  async function bootstrapApp() {
    setBootstrapping(true);

    try {
      const bootstrapState = await apiClient.initialize();
      setApiBaseUrl(bootstrapState.apiBaseUrl);
      await refreshSession();
    } catch (error) {
      setConnectionError(getErrorMessage(error));
      setSession(defaultSession);
    } finally {
      setBootstrapping(false);
    }
  }

  useEffect(() => {
    void bootstrapApp();
  }, []);

  async function handleSaveApiBaseUrl(value: string | null) {
    const nextBaseUrl = await apiClient.setApiBaseUrl(value);
    setApiBaseUrl(nextBaseUrl);
    await refreshSession();
    return nextBaseUrl;
  }

  async function handleLogin(email: string, password: string) {
    const response = await apiClient.login(email, password);
    const nextSession = normalizeSession({
      authenticated: true,
      locale: response.locale,
      viewer: response.viewer,
    });

    setSession(nextSession);
    setConnectionError(null);

    if (pendingAuthRoute) {
      const route = pendingAuthRoute;
      setPendingAuthRoute(null);
      applyRoute(route, { authenticated: true, source: 'pending' });
    }
  }

  async function handleLogout() {
    await apiClient.logout();
    setSession(defaultSession);
    setConnectionError(null);
  }

  function openProfileTab() {
    setActiveTab('profile');
  }

  async function handleOpenRoute(value: string | MobileRoute) {
    const route = typeof value === 'string' ? parseSamgamamRoute(value) : value;

    if (!route) {
      setGlobalNotice('This Samgamam link could not be opened.');
      return;
    }

    applyRoute(route);
  }

  async function handleRegisterPush() {
    const registration = await registerForPushNotifications();

    if (registration.status === 'registered') {
      await apiClient.registerPushToken(registration.token, registration.platform);
    }

    return registration.message;
  }

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const route = parseSamgamamRoute(url);

      if (route) {
        applyRoute(route, { source: 'link' });
      }
    };

    if (!initialUrlHandledRef.current) {
      initialUrlHandledRef.current = true;
      void ExpoLinking.getInitialURL().then(handleUrl).catch(() => {
        setGlobalNotice('Samgamam could not inspect the launch link.');
      });
    }

    const linkSubscription = ExpoLinking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    const notificationSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const rawUrl = response.notification.request.content.data?.url;

      if (typeof rawUrl === 'string') {
        const route = parseSamgamamRoute(rawUrl);

        if (route) {
          applyRoute(route, { source: 'notification' });
        }
      } else {
        setActiveTab('profile');
        setGlobalNotice('Notification opened, but it did not include a mobile route.');
      }
    });

    return () => {
      linkSubscription.remove();
      notificationSubscription.remove();
    };
  }, [applyRoute]);

  const locale = session.locale ?? 'en';
  const sharedScreenProps = {
    isFocused: false,
    locale,
    onRequestSignIn: openProfileTab,
  };

  let screen = (
      <DiscoverScreen
        {...sharedScreenProps}
        authenticated={session.authenticated}
        isFocused={activeTab === 'discover'}
        navigationTarget={navigationTarget}
        onOpenRoute={handleOpenRoute}
        viewerName={session.viewer?.fullName ?? null}
      />
  );

  if (activeTab === 'groups') {
    screen = (
      <GroupsScreen
        {...sharedScreenProps}
        authenticated={session.authenticated}
        isFocused
        navigationTarget={navigationTarget}
        onOpenRoute={handleOpenRoute}
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
  } else if (activeTab === 'ecosystem') {
    screen = (
      <EcosystemScreen
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
        onOpenRoute={handleOpenRoute}
        onRefreshSession={async () => {
          await refreshSession();
        }}
        onRegisterPush={handleRegisterPush}
        onSaveApiBaseUrl={handleSaveApiBaseUrl}
        session={session}
      />
    );
  }

  if (bootstrapping) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.loadingScreen}>
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.accent} size="large" />
            <Text style={styles.loadingTitle}>Preparing Samgamam Mobile</Text>
            <Text style={styles.loadingSubtitle}>
              Checking the backend connection and restoring your session.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {connectionError ? (
          <View style={styles.banner}>
            <InlineNotice
              message={`${connectionError} You can update the backend URL from the Profile tab.`}
              tone="warning"
              title="Connection needs attention"
            />
          </View>
        ) : null}
        {globalNotice ? (
          <View style={styles.banner}>
            <InlineNotice message={globalNotice} tone="accent" title="Navigation" />
          </View>
        ) : null}
        <View style={styles.content}>{screen}</View>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${tab.label} tab`}
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, isActive ? styles.tabButtonActive : undefined]}
              >
                <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : undefined]}>
                  {tab.label}
                </Text>
                <Text style={[styles.tabHint, isActive ? styles.tabHintActive : undefined]}>
                  {tab.hint}
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
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    maxWidth: 360,
    paddingHorizontal: 28,
    paddingVertical: 32,
    width: '100%',
  },
  loadingTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingSubtitle: {
    color: theme.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  banner: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  tabBar: {
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    columnGap: 10,
    flexDirection: 'row',
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  tabButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 20,
    flex: 1,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.accentSoft,
  },
  tabLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: theme.colors.accent,
  },
  tabHint: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabHintActive: {
    color: theme.colors.accent,
  },
});
