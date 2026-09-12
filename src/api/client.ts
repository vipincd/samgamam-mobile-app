import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type {
  AnalyticsOverview,
  ApiV1Meta,
  ApiV1Response,
  AuthSessionResponse,
  CopilotAction,
  CopilotResponse,
  DiscussionListResponse,
  DiscussionPost,
  EventListResponse,
  EventSummary,
  GroupListResponse,
  GroupSummary,
  HealthResponse,
  HelpResponse,
  LoginResponse,
  MeResponse,
  NotificationListResponse,
  RecommendationsResponse,
  RsvpResponse,
  RsvpState,
  SearchResponse,
} from './types';

const ACCESS_TOKEN_KEY = 'samgamam.access_token';
const API_BASE_URL_KEY = 'samgamam.api_base_url';

async function isSecureStoreAvailable() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function readStoredValue(key: string) {
  if (!(await isSecureStoreAvailable())) {
    return null;
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeStoredValue(key: string, value: string) {
  if (!(await isSecureStoreAvailable())) {
    return;
  }

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // If SecureStore fails, continue with in-memory state.
  }
}

async function removeStoredValue(key: string) {
  if (!(await isSecureStoreAvailable())) {
    return;
  }

  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore removal failures in development.
  }
}

function normalizeBaseUrl(raw?: string | null) {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid URL including http:// or https://.');
  }

  if (parsed.protocol === 'https:') {
    return parsed.origin;
  }

  if (parsed.protocol !== 'http:') {
    throw new Error('Samgamam requires HTTPS outside local development.');
  }

  const isDev = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);

  if (isDev) {
    const localHosts = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
    const octets = parsed.hostname.split('.').map(Number);
    const privateLanHost =
      octets.length === 4 &&
      octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
      (octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168));

    if (localHosts.has(parsed.hostname) || privateLanHost) {
      return parsed.origin;
    }
  }

  throw new Error('Samgamam requires HTTPS outside local development.');
}

function resolveBaseUrl(override?: string | null) {
  const isDev = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);
  const fallbackUrl = isDev
    ? Platform.OS === 'android'
      ? 'http://10.0.2.2:3000'
      : 'http://localhost:3000'
    : 'https://samgamam.vercel.app';
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

