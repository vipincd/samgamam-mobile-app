# Auth0 mobile proof-of-concept boundary

This project pins `react-native-auth0` 5.11.0. Set all three public build/runtime identifiers together for a local development build:

```text
EXPO_PUBLIC_AUTH0_DOMAIN=<development EU tenant domain>
EXPO_PUBLIC_AUTH0_CLIENT_ID=<native public client ID>
EXPO_PUBLIC_AUTH0_AUDIENCE=<dedicated Samgamam API audience>
```

Never add a client secret. `app.config.ts` conditionally activates the Auth0 config plugin and uses `samgamam` only as the local-development callback scheme with `com.samgamam.mobile.poc` as both POC native identifiers. Custom schemes are interceptable; production must use verified Universal Links/App Links and approved identifiers.

The SDK requires a custom development build and does not run in Expo Go. No prebuild, tenant call, login/logout, refresh, Keychain/Keystore, Universal Link, or App Link flow was executed in Phase 2B. The code uses the SDK Credentials Manager, not AsyncStorage.

## Phase 2C development harness

The development-only `Auth Test` route requests `openid profile email offline_access` plus the dedicated development API audience. It supports Universal Login, Credentials Manager state/retrieval, forced refresh, the development backend verification call, and logout that clears the provider session and local credentials. Tokens are never shown, logged, or stored in component state.

Real identifiers and the local API base URL belong only in ignored `.env.local`; `.env.example` contains placeholders. Callback and logout URL shapes remain:

- `samgamam://{development-auth0-domain}/ios/com.samgamam.mobile.poc/callback`
- `samgamam://{development-auth0-domain}/android/com.samgamam.mobile.poc/callback`

This machine has no Android SDK/emulator/device and no full Xcode, simulator, or Apple signing identity. Consequently, no real login, native callback, Keychain/Keystore persistence, refresh rotation, backend token verification, restart restoration, or logout flow has been claimed. Expo Go is not a substitute. The route remains development-only and is not the Samgamam product login UI.

`Locally validated integration boundary; real provider authentication not yet verified.`
