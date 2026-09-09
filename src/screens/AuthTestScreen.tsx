import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '../api/client';
import {
  AuthenticationError,
  createAuthenticationClient,
  getSanitizedAuthMessage,
  type AuthenticationClient,
  type AuthSessionState,
} from '../auth/auth0';
import { Button, InlineNotice, Pill, ScreenIntro, Surface } from '../components/ui';
import { theme } from '../theme';

const INITIAL_MESSAGE = 'Ready. Credentials and tokens are never displayed or logged.';

export async function logoutAndReconcileSession(
  client: AuthenticationClient,
): Promise<{ session: AuthSessionState; message: string }> {
  let logoutMessage: string | undefined;
  try {
    await client.logout();
  } catch (error) {
    logoutMessage = getSanitizedAuthMessage(error);
  }

  try {
    const session = await client.checkCredentials();
    return {
      session,
      message: logoutMessage ?? (session.status === 'signed-out'
        ? 'Auth0 credentials were cleared.'
        : 'Auth0 credential clearing could not be confirmed.'),
    };
  } catch (error) {
    return {
      session: { status: 'unknown' },
      message: logoutMessage ?? getSanitizedAuthMessage(error),
    };
  }
}

export async function callAuth0PocBackend(
  client: AuthenticationClient,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const token = await client.getAccessToken();
  const response = await fetchImplementation(`${apiClient.getBaseUrl()}/api/v1/auth/poc`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`backend_status_${response.status}`);
  }
}

export function AuthTestScreen() {
  if (!__DEV__ || Platform.OS === 'web') {
    return null;
  }

  return <NativeAuthTestScreen />;
}

function NativeAuthTestScreen() {
  const client = useMemo(() => {
    try {
      return createAuthenticationClient();
    } catch {
      return undefined;
    }
  }, []);
  const [session, setSession] = useState<AuthSessionState>(
    client ? { status: 'signed-out' } : { status: 'unconfigured' },
  );
  const [message, setMessage] = useState(INITIAL_MESSAGE);
  const [busy, setBusy] = useState(false);

  const reloadSession = useCallback(async () => {
    if (!client) {
      setSession({ status: 'unconfigured' });
      return;
    }
    setSession(await client.checkCredentials());
  }, [client]);

  useEffect(() => {
    void reloadSession().catch((error) => setMessage(getSanitizedAuthMessage(error)));
  }, [reloadSession]);

  async function perform(action: (activeClient: AuthenticationClient) => Promise<void>) {
    if (!client) {
      setMessage(getSanitizedAuthMessage(new AuthenticationError('configuration')));
      return;
    }

    setBusy(true);
    try {
      await action(client);
    } catch (error) {
      if (error instanceof Error && /^backend_status_\d{3}$/.test(error.message)) {
        setMessage('The development backend rejected the request.');
      } else {
        setMessage(getSanitizedAuthMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenIntro
        eyebrow="Development only"
        title="Auth Test"
        subtitle="Isolated Auth0 verification. Product sign-in and its stored session are unchanged."
      />

      <Surface style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.sectionTitle}>Status</Text>
          <Pill
            label={session.status}
            tone={session.status === 'signed-in' ? 'success' : 'default'}
          />
        </View>
        {'expiresAt' in session && session.expiresAt ? (
          <Text style={styles.metadata}>Credentials expire: {session.expiresAt}</Text>
        ) : null}
        <InlineNotice message={message} />
        {busy ? <ActivityIndicator color={theme.colors.accent} /> : null}
      </Surface>

      <View style={styles.actions}>
        <Button
          disabled={busy}
          label="Sign in with Auth0"
          onPress={() =>
            void perform(async (activeClient) => {
              await activeClient.login();
              await reloadSession();
              setMessage('Universal Login returned successfully.');
            })
          }
        />
        <Button
          disabled={busy}
          label="Check credentials"
          onPress={() =>
            void perform(async (activeClient) => {
              await activeClient.getAccessToken();
              await reloadSession();
              setMessage('Credentials Manager returned usable credentials.');
            })
          }
          variant="secondary"
        />
        <Button
          disabled={busy}
          label="Force credential refresh"
          onPress={() =>
            void perform(async (activeClient) => {
              await activeClient.getAccessToken(true);
              await reloadSession();
              setMessage('Credentials Manager completed a forced refresh.');
            })
          }
          variant="secondary"
        />
        <Button
          disabled={busy}
          label="Call development backend"
          onPress={() =>
            void perform(async (activeClient) => {
              await callAuth0PocBackend(activeClient);
              setMessage('The development backend accepted the Auth0 credential.');
            })
          }
          variant="secondary"
        />
        <Button
          disabled={busy}
          label="Sign out and clear credentials"
          onPress={() =>
            void perform(async (activeClient) => {
              const result = await logoutAndReconcileSession(activeClient);
              setSession(result.session);
              setMessage(result.message);
            })
          }
          variant="ghost"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  metadata: { color: theme.colors.muted, fontSize: 13 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  statusCard: { gap: 14 },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
