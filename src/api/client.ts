import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type {
  AIGrowthInsightsResponse,
  AIUsageMetricRecord,
  AnalyticsOverview,
  AuthSessionResponse,
  CopilotAction,
  CopilotResponse,
  ContinuityResponse,
  DiscussionListResponse,
  EventListResponse,
  EventAttendeePreview,
  EventConversationDetail,
  EventConversationListResponse,
  EventConversationReport,
  EventPhotoListResponse,
  EventPhotoReportItem,
  EventPhotoItem,
  ExperimentEventRecord,
  ExperimentOverviewResponse,
  DataPlatformOverviewResponse,
  DeveloperOverviewResponse,
  DeveloperApiKeyRecord,
  IntegrationOverviewResponse,
  GroupListResponse,
  HealthResponse,
  HelpResponse,
  LoginResponse,
  MarketplaceBidRecord,
  MarketplaceOverviewResponse,
  OrganizationOverviewResponse,
  NotificationListResponse,
  OrganizerInsightsResponse,
  PaymentCheckoutResponse,
  PaymentInspection,
  PlatformOverviewResponse,
  RecommendationsResponse,
  RecommendationInteractionRecord,
  RecommendationLearningResponse,
  ReputationOverviewResponse,
  SafetyOverviewResponse,
  SocialGraphOverviewResponse,
  RsvpResponse,
  RsvpState,
  SearchResponse,
} from './types';

const ACCESS_TOKEN_KEY = 'samgamam.access_token';
const API_BASE_URL_KEY = 'samgamam.api_base_url';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

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

  if (parsed.protocol !== 'https:' && !localHosts.has(parsed.hostname)) {
    throw new Error('Samgamam requires HTTPS outside local development.');
  }

  return parsed.origin;
}

