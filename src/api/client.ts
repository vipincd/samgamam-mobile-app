import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type {
  AnalyticsOverview,
  AuthSessionResponse,
  CopilotAction,
  CopilotResponse,
  DiscussionListResponse,
  EventListResponse,
  GroupListResponse,
  HealthResponse,
  HelpResponse,
  LoginResponse,
  NotificationListResponse,
  RecommendationsResponse,
  RsvpResponse,
  RsvpState,
  SearchResponse,
} from './types';

const ACCESS_TOKEN_KEY = 'samgamam.access_token';
const API_BASE_URL_KEY = 'samgamam.api_base_url';

let secureStoreAvailable: boolean | null = null;

async function canUseSecureStore() {
  if (secureStoreAvailable === null) {
    secureStoreAvailable = await SecureStore.isAvailableAsync();
  }

  return secureStoreAvailable;
}

async function readStoredValue(key: string) {
  if (!(await canUseSecureStore())) {
    return null;
  }

  return SecureStore.getItemAsync(key);
}

async function writeStoredValue(key: string, value: string) {
  if (!(await canUseSecureStore())) {
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function removeStoredValue(key: string) {
  if (!(await canUseSecureStore())) {
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

function normalizeBaseUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new URL(value.trim());
  const localHosts = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
  const octets = parsed.hostname.split('.').map(Number);
  const privateLanHost =
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
  const developmentLanHttp = __DEV__ && parsed.protocol === 'http:' && privateLanHost;

  if (parsed.protocol !== 'https:' && !localHosts.has(parsed.hostname) && !developmentLanHttp) {
    throw new Error('Samgamam requires HTTPS outside local development.');
  }

  return parsed.origin;
}

function resolveBaseUrl(override?: string | null) {
  const fallbackUrl =
    Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
  const configuredUrl = override ?? process.env.EXPO_PUBLIC_API_URL ?? fallbackUrl;
  return normalizeBaseUrl(configuredUrl) ?? fallbackUrl;
}

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    searchParams.append(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function readApiError(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object'
  ) {
    const error = payload.error as { code?: unknown; message?: unknown };

    return {
      code: typeof error.code === 'string' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
    };
  }

  return {
    code: undefined,
    message: undefined,
  };
}

export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(
    message: string,
    options: {
      code?: string;
      details?: unknown;
      status: number;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while talking to the Samgamam backend.';
}

class ApiClient {
  private accessToken: string | null = null;
  private initialized = false;
  private runtimeBaseUrl: string | null = null;

  getBaseUrl() {
    return resolveBaseUrl(this.runtimeBaseUrl);
  }

  private getApiUrl() {
    return `${this.getBaseUrl()}/api`;
  }

  async initialize() {
    if (!this.initialized) {
      const [storedAccessToken, storedBaseUrl] = await Promise.all([
        readStoredValue(ACCESS_TOKEN_KEY),
        readStoredValue(API_BASE_URL_KEY),
      ]);

      this.accessToken = storedAccessToken;
      this.runtimeBaseUrl = normalizeBaseUrl(storedBaseUrl);
      this.initialized = true;
    }

    return {
      apiBaseUrl: this.getBaseUrl(),
      hasAccessToken: Boolean(this.accessToken),
    };
  }

  async setApiBaseUrl(value: string | null) {
    const normalized = normalizeBaseUrl(value);

    this.runtimeBaseUrl = normalized;
    this.initialized = true;

    if (normalized) {
      await writeStoredValue(API_BASE_URL_KEY, normalized);
    } else {
      await removeStoredValue(API_BASE_URL_KEY);
    }

    return this.getBaseUrl();
  }

  private async setAccessToken(token: string | null) {
    this.accessToken = token;
    this.initialized = true;

    if (token) {
      await writeStoredValue(ACCESS_TOKEN_KEY, token);
    } else {
      await removeStoredValue(ACCESS_TOKEN_KEY);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    await this.initialize();

    const headers = new Headers(options.headers ?? {});

    headers.set('Accept', 'application/json');

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    let response: Response;

    try {
      response = await fetch(`${this.getApiUrl()}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (error) {
      throw new ApiError(
        `Unable to reach Samgamam at ${this.getBaseUrl()}. Check the backend URL and try again.`,
        {
          code: 'network_error',
          details: error,
          status: 0,
        },
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      if (response.status === 401) {
        await this.setAccessToken(null);
      }

      const apiError = readApiError(payload);

      throw new ApiError(
        apiError.message ?? `Samgamam responded with status ${response.status}.`,
        {
          code: apiError.code,
          details: payload,
          status: response.status,
        },
      );
    }

    return payload as T;
  }

  async healthCheck() {
    return this.request<HealthResponse>('/healthz');
  }

  async getSession() {
    return this.request<AuthSessionResponse>('/auth/session');
  }

  async login(email: string, password: string) {
    const response = await this.request<LoginResponse>('/auth/login', {
      body: JSON.stringify({ email, password }),
      method: 'POST',
    });

    await this.setAccessToken(response.accessToken);
    return response;
  }

  async logout() {
    try {
      await this.request<{ signedOut: boolean }>('/auth/logout', {
        method: 'POST',
      });
    } finally {
      await this.setAccessToken(null);
    }
  }

  async getEvents(locale?: string) {
    return this.request<EventListResponse>(`/events${buildQuery({ locale })}`);
  }

  async searchEvents(query: string, locale?: string) {
    return this.request<SearchResponse>(
      `/search${buildQuery({ locale, pageSize: 12, q: query.trim() })}`,
    );
  }

  async getGroups(locale?: string) {
    return this.request<GroupListResponse>(`/groups${buildQuery({ locale })}`);
  }

  async getDiscussions(groupId: string, locale?: string) {
    return this.request<DiscussionListResponse>(
      `/groups/${encodeURIComponent(groupId)}/discussions${buildQuery({ locale })}`,
    );
  }

  async createDiscussion(groupId: string, body: string, pinned = false) {
    return this.request<{
      post: DiscussionListResponse['discussions'][number];
    }>(`/groups/${encodeURIComponent(groupId)}/discussions`, {
      body: JSON.stringify({ body, pinned }),
      method: 'POST',
    });
  }

  async rsvpToEvent(eventId: string, state: RsvpState = 'going') {
    return this.request<RsvpResponse>(`/events/${encodeURIComponent(eventId)}/rsvp`, {
      body: JSON.stringify({ state }),
      method: 'POST',
    });
  }

  async getNotifications() {
    return this.request<NotificationListResponse>('/notifications');
  }

  async markNotificationRead(notificationId: string) {
    return this.request<{
      notification: NotificationListResponse['notifications'][number];
    }>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
    });
  }

  async getRecommendations(limit = 3) {
    return this.request<RecommendationsResponse>(
      `/recommendations${buildQuery({ limit })}`,
    );
  }

  async getAnalytics() {
    return this.request<AnalyticsOverview>('/analytics');
  }

  async searchHelp(query: string) {
    return this.request<HelpResponse>('/ai/help', {
      body: JSON.stringify({ query }),
      method: 'POST',
    });
  }

  async askCopilot(action: CopilotAction, prompt: string) {
    return this.request<CopilotResponse>('/ai/copilot', {
      body: JSON.stringify({ action, prompt }),
      method: 'POST',
    });
  }
}

export const apiClient = new ApiClient();
