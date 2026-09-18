import {
  createAuthenticationClient,
  type AuthenticationClient,
  getSanitizedAuthMessage,
} from './auth0';
import { apiClient, ApiError, getErrorMessage } from '../api/client';
import type { AuthSessionResponse } from '../api/types';

export type ProductAuthStatus =
  | 'initializing'
  | 'signedOut'
  | 'signingIn'
  | 'signedIn'
  | 'refreshing'
  | 'expired'
  | 'error';

export interface ProductAuthState {
  status: ProductAuthStatus;
  session: AuthSessionResponse;
  errorMessage: string | null;
}

export type AuthStateListener = (state: ProductAuthState) => void;

const defaultSession: AuthSessionResponse = {
  authenticated: false,
  locale: 'en',
  viewer: null,
};

export function normalizeSession(
  session: AuthSessionResponse | null | undefined,
): AuthSessionResponse {
  return {
    authenticated: Boolean(session?.authenticated),
    locale: session?.locale ?? 'en',
    viewer: session?.viewer ?? null,
  };
}

export class SessionManager {
  private state: ProductAuthState = {
    status: 'initializing',
    session: defaultSession,
    errorMessage: null,
  };
  private listeners = new Set<AuthStateListener>();
  private auth0Client: AuthenticationClient | undefined;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(auth0ClientOverride?: AuthenticationClient) {
    try {
      this.auth0Client = auth0ClientOverride ?? createAuthenticationClient();
    } catch {
      this.auth0Client = undefined;
    }

    // Connect ApiClient 401 interceptor
    apiClient.setTokenExpiredHandler(async () => {
      return this.handleTokenExpired();
    });
  }

  getState(): ProductAuthState {
    return this.state;
  }

  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: Partial<ProductAuthState>) {
    this.state = {
      ...this.state,
      ...next,
    };
    this.listeners.forEach((listener) => listener(this.state));
  }

  async initialize(): Promise<ProductAuthState> {
    this.setState({ status: 'initializing', errorMessage: null });

    try {
      // 1. Initialize API client stored settings (base URL, existing tokens)
      await apiClient.initialize();

      // 2. Check if Auth0 is configured and has credentials
      if (!this.auth0Client) {
        // Auth0 not configured; check if we have a valid stored session
        if (apiClient.hasStoredAccessToken()) {
          try {
            const rawSession = await apiClient.getSession();
            const session = normalizeSession(rawSession);
            if (session.authenticated) {
              this.setState({ status: 'signedIn', session, errorMessage: null });
              return this.state;
            }
          } catch {
            // Session invalid
          }
        }
        this.setState({ status: 'signedOut', session: defaultSession, errorMessage: null });
        return this.state;
      }

      const authSessionState = await this.auth0Client.checkCredentials();

      if (authSessionState.status === 'signed-in') {
        // Try restoring session from backend
        const restored = await this.restoreBackendSession();
        if (restored) {
          return this.state;
        }
      }

      // If no valid Auth0 credentials or session could not be established
      await this.clearLocalSession();
      this.setState({ status: 'signedOut', session: defaultSession, errorMessage: null });
      return this.state;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.setState({
        status: 'error',
        session: defaultSession,
        errorMessage,
      });
      return this.state;
    }
  }

  private async restoreBackendSession(): Promise<boolean> {
    if (!this.auth0Client) return false;

    try {
      // Check if current stored token in apiClient is already valid
      if (apiClient.hasStoredAccessToken()) {
        try {
          const rawSession = await apiClient.getSession();
          const session = normalizeSession(rawSession);
          if (session.authenticated) {
            this.setState({ status: 'signedIn', session, errorMessage: null });
            return true;
          }
        } catch (sessionError) {
          // Token might be expired, proceed to exchange
          if (!(sessionError instanceof ApiError && sessionError.status === 401)) {
            // Network error
            this.setState({
              status: 'error',
              errorMessage: getErrorMessage(sessionError),
            });
            return false;
          }
        }
      }

      // Exchange Auth0 access token with backend
      const credentials = await this.auth0Client.getCredentials();
      const loginResponse = await apiClient.establishAuth0Session(
        credentials.accessToken,
        credentials.idToken,
      );

      const session = normalizeSession({
        authenticated: true,
        locale: loginResponse.locale,
        viewer: loginResponse.viewer,
      });

      this.setState({ status: 'signedIn', session, errorMessage: null });
      return true;
    } catch {
      // If exchange failed
      return false;
    }
  }

  async signIn(): Promise<void> {
    if (!this.auth0Client) {
      throw new Error('Authentication provider is not configured.');
    }

    this.setState({ status: 'signingIn', errorMessage: null });

    try {
      await this.auth0Client.login();
      const credentials = await this.auth0Client.getCredentials();

      const loginResponse = await apiClient.establishAuth0Session(
        credentials.accessToken,
        credentials.idToken,
      );

      const session = normalizeSession({
        authenticated: true,
        locale: loginResponse.locale,
        viewer: loginResponse.viewer,
      });

      this.setState({ status: 'signedIn', session, errorMessage: null });
    } catch (error) {
      const sanitized = getSanitizedAuthMessage(error);
      this.setState({
        status: 'signedOut',
        session: defaultSession,
        errorMessage: sanitized || getErrorMessage(error),
      });
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (apiClient.hasStoredAccessToken()) {
        await apiClient.logout().catch(() => undefined);
      }
    } finally {
      if (this.auth0Client) {
        await this.auth0Client.logout().catch(() => undefined);
      }
      await this.clearLocalSession();
      this.setState({
        status: 'signedOut',
        session: defaultSession,
        errorMessage: null,
      });
    }
  }

  async handleTokenExpired(): Promise<boolean> {
    // If a refresh is already in flight, await it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<boolean> {
    if (!this.auth0Client) {
      await this.clearLocalSession();
      this.setState({ status: 'expired', session: defaultSession, errorMessage: 'Session expired.' });
      return false;
    }

    this.setState({ status: 'refreshing' });

    try {
      // Force refresh Auth0 credentials using the refresh token
      const credentials = await this.auth0Client.getCredentials(true);
      if (!credentials.accessToken) {
        throw new Error('No access token returned after refresh');
      }

      // Re-establish session with backend
      const loginResponse = await apiClient.establishAuth0Session(
        credentials.accessToken,
        credentials.idToken,
      );

      const session = normalizeSession({
        authenticated: true,
        locale: loginResponse.locale,
        viewer: loginResponse.viewer,
      });

      this.setState({ status: 'signedIn', session, errorMessage: null });
      return true;
    } catch {
      await this.clearLocalSession();
      this.setState({
        status: 'expired',
        session: defaultSession,
        errorMessage: 'Your session has expired. Please sign in again.',
      });
      return false;
    }
  }

  private async clearLocalSession() {
    await apiClient.clearStoredSession();
  }
}

export const sessionManager = new SessionManager();