function resolveBaseUrl(override?: string | null) {
  const fallbackUrl =
    Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
  const isDevelopmentBuild = typeof __DEV__ === 'boolean' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const configuredUrl =
    override ??
    process.env.EXPO_PUBLIC_API_URL ??
    (isDevelopmentBuild ? fallbackUrl : 'https://samgamam.app');
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

function isFormDataBody(value: unknown) {
  return typeof FormData !== 'undefined' && value instanceof FormData;
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

    if (options.body && !headers.has('Content-Type') && !isFormDataBody(options.body)) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    let response: Response;

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort();
    }, DEFAULT_REQUEST_TIMEOUT_MS);

    try {
      response = await fetch(`${this.getApiUrl()}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal ?? timeoutController.signal,
      });
    } catch (error) {
      const isAbort =
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

      throw new ApiError(
        isAbort
          ? `Samgamam did not respond within ${Math.round(DEFAULT_REQUEST_TIMEOUT_MS / 1000)} seconds. Check your network and try again.`
          : `Unable to reach Samgamam at ${this.getBaseUrl()}. Check the backend URL and try again.`,
        {
          code: isAbort ? 'request_timeout' : 'network_error',
          details: error,
          status: 0,
        },
      );
    } finally {
      clearTimeout(timeout);
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

  async createDiscussionWithKind(
    groupId: string,
    body: string,
    options?: {
      kind?: 'announcement' | 'discussion' | 'reflection';
      pinned?: boolean;
      replyToId?: string | null;
    },
  ) {
    return this.request<{
      post: DiscussionListResponse['discussions'][number];
    }>(`/groups/${encodeURIComponent(groupId)}/discussions`, {
      body: JSON.stringify({
        body,
        kind: options?.kind,
        pinned: options?.pinned ?? false,
        replyToId: options?.replyToId ?? undefined,
      }),
      method: 'POST',
    });
  }

  async reactToDiscussion(
    postId: string,
    reaction: 'acknowledge' | 'celebrate' | 'like',
  ) {
    return this.request<{
      post: DiscussionListResponse['discussions'][number];
    }>(`/discussions/${encodeURIComponent(postId)}/reactions`, {
      body: JSON.stringify({ reaction }),
      method: 'POST',
    });
  }

  async getEventThreads(eventId: string, locale?: string) {
    return this.request<DiscussionListResponse>(
      `/events/${encodeURIComponent(eventId)}/threads${buildQuery({ locale })}`,
    );
  }

  async getEventConversations(eventId: string, options?: { page?: number; pageSize?: number }) {
    return this.request<EventConversationListResponse>(
      `/events/${encodeURIComponent(eventId)}/conversations${buildQuery({
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 20,
      })}`,
    );
  }

  async startEventConversation(eventId: string, participantId: string) {
    return this.request<{
      conversation: EventConversationDetail;
      created: boolean;
    }>(
      `/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(participantId)}/conversation`,
      {
        method: 'POST',
      },
    );
  }

  async getConversation(conversationId: string, options?: { page?: number; pageSize?: number }) {
    return this.request<{ conversation: EventConversationDetail; eventId: string }>(
      `/conversations/${encodeURIComponent(conversationId)}${buildQuery({
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 25,
      })}`,
    );
  }

  async sendConversationMessage(conversationId: string, body: string) {
    return this.request<{
      conversation: EventConversationDetail;
      message: EventConversationDetail['messages'][number];
    }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
      body: JSON.stringify({ body }),
      method: 'POST',
    });
  }

  async muteConversation(conversationId: string) {
    return this.request<{ conversation: EventConversationDetail }>(
      `/conversations/${encodeURIComponent(conversationId)}/mute`,
      {
        method: 'POST',
      },
    );
  }

  async reportConversation(conversationId: string, reason: string, messageId?: string) {
    return this.request<{ report: EventConversationReport }>(
      `/conversations/${encodeURIComponent(conversationId)}/report`,
      {
        body: JSON.stringify({ messageId, reason }),
        method: 'POST',
      },
    );
  }

  async createEventThreadPost(
    eventId: string,
    body: string,
    options?: {
      kind?: 'announcement' | 'discussion' | 'reflection';
    },
  ) {
    return this.request<{
      post: DiscussionListResponse['discussions'][number];
    }>(`/events/${encodeURIComponent(eventId)}/threads`, {
      body: JSON.stringify({
        body,
        kind: options?.kind ?? 'discussion',
      }),
      method: 'POST',
    });
  }

  async getEventAttendees(eventId: string) {
    return this.request<{ attendees: EventAttendeePreview[] }>(
      `/events/${encodeURIComponent(eventId)}/attendees`,
    );
  }

  async getEventPhotos(eventId: string, options?: { includeModeration?: boolean; page?: number; pageSize?: number }) {
    return this.request<EventPhotoListResponse>(
      `/events/${encodeURIComponent(eventId)}/photos${buildQuery({
        includeModeration: options?.includeModeration ? 'true' : undefined,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 24,
      })}`,
    );
  }

  async uploadEventPhoto(
    eventId: string,
    input: {
      caption?: string;
      fileName: string;
      mimeType: string;
      uri: string;
    },
  ) {
    const formData = new FormData();

    formData.append('file', {
      name: input.fileName,
      type: input.mimeType,
      uri: input.uri,
    } as unknown as Blob);

    if (input.caption?.trim()) {
      formData.append('caption', input.caption.trim());
    }

    return this.request<{ photo: EventPhotoItem }>(
      `/events/${encodeURIComponent(eventId)}/photos`,
      {
        body: formData,
        method: 'POST',
      },
    );
  }

  async updateEventPhoto(
    eventId: string,
    photoId: string,
    input: {
      caption?: string;
      featured?: boolean;
      moderationReason?: string;
      status?: EventPhotoItem['status'];
    },
  ) {
    return this.request<{ photo: EventPhotoItem }>(
      `/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}`,
      {
        body: JSON.stringify(input),
        method: 'PATCH',
      },
    );
  }

  async removeEventPhoto(eventId: string, photoId: string) {
    return this.request<{ photo: EventPhotoItem }>(
      `/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  async rsvpToEvent(eventId: string, state: RsvpState = 'going') {
    return this.request<RsvpResponse>(`/events/${encodeURIComponent(eventId)}/rsvp`, {
      body: JSON.stringify({ state }),
      method: 'POST',
    });
  }

  async reportEventPhoto(eventId: string, photoId: string, reason: string) {
    return this.request<{ report: EventPhotoReportItem }>(
      `/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}/report`,
      {
        body: JSON.stringify({ reason }),
        method: 'POST',
      },
    );
  }

  async getNotifications() {
    return this.request<NotificationListResponse>('/notifications');
  }

  async registerPushToken(token: string, platform: 'android' | 'ios' | 'web') {
    return this.request<{ success: boolean }>('/users/push-tokens', {
      body: JSON.stringify({ platform, token }),
      method: 'POST',
    });
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

  async startEventCheckout(input: {
    eventId: string;
    locale?: string;
    provider?: 'manual' | 'paddle' | 'stripe';
  }) {
    return this.request<PaymentCheckoutResponse>(
      `/payments${buildQuery({ locale: input.locale })}`,
      {
        body: JSON.stringify({
          eventId: input.eventId,
          provider: input.provider,
        }),
        method: 'POST',
      },
    );
  }

  async getPaymentStatus(input: {
    checkoutSessionId?: string;
    locale?: string;
    paymentId?: string;
  }) {
    return this.request<{ inspection: PaymentInspection }>(
      `/payments${buildQuery({
        checkoutSessionId: input.checkoutSessionId,
        locale: input.locale,
        paymentId: input.paymentId,
      })}`,
    );
  }

  async getContinuity(limit = 4, locale?: string) {
    return this.request<ContinuityResponse>(
      `/continuity${buildQuery({ limit, locale })}`,
    );
  }

  async getAnalytics() {
    return this.request<AnalyticsOverview>('/analytics');
  }

  async getOrganizerInsights() {
    return this.request<OrganizerInsightsResponse>('/organizer/insights');
  }

  async getSocialGraph(locale?: string) {
    return this.request<SocialGraphOverviewResponse>(
      `/social-graph${buildQuery({ locale })}`,
    );
  }

  async getReputation(locale?: string) {
    return this.request<ReputationOverviewResponse>(
      `/reputation${buildQuery({ locale })}`,
    );
  }

  async getIntegrations(locale?: string) {
    return this.request<IntegrationOverviewResponse>(
      `/integrations${buildQuery({ locale })}`,
    );
  }

  async getPlatform(locale?: string) {
    return this.request<PlatformOverviewResponse>(
      `/platform${buildQuery({ locale })}`,
    );
  }

  async getOrganizations(locale?: string) {
    return this.request<OrganizationOverviewResponse>(
      `/organizations${buildQuery({ locale })}`,
    );
  }

  async getDataPlatform(locale?: string) {
    return this.request<DataPlatformOverviewResponse>(
      `/data-platform${buildQuery({ locale })}`,
    );
  }

  async getSafety(locale?: string) {
    return this.request<SafetyOverviewResponse>(
      `/safety${buildQuery({ locale })}`,
    );
  }

  async getDeveloper(locale?: string) {
    return this.request<DeveloperOverviewResponse>(
      `/developer${buildQuery({ locale })}`,
    );
  }

  async createDeveloperKey(input: {
    label: string;
    rateLimitPerMinute?: number;
    scopes: string[];
  }) {
    return this.request<{ key: DeveloperApiKeyRecord; secret: string }>('/developer', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async getAiInsights(options?: { eventId?: string; groupId?: string }) {
    return this.request<AIGrowthInsightsResponse>(
      `/ai/insights${buildQuery({
        eventId: options?.eventId,
        groupId: options?.groupId,
      })}`,
    );
  }

  async markAiInsightStatus(input: {
    estimatedLift: number;
    feature: AIUsageMetricRecord['feature'];
    status: 'accepted' | 'dismissed';
    targetId: string;
    targetType: AIUsageMetricRecord['targetType'];
  }) {
    return this.request<{ metric: AIUsageMetricRecord }>('/ai/insights', {
      body: JSON.stringify(input),
      method: 'PATCH',
    });
  }

  async getMarketplace(locale?: string) {
    return this.request<MarketplaceOverviewResponse>(
      `/marketplace${buildQuery({ locale })}`,
    );
  }

  async placeMarketplaceBid(eventId: string, bidCents: number) {
    return this.request<{ bid: MarketplaceBidRecord }>('/marketplace', {
      body: JSON.stringify({ bidCents, eventId }),
      method: 'PATCH',
    });
  }

  async getExperiments() {
    return this.request<ExperimentOverviewResponse>('/experiments');
  }

  async trackExperiment(input: {
    experimentKey: string;
    type: 'exposure' | 'conversion';
    variantKey: string;
  }) {
    return this.request<{ event: ExperimentEventRecord }>('/experiments', {
      body: JSON.stringify(input),
      method: 'POST',
    });
  }

  async getRecommendationTuning(locale?: string) {
    return this.request<RecommendationLearningResponse>(
      `/recommendations/tune${buildQuery({ locale })}`,
    );
  }

  async recordRecommendationInteraction(input: {
    section: string;
    targetId: string;
    targetType: 'event' | 'group';
    type: 'view' | 'click' | 'rsvp' | 'join' | 'dismiss';
  }) {
    return this.request<{ interaction: RecommendationInteractionRecord }>(
      '/recommendations/tune',
      {
        body: JSON.stringify(input),
        method: 'POST',
      },
    );
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
