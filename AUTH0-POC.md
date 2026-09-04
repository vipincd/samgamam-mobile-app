# Auth0 mobile proof-of-concept boundary

This project pins `react-native-auth0` 5.11.0. Set all three public build/runtime identifiers together for a local development build:

```text
EXPO_PUBLIC_AUTH0_DOMAIN=<development EU tenant domain>
EXPO_PUBLIC_AUTH0_CLIENT_ID=<native public client ID>
EXPO_PUBLIC_AUTH0_AUDIENCE=<dedicated Samgamam API audience>
```

Never add a client secret. `app.config.ts` conditionally activates the Auth0 config plugin and uses `samgamam` only as the local-development callback scheme with `com.samgamam.mobile.poc` as both POC native identifiers. Custom schemes are interceptable; production must use verified Universal Links/App Links and approved identifiers.

The SDK requires a custom development build and does not run in Expo Go. No prebuild, tenant call, login/logout, refresh, Keychain/Keystore, Universal Link, or App Link flow was executed in Phase 2B. The code uses the SDK Credentials Manager, not AsyncStorage.

## Phase 2D runtime verification

The development-only `Auth Test` route requests `openid profile email offline_access` plus the dedicated development API audience. It supports Universal Login, Credentials Manager state/retrieval, forced refresh, the development backend verification call, and local credential clearing. Credentials returned by `webAuth.authorize()` are explicitly saved to the SDK Credentials Manager. Tokens are never shown, logged, or stored in component state.

Real identifiers and the local API base URL belong only in ignored `.env.local`; `.env.example` contains placeholders. Callback and logout URL shapes remain:

- `samgamam://{development-auth0-domain}/ios/com.samgamam.mobile.poc/callback`
- `samgamam://{development-auth0-domain}/android/com.samgamam.mobile.poc/callback`

Observed on an iOS Simulator in Phase 2D: the native development build launched; Auth0 Universal Login returned through the native callback; the app displayed signed-in state; Credentials Manager returned a usable access token; the development backend accepted that token after RS256/JWKS validation; signed-in state survived process termination and relaunch; a forced Credentials Manager refresh produced a usable access token; and the protected backend call succeeded after that forced refresh. After logout, the app remained signed out, `Check credentials` displayed `No stored credentials.`, and `Call development backend` displayed `Backend call blocked: sign-in required.` The latter path obtains credentials before invoking `fetch`, so this is runtime evidence that the protected action was blocked before a network request.

This verifies local credential clearing, but does not independently verify termination of the provider-side Auth0 SSO session. Auth0 refresh-token rotation/reuse detection at the provider, physical iOS device behavior, Android runtime behavior, Universal Links/App Links, and production readiness were not independently verified. Expo Go is not a substitute. The route remains development-only and is not the Samgamam product login UI.

`Phase 2D iOS Simulator development flow verified; not production-approved.`
