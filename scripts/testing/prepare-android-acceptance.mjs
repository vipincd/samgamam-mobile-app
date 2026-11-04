// Generated-native overlay for locally signed, bundled acceptance APKs only.
// Run after prebuild. Never include this overlay in a store/distribution build.
import { mkdirSync, writeFileSync } from 'node:fs';
if (process.env.EXPO_PUBLIC_LOCAL_ACCEPTANCE !== '1' || process.env.EXPO_NO_DOTENV !== '1' || process.env.EXPO_PUBLIC_API_URL !== 'http://127.0.0.1:4318') {
  throw new Error('Acceptance builds require dotenv disabled and the loopback mock API');
}
mkdirSync('android/app/src/release/res/xml', { recursive: true });
writeFileSync('android/app/src/release/AndroidManifest.xml', `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:networkSecurityConfig="@xml/acceptance_network_security" /></manifest>\n`);
writeFileSync('android/app/src/release/res/xml/acceptance_network_security.xml', `<network-security-config><base-config cleartextTrafficPermitted="false" /><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain></domain-config></network-security-config>\n`);
