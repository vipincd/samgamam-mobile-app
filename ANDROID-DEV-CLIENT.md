# Android development-client testing

## Setup status (2026-09-09)

Canonical repository: `/Users/vidas/dev/projects/samgamammobile`, branch `feature/integrate-auth0-phase-2d`.

- Expo remains `~54.0.37`. Added the SDK-compatible `expo-dev-client ~6.0.21`; `expo install --check` passed.
- Android-only prebuild generated the ignored `android/` directory. Existing iOS native files were not regenerated. Existing npm start/android/ios scripts were preserved.
- Android package: `com.samgamam.mobile`. Generated development-client scheme: `exp+mobile-app`.
- Generated Auth0 callback uses the existing configured domain, scheme `samgamam`, and `/android/com.samgamam.mobile/callback` path. No Dashboard settings were changed or verified. Keep existing Auth0 configuration intact.
- Homebrew installed Android platform tools and command-line tools. SDK root: `/opt/homebrew/share/android-commandlinetools`. JDK 17 is available at `$HOME/.sdkman/candidates/java/17.0.19-amzn`; the command-line SDK manager runs with the existing JDK 21.
- SDK licenses are accepted. Android API 36, build-tools 36.0.0, and NDK 27.1.12297006 are installed; the successful build also installed build-tools 35.0.0 and CMake 3.22.1 under the accepted licenses.
- On 2026-09-10, the OnePlus `CPH2613` was detected and authorized by ADB. `npx expo run:android --device CPH2613 --no-bundler` built successfully in 3m 17s. APK: `android/app/build/outputs/apk/debug/app-debug.apk` (ignored generated output).
- Installation is now confirmed by `pm path com.samgamam.mobile`. Opening the LAN development-client URI returned `Status: ok` with `com.samgamam.mobile/.MainActivity` in the foreground. Metro bundled Android successfully and has established connections from the phone's Wi-Fi address. A screenshot showed the Samgamam preparation screen under the first-run developer-menu welcome sheet; the user must tap Continue. Event-screen rendering and app-originated backend success still need confirmation.
- Canonical Metro is running on 8082 with `--scheme exp+mobile-app` and the process-only backend override `http://192.168.0.77:3002`; the canonical backend is running on 3002. `.env.local` was not changed.
- From the authorized phone, Wi-Fi requests to the Mac's LAN address returned `packager-status:running` on 8082 and expected unauthenticated HTTP 401 on `/api/v1/auth/poc` on 3002. USB reverse forwarding on both ports returned the same results. The backend events endpoint returned HTTP 200 from the Mac.
- These are transport checks, not proof of app rendering or app-originated backend access. Wireless QR launch with USB physically disconnected remains pending installation and user scanning the QR code. No Auth0 sign-in/refresh/logout or product-authentication change was performed.


## Complete prerequisites

Review and accept the SDK agreements you agree to interactively:

```bash
JAVA_HOME="$HOME/.sdkman/candidates/java/21.0.3-tem" \
  sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools --licenses
```

Then install the SDK components required by this React Native version:

```bash
JAVA_HOME="$HOME/.sdkman/candidates/java/21.0.3-tem" \
  sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools \
  'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006'
```

Unlock the phone, enable Developer options and USB debugging, connect a data-capable USB cable, and approve the USB-debugging prompt. `adb devices -l` must list the intended phone as `device`, not `unauthorized` or `offline`. If ADB stalls before listing devices, reconnect the cable and resolve any Mac accessory-access prompt; do not assume authorization succeeded.

## First build / native rebuild

Run only after prerequisites and phone authorization succeed:

```bash
cd /Users/vidas/dev/projects/samgamammobile
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME="$HOME/.sdkman/candidates/java/17.0.19-amzn"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
npx expo run:android --device --no-bundler
```

Choose the connected physical phone. For the currently connected OnePlus, `--device CPH2613` selects it directly; this Expo CLI expects a device name, not its ADB serial. `--port` cannot be combined with `--no-bundler`; Metro is started separately on 8082. Preserve an existing installation's data. If installation fails because of a signing-key mismatch, stop rather than uninstalling the app. Android native generation is already present; future native configuration changes may require `npx expo prebuild --platform android --no-install` before rebuilding. Review any generated changes to package scripts; iOS need not be regenerated for Android-only work.

## USB testing

With one intended phone attached (use `adb -s DEVICE_SERIAL` if multiple devices exist):

