import React, { useEffect, useState } from 'react';
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
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { AuthTestScreen } from './src/screens/AuthTestScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { theme } from './src/theme';

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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [session, setSession] = useState<AuthSessionResponse>(defaultSession);
  const [apiBaseUrl, setApiBaseUrl] = useState(apiClient.getBaseUrl());
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

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
    setSession(
      normalizeSession({
        authenticated: true,
        locale: response.locale,
        viewer: response.viewer,
      }),
    );
    setConnectionError(null);
  }

  async function handleLogout() {
    await apiClient.logout();
    setSession(defaultSession);
    setConnectionError(null);
  }

  function openProfileTab() {
    setActiveTab('profile');
  }

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
        session={session}
      />
    );
  } else if (__DEV__ && activeTab === 'auth-test') {
    screen = <AuthTestScreen />;
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
        <View style={styles.content}>{screen}</View>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Pressable
                accessibilityRole="button"
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
