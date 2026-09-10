import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { brand } from '../brand';

export function BrandedLaunch({ onReady, slow, assetError, onRetry, onRecover }: {
  onReady: () => void; slow: boolean; assetError: boolean;
  onRetry: () => void; onRecover: () => void;
}) {
  return (
    <View style={styles.screen} testID="branded-launch">
      <View style={styles.logoPosition}>
        <Image source={brand.logo} resizeMode="contain" style={styles.logo}
          accessibilityLabel={`Samgamam. ${brand.caption}`} onLoad={onReady} onError={onReady} />
      </View>
      <View style={styles.progress} accessibilityLiveRegion="polite">
        {slow || assetError ? <>
          <Text style={styles.title}>{assetError ? 'Let’s try that again' : 'Taking a little longer'}</Text>
          <Text style={styles.copy}>{assetError ? 'We couldn’t load the app’s resources.' : 'Your connection may be slow. You can check the backend settings while we reconnect.'}</Text>
          <Pressable accessibilityRole="button" onPress={assetError ? onRetry : onRecover}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}>
            <Text style={styles.buttonText}>{assetError ? 'Retry loading' : 'Connection settings'}</Text>
          </Pressable>
        </> : <>
          <ActivityIndicator color={brand.primary} accessibilityLabel="Preparing Samgamam" />
          <Text style={styles.copy}>{brand.caption}</Text>
        </>}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.canvas },
  logoPosition: { position: 'absolute', top: '50%', left: 32, right: 32, height: 62, marginTop: -31, alignItems: 'center' },
  logo: { width: '100%', maxWidth: 280, height: 62 },
  progress: { position: 'absolute', top: '50%', marginTop: 82, left: 32, right: 32, alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '600', color: brand.ink, textAlign: 'center' },
  copy: { fontSize: 13, lineHeight: 21, color: brand.muted, textAlign: 'center', maxWidth: 310 },
  button: { minHeight: 48, paddingHorizontal: 22, paddingVertical: 14, backgroundColor: brand.primaryStrong, borderRadius: 12 },
  buttonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
