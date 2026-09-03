# Auth0 mobile proof-of-concept boundary

This project pins `react-native-auth0` 5.11.0. Set all three public build/runtime identifiers together for a local development build:

```text
EXPO_PUBLIC_AUTH0_DOMAIN=<development EU tenant domain>
EXPO_PUBLIC_AUTH0_CLIENT_ID=<native public client ID>
EXPO_PUBLIC_AUTH0_AUDIENCE=<dedicated Samgamam API audience>
```

Never add a client secret. `app.config.ts` conditionally activates the Auth0 config plugin and uses `samgamam` only as the local-development callback scheme with `com.samgamam.mobile.poc` as both POC native identifiers. Custom schemes are interceptable; production must use verified Universal Links/App Links and approved identifiers.

The SDK requires a custom development build and does not run in Expo Go. No prebuild, tenant call, login/logout, refresh, Keychain/Keystore, Universal Link, or App Link flow was executed in Phase 2B. The code uses the SDK Credentials Manager, not AsyncStorage.

`Locally validated integration boundary; real provider authentication not yet verified.`