```bash
adb reverse tcp:8082 tcp:8082
adb reverse tcp:3002 tcp:3002
cd /Users/vidas/dev/projects/samgamammobile
EXPO_PUBLIC_API_URL=http://127.0.0.1:3002 npx expo start --dev-client --localhost --port 8082 --scheme exp+mobile-app
```

Reuse an existing correctly configured canonical Metro instead of starting a second instance. The existing ignored environment configuration uses loopback port 3002 and works on Android only with reverse forwarding. Open the installed development app or press `a` in Metro. Reverse mappings may need to be reapplied after reconnecting the cable.

## Wireless QR testing and future sessions

Connect the phone and Mac to the same reachable LAN. Determine the Mac's current Wi-Fi IPv4 address (`ipconfig getifaddr en0` on this Mac). From the phone's browser, first verify `http://MAC_LAN_IP:8082/status` displays `packager-status:running`, and `http://MAC_LAN_IP:3002/api/v1/auth/poc` responds with an unauthenticated rejection (401). Do not send credentials for these connectivity checks. A timeout means connectivity is not verified; check network isolation, VPN routing, and approved firewall access rather than disabling protections.

If the existing Metro uses the loopback backend URL, stop that canonical Metro in its owning terminal and restart it with the following command. This override leaves `.env.local` and Auth0 values unchanged and also lets the iOS simulator reach the same backend:

```bash
cd /Users/vidas/dev/projects/samgamammobile
SAMGAMAM_LAN_IP="$(ipconfig getifaddr en0)"
[ -n "$SAMGAMAM_LAN_IP" ] && \
  EXPO_PUBLIC_API_URL="http://$SAMGAMAM_LAN_IP:3002" \
  REACT_NATIVE_PACKAGER_HOSTNAME="$SAMGAMAM_LAN_IP" \
  npx expo start --dev-client --lan --port 8082 --scheme exp+mobile-app
```

The explicit `--scheme exp+mobile-app` selects the generated Android scheme because the existing iOS native build does not share that development-client scheme. This preserves the iOS native setup. Scan the displayed QR code with the phone's camera/QR reader and open the installed Samgamam development client. The QR target uses `exp+mobile-app://expo-development-client/?url=...`. This requires the development app to have been installed first; Expo Go cannot supply the Auth0 native module. Do not scan a localhost QR for wireless access: the phone's localhost is the phone.

If the canonical backend is absent, start it separately using its existing development environment:

```bash
cd /Users/vidas/dev/projects/samgamam
npm run dev -- --hostname 0.0.0.0 --port 3002
```

Do not start duplicate services. Refresh the LAN address when networks change. JavaScript/TypeScript-only changes normally need Metro reload/Fast Refresh, not a native build. Adding/updating native libraries (including this first dev-client install), changing native plugins, package identifiers, schemes, permissions, or Expo SDK requires a new native build. No Expo upgrade was performed here.

Documentation references: [Expo local development builds](https://docs.expo.dev/guides/local-app-development/), [using development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/).


## LAN URL correction (2026-09-10)

The first cable-free attempt reported an unreachable loopback backend URL. Source inspection found that a saved Profile backend URL takes precedence over the environment and that the client rejected HTTP private-LAN URLs despite the Profile helper advertising them. `src/api/client.ts` now permits HTTP RFC1918 IPv4 addresses only when `__DEV__` is true. Release restrictions, token storage, and product authentication are unchanged. Thirteen URL regressions plus the existing product-authentication regression passed (14 tests); typecheck and targeted ESLint passed.

Metro was restarted with the LAN backend override and a cleared Metro transform cache, not cleared phone data. Rescan the QR to load the updated JavaScript. In Profile → Backend connection, save `http://192.168.0.77:3002` (use the Mac's current LAN IP if it changes). A saved loopback override must be replaced through that existing control. No native rebuild is required for this JavaScript fix. App-originated backend success and the final wireless QR result remain pending confirmation on the phone.


## User-confirmed wireless result (2026-09-10)

After the LAN URL correction and instructions to keep USB disconnected, rescan the QR, and save the Mac's LAN backend URL, the user confirmed that events are loading in the app. This closes the wireless app/backend loading check as user-reported evidence. The final cable-free screen and QR scan were not independently observed by the agent. Earlier direct checks established the installed Android activity, Android bundling, and phone-to-Mac LAN connectivity. This does not verify Android Auth0 sign-in, refresh, logout, or production readiness. The separate non-logout credential-check display-state finding remains open. No commit or push was performed.
