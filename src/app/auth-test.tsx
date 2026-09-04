import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AuthenticationError,
  createAuthenticationClient,
  inspectAccessToken,
  type AuthSessionState,
} from '@/auth/auth0';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type PocPrincipal = {
  provider: 'auth0';
  issuer: string;
  externalSubject: string;
  audience: string[];
  scopes: string[];
  requestId: string;
};

function safeError(error: unknown) {
  if (error instanceof AuthenticationError) return `Authentication ${error.kind}.`;
  if (error instanceof Error && /^Backend request failed \(\d{3}\)\.$/.test(error.message)) return error.message;
  return 'The development authentication check failed.';
}

export default function AuthTestScreen() {
  if (!__DEV__ || Platform.OS === 'web') return null;
  return <NativeAuthTest />;
}

function NativeAuthTest() {
  const client = useMemo(() => createAuthenticationClient(), []);
  const [session, setSession] = useState<AuthSessionState>({status: 'signed-out'});
  const [principal, setPrincipal] = useState<PocPrincipal | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<{issuer: string; audience: string[]} | null>(null);
  const [message, setMessage] = useState('Ready. No credential is displayed or logged.');
  const [busy, setBusy] = useState(false);

  const reloadSession = useCallback(async () => setSession(await client.getSessionState()), [client]);
  useEffect(() => {
    const task = setTimeout(() => {
      reloadSession().catch((error) => setMessage(safeError(error)));
    }, 0);
    return () => clearTimeout(task);
  }, [reloadSession]);

  const perform = async (action: () => Promise<void>, missingCredentialsMessage?: string) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(
        missingCredentialsMessage && error instanceof AuthenticationError && error.kind === 'credentials'
          ? missingCredentialsMessage
          : safeError(error),
      );
    } finally {
      setBusy(false);
    }
  };

  const validateToken = async (refresh: boolean) => {
    const token = refresh ? await client.refreshAccessToken() : await client.getAccessToken();
    setTokenMetadata(inspectAccessToken(token));
    setMessage(refresh ? 'Forced Credentials Manager refresh produced a valid API access token.' : 'Credentials Manager returned a valid API access token.');
  };

  const callBackend = async () => {
    const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '');
    if (!baseUrl) throw new AuthenticationError('configuration');
    const token = await client.getAccessToken();
    inspectAccessToken(token);
    const response = await fetch(`${baseUrl}/api/v1/auth/poc`, {headers: {authorization: `Bearer ${token}`}});
    if (!response.ok) throw new Error(`Backend request failed (${response.status}).`);
    const body = await response.json() as {data?: PocPrincipal};
    if (!body.data) throw new Error('Backend request failed (500).');
    setPrincipal(body.data);
    setMessage('Backend verified the Auth0 access token through JWKS.');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Development authentication test</ThemedText>
          <ThemedText>This route is compiled only into development builds. Never enter credentials outside Auth0 Universal Login.</ThemedText>
          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="subtitle">State: {session.status}</ThemedText>
            {'expiresAt' in session && session.expiresAt && <ThemedText>Expires: {session.expiresAt}</ThemedText>}
            <ThemedText>{message}</ThemedText>
            {busy && <ActivityIndicator accessibilityLabel="Authentication operation in progress" />}
          </ThemedView>
          <View style={styles.actions}>
            <Button title="Sign in with Auth0" disabled={busy} onPress={() => perform(async () => { await client.login(); await reloadSession(); setMessage('Universal Login returned to the app.'); })} />
            <Button title="Check credentials" disabled={busy} onPress={() => perform(async () => validateToken(false), 'No stored credentials.')} />
            <Button title="Force refresh test" disabled={busy} onPress={() => perform(async () => validateToken(true))} />
            <Button title="Call development backend" disabled={busy} onPress={() => perform(callBackend, 'Backend call blocked: sign-in required.')} />
            <Button title="Sign out and clear credentials" disabled={busy} onPress={() => perform(async () => { await client.logout(); setPrincipal(null); setTokenMetadata(null); await reloadSession(); setMessage('Local credentials cleared.'); })} />
          </View>
          {tokenMetadata && <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="subtitle">Validated token metadata</ThemedText>
            <ThemedText>Issuer: {tokenMetadata.issuer}</ThemedText>
            <ThemedText>Audience: {tokenMetadata.audience.join(', ')}</ThemedText>
          </ThemedView>}
          {principal && <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="subtitle">Backend verified principal</ThemedText>
            <ThemedText>Provider: {principal.provider}</ThemedText>
            <ThemedText>Issuer: {principal.issuer}</ThemedText>
            <ThemedText>External subject: {principal.externalSubject}</ThemedText>
            <ThemedText>Audience: {principal.audience.join(', ')}</ThemedText>
            <ThemedText>Scopes: {principal.scopes.join(' ')}</ThemedText>
            <ThemedText>Request ID: {principal.requestId}</ThemedText>
          </ThemedView>}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  safeArea: {flex: 1},
  content: {padding: Spacing.four, gap: Spacing.three, paddingBottom: 120},
  panel: {padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two},
  actions: {gap: Spacing.two},
});
