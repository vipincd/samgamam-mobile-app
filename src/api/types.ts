export type UserRole = 'member' | 'organizer' | 'moderator' | 'admin';
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
  coordinates: {
    latitude: number;
    longitude: number;
  };
  startsAt: string;
  capacity: number;
  attendeeCount: number;
  ticketPriceCents: number;
  currency: string;
  isPaid: boolean;
  createdAt: string;
  locale: string;
  goingCount: number;
  waitlistCount: number;
  remainingCapacity: number;
  viewerRsvpState: RsvpState | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  category: string;
  languages: string[];
  requiresApproval: boolean;
  discussionCount: number;
  memberCount: number;
  viewerMembershipStatus: string | null;
  viewerMembershipRole: string | null;
}

export interface DiscussionPost {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  pinned: boolean;
  createdAt: string;
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

export interface EventListResponse {
  locale: string;
  viewer: Viewer | null;
  events: EventSummary[];
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  items: EventSummary[];
  viewer: Viewer | null;
}

export interface GroupListResponse {
  locale: string;
  viewer: Viewer | null;
  groups: GroupSummary[];
}

export interface DiscussionListResponse {
  discussions: DiscussionPost[];
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

export interface RecommendationsResponse {
  recommendedForYou: RecommendationItem[];
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
  event: EventSummary;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}