export function normalizeEventSummary(event: EventSummary): EventSummary {
  const isUnlimited = event.capacityMode === 'unlimited' || event.capacity === null;
  const attendeeCount =
    event.attendeeCount ??
    (event.capacity != null && event.remainingCapacity != null
      ? Math.max(0, event.capacity - event.remainingCapacity)
      : 0);
  const remainingCapacity = isUnlimited
    ? 999
    : event.remainingCapacity != null
      ? event.remainingCapacity
      : 0;
  const availability =
    event.availability ?? (isUnlimited || remainingCapacity > 0 ? 'available' : 'full');

  return {
    ...event,
    attendeeCount,
    availability,
    capacity: isUnlimited ? null : (event.capacity ?? null),
    capacityMode: isUnlimited ? 'unlimited' : 'limited',
    remainingCapacity,
  };
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

  hasStoredAccessToken() {
    return Boolean(this.accessToken);
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

  async getSession(): Promise<AuthSessionResponse> {
    if (!this.accessToken) {
      return {
        authenticated: false,
        locale: 'en',
        viewer: null,
      };
    }

    try {
      const response = await this.request<any>('/v1/me');
      const viewer = response?.data?.viewer ?? response?.data?.user ?? response?.viewer ?? null;
      const locale = response?.data?.locale ?? response?.locale ?? 'en';
      return {
        authenticated: Boolean(viewer || response?.authenticated),
        locale,
        viewer,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await this.setAccessToken(null);
        return {
          authenticated: false,
          locale: 'en',
          viewer: null,
        };
      }
      throw error;
    }
  }

  async getViewerProfile(locale?: string): Promise<MeResponse> {
    return this.request<MeResponse>(`/v1/me${buildQuery({ locale })}`);
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

  async getEvents(
    options?:
      | string
      | {
          category?: string;
          cursor?: string;
          dateFrom?: string;
          language?: string;
          limit?: number;
          locale?: string;
          location?: string;
          q?: string;
        },
  ): Promise<EventListResponse> {
    const params =
      typeof options === 'string'
        ? { locale: options }
        : {
            category: options?.category,
            cursor: options?.cursor,
            dateFrom: options?.dateFrom,
            language: options?.language,
            limit: options?.limit,
            locale: options?.locale,
            location: options?.location,
            q: options?.q?.trim(),
          };

    const response = await this.request<ApiV1Response<EventSummary[]>>(
      `/v1/events${buildQuery(params)}`,
    );
    const normalized = (response.data ?? []).map(normalizeEventSummary);

    return {
      data: normalized,
      events: normalized,
      locale: params.locale ?? 'en',
      meta: response.meta,
      page: response.page,
      viewer: null,
    };
  }

  async searchEvents(query: string, locale?: string): Promise<SearchResponse> {
    const params = {
      limit: 12,
      locale,
      q: query.trim(),
    };

    const response = await this.request<ApiV1Response<EventSummary[]>>(
      `/v1/events${buildQuery(params)}`,
    );
    const normalized = (response.data ?? []).map(normalizeEventSummary);

    return {
      data: normalized,
      events: normalized,
      items: normalized,
      meta: response.meta,
      page: 1,
      pageSize: 12,
      total: normalized.length,
      viewer: null,
    };
  }

  async getEvent(
    eventId: string,
    locale?: string,
  ): Promise<{ data: EventSummary; event: EventSummary; meta: ApiV1Meta }> {
    const response = await this.request<{ data: EventSummary; meta: ApiV1Meta }>(
      `/v1/events/${encodeURIComponent(eventId)}${buildQuery({ locale })}`,
    );
    const normalized = normalizeEventSummary(response.data);

    return {
      data: normalized,
      event: normalized,
      meta: response.meta,
    };
  }

  async rsvpToEvent(
    eventId: string,
    state: RsvpState = 'going',
  ): Promise<RsvpResponse> {
    const response = await this.request<{
      data: { event: EventSummary; state: RsvpState };
      meta: ApiV1Meta;
    }>(`/v1/events/${encodeURIComponent(eventId)}/rsvp`, {
      body: JSON.stringify({ state }),
      method: 'POST',
    });

    const event = normalizeEventSummary({
      ...response.data.event,
      viewerRsvpState: response.data.state,
    });

    return {
      data: response.data,
      event,
      meta: response.meta,
    };
  }

  async getGroups(
    options?:
      | string
      | {
          category?: string;
          cursor?: string;
          limit?: number;
          locale?: string;
          q?: string;
        },
  ): Promise<GroupListResponse> {
    const params =
      typeof options === 'string'
        ? { locale: options }
        : {
            category: options?.category,
            cursor: options?.cursor,
            limit: options?.limit,
            locale: options?.locale,
            q: options?.q?.trim(),
          };

    const response = await this.request<ApiV1Response<GroupSummary[]>>(
      `/v1/groups${buildQuery(params)}`,
    );

    return {
      data: response.data ?? [],
      groups: response.data ?? [],
      locale: params.locale ?? 'en',
      meta: response.meta,
      page: response.page,
      viewer: null,
    };
  }

  async getGroup(
    groupId: string,
    locale?: string,
  ): Promise<{ data: GroupSummary; group: GroupSummary; meta: ApiV1Meta }> {
    const response = await this.request<{ data: GroupSummary; meta: ApiV1Meta }>(
      `/v1/groups/${encodeURIComponent(groupId)}${buildQuery({ locale })}`,
    );

    return {
      data: response.data,
      group: response.data,
      meta: response.meta,
    };
  }

  async getDiscussions(
    groupId: string,
    locale?: string,
  ): Promise<DiscussionListResponse> {
    const response = await this.request<ApiV1Response<DiscussionPost[]>>(
      `/v1/groups/${encodeURIComponent(groupId)}/discussions${buildQuery({ locale })}`,
    );

    return {
      data: response.data ?? [],
      discussions: response.data ?? [],
      meta: response.meta,
    };
  }

  async createDiscussion(groupId: string, body: string, pinned = false) {
    return this.request<{
      post: DiscussionPost;
    }>(`/groups/${encodeURIComponent(groupId)}/discussions`, {
      body: JSON.stringify({ body, pinned }),
      method: 'POST',
    });
  }

  async registerDevice(payload: {
    appVersion?: string;
    deviceId: string;
    locale?: string;
    platform: 'ios' | 'android';
    pushToken?: string | null;
  }) {
    return this.request<{
      data: { deviceId: string; registered: boolean };
      meta: ApiV1Meta;
    }>('/v1/devices/register', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
  }

  async unregisterDevice(deviceId: string) {
    return this.request<{
      data: { deviceId: string; unregistered: boolean };
      meta: ApiV1Meta;
    }>(`/v1/devices/register${buildQuery({ deviceId })}`, {
      method: 'DELETE',
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
