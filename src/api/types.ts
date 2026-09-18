export type UserRole = 'member' | 'organizer' | 'moderator' | 'admin' | 'user';
export type RsvpState = 'going' | 'waitlist' | 'cancelled';
export type CopilotAction = 'suggest_title' | 'suggest_description';

export interface Viewer {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  roles: UserRole[];
}

export interface EventSummary {
  id: string;
  groupId: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  languages: string[];
  location: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  startsAt: string;
  endsAt?: string | null;
  timeZone?: string;
  capacityMode?: 'limited' | 'unlimited';
  capacity?: number | null;
  remainingCapacity?: number | null;
  availability?: 'available' | 'waitlist' | 'full';
  status?: string;
  ticketPriceCents: number;
  currency: string;
  isPaid: boolean;
  canonicalUrl?: string;
  createdAt?: string;
  locale?: string;
  attendeeCount?: number;
  goingCount?: number;
  waitlistCount?: number;
  viewerRsvpState?: RsvpState | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  category: string;
  city?: string | null;
  languages: string[];
  requiresApproval: boolean;
  discussionCount: number;
  memberCount: number;
  viewerMembershipStatus: string | null;
  viewerMembershipRole: string | null;
}

export interface DiscussionPost {
  id: string;
  authorId?: string;
  authorName: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  locale?: string;
  reactions?: { type: string; count: number }[];
}

export interface NotificationItem {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  targetUrl: string;
  createdAt: string;
  readAt?: string;
}

export interface RecommendationItem {
  score: number;
  reasons: string[];
  event: EventSummary;
}

export interface GroupRecommendationItem {
  score: number;
  reasons: string[];
  group: GroupSummary;
}

export interface AnalyticsEventStat {
  eventId: string;
  views: number;
  clicks: number;
  rsvps: number;
  conversionRate: number;
  event: EventSummary;
}

export interface AnalyticsOverview {
  eventsPublished: number;
  totalViews: number;
  totalRsvps: number;
  averageConversionRate: number;
  eventStats: AnalyticsEventStat[];
}

export interface KnowledgeChunk {
  documentId: string;
  title: string;
  sourceType: 'faq' | 'guide' | 'policy';
  content: string;
}

export interface AuthSessionResponse {
  viewer: Viewer | null;
  locale: string | null;
  authenticated: boolean;
}

export interface LoginResponse {
  viewer: Viewer;
  locale: string;
  accessToken: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface ApiV1Meta {
  requestId: string;
}

export interface ApiV1Response<T> {
  data: T;
  page?: PageInfo;
  meta: ApiV1Meta;
}

export interface MeResponse {
  data: {
    viewer?: Viewer;
    user?: Viewer;
    locale: string;
  };
  meta: ApiV1Meta;
}

export interface EventListResponse {
  data?: EventSummary[];
  events: EventSummary[];
  locale?: string;
  viewer?: Viewer | null;
  page?: PageInfo;
  meta?: ApiV1Meta;
}

export interface SearchResponse {
  data?: EventSummary[];
  items: EventSummary[];
  events?: EventSummary[];
  total: number;
  page: number;
  pageSize: number;
  viewer?: Viewer | null;
  meta?: ApiV1Meta;
}

export interface GroupListResponse {
  data?: GroupSummary[];
  groups: GroupSummary[];
  locale?: string;
  viewer?: Viewer | null;
  page?: PageInfo;
  meta?: ApiV1Meta;
}

export interface DiscussionListResponse {
  data?: DiscussionPost[];
  discussions: DiscussionPost[];
  meta?: ApiV1Meta;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

export interface RecommendationsResponse {
  recommendedForYou: RecommendationItem[];
  communitiesYouMayFeelAtHomeIn: GroupRecommendationItem[];
  peopleLikeYouAreJoining: RecommendationItem[];
  gatheringsNearYou: RecommendationItem[];
  becauseYouJoined: RecommendationItem[];
  inYourLanguage: RecommendationItem[];
  peopleLikeYouAttended: RecommendationItem[];
  trendingNearYou: RecommendationItem[];
}

export interface HelpResponse {
  chunks: KnowledgeChunk[];
}

export interface CopilotResponse {
  content: string;
  logId: string;
  requiresHumanReview: boolean;
}

export interface RsvpResponse {
  data?: {
    event: EventSummary;
    state: RsvpState;
  };
  event: EventSummary;
  meta?: ApiV1Meta;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface DeviceRegistrationPayload {
  deviceId: string;
  platform: "ios" | "android";
  pushToken: string;
  appVersion?: string;
  locale?: string;
}

export type ApiErrorCategory =
  | "network"
  | "timeout"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "validation"
  | "server"
  | "unknown";

export interface ApiV1ErrorDetail {
  field: string;
  code: string;
}

export interface ApiV1ErrorPayload {
  error: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: ApiV1ErrorDetail[];
  };
}
