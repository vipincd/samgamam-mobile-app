export type UserRole = 'member' | 'organizer' | 'moderator' | 'admin';
export type RsvpState = 'going' | 'waitlist' | 'cancelled';
export type EventConversationStatus = 'open' | 'muted' | 'reported' | 'closed' | 'archived';
export type EventMessageSenderRole = 'admin' | 'co_host' | 'organizer' | 'participant';
export type PaymentProvider = 'manual' | 'paddle' | 'stripe';
export type PaymentStatus =
  | 'canceled'
  | 'disputed'
  | 'failed'
  | 'initiated'
  | 'pending'
  | 'processing'
  | 'refunded'
  | 'succeeded';
export type CopilotAction =
  | 'suggest_title'
  | 'suggest_description'
  | 'suggest_reminder'
  | 'suggest_invitation'
  | 'suggest_faq'
  | 'suggest_follow_up'
  | 'suggest_share_text';

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
  organizationId?: string | null;
  seriesId?: string | null;
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
  paymentProvider: string;
  paymentSetupStatus: 'not_configured' | 'ready';
  promotionStatus: 'none' | 'featured' | 'boosted';
  featuredWeight: number;
  inviteCount: number;
  shareCount: number;
  createdAt: string;
  attendeeVisibility?: 'members' | 'private' | 'public';
  discussionCount?: number;
  locale: string;
  goingCount: number;
  waitlistCount: number;
  remainingCapacity: number;
  viewerRsvpState: RsvpState | null;
}

export interface GroupSummary {
  id: string;
  organizationId?: string | null;
  parentGroupId?: string | null;
  name: string;
  description: string;
  tags: string[];
  category: string;
  languages: string[];
  requiresApproval: boolean;
  inviteCount: number;
  shareCount: number;
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
  kind: 'announcement' | 'discussion' | 'reflection';
  replyToId: string | null;
  replyPreview: string | null;
  reactionSummary: Array<{
    count: number;
    type: 'acknowledge' | 'celebrate' | 'like';
  }>;
  viewerReaction: 'acknowledge' | 'celebrate' | 'like' | null;
  createdAt: string;
}

export interface EventAttendeePreview {
  city: string;
  fullName: string;
  id: string;
}

export interface EventPhotoPermissions {
  canModerate: boolean;
  canReport: boolean;
  canSeeModeration: boolean;
  canUpload: boolean;
  uploadRole: string | null;
}

export interface EventPhotoItem {
  caption?: string;
  createdAt: string;
  eventId: string;
  featured: boolean;
  id: string;
  imageUrl: string;
  moderationReason?: string;
  openReportCount: number;
  status: 'pending' | 'active' | 'flagged' | 'hidden' | 'removed';
  thumbnailUrl?: string;
  updatedAt: string;
  uploaderId: string;
  uploaderLabel: string;
  uploaderName: string;
  uploaderRole: string;
  viewerCanDelete: boolean;
  viewerCanModerate: boolean;
  viewerCanReport: boolean;
}

export interface EventPhotoReportItem {
  createdAt: string;
  eventId: string;
  id: string;
  photoId: string;
  photoImageUrl: string;
  photoStatus: 'pending' | 'active' | 'flagged' | 'hidden' | 'removed';
  photoUploaderName: string;
  reason: string;
  reporterId: string;
  reporterName: string;
  resolvedAt?: string;
  status: 'open' | 'resolved';
  viewerCanResolve: boolean;
}

export interface EventPhotoListResponse {
  page: number;
  pageSize: number;
  permissions: EventPhotoPermissions;
  photos: EventPhotoItem[];
  total: number;
}

export interface EventConversationSummary {
  createdAt: string;
  eventId: string;
  eventTitle: string;
  id: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastSenderName?: string;
  messageCount: number;
  mutedByParticipant: boolean;
  organizerId: string;
  organizerName: string;
  participantId: string;
  participantName: string;
  reportedAt?: string;
  status: EventConversationStatus;
  unreadCount: number;
  updatedAt: string;
}

export interface EventConversationMessage {
  body: string;
  createdAt: string;
  id: string;
  readAt?: string;
  senderId: string;
  senderName: string;
  senderRole: EventMessageSenderRole;
}

export interface EventConversationDetail extends EventConversationSummary {
  messagePage: number;
  messagePageSize: number;
  messageTotal: number;
  messages: EventConversationMessage[];
}

export interface EventConversationListResponse {
  conversations: EventConversationSummary[];
  eventId: string;
  page: number;
  pageSize: number;
  total: number;
}

export interface EventConversationReport {
  conversationId: string;
  createdAt: string;
  id: string;
  messageId?: string;
  reason: string;
  reporterId: string;
  resolvedAt?: string;
  status: 'open' | 'resolved';
}

export interface NotificationItem {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  targetUrl?: string;
  createdAt: string;
  readAt?: string;
}

export interface PaymentRecord {
  amountCents: number;
  canceledAt?: string;
  checkoutSessionId: string;
  checkoutUrl?: string;
  completedAt?: string;
  createdAt: string;
  currency: 'EUR' | 'INR' | 'USD';
  customerEmail?: string;
  disputedAmountCents?: number;
  disputedAt?: string;
  disputeStatus?: 'lost' | 'none' | 'open' | 'won';
  eventId?: string;
  id: string;
  organizerId: string;
  provider: PaymentProvider;
  providerPaymentId?: string;
  receiptUrl?: string;
  refundedAmountCents?: number;
  refundedAt?: string;
  refundStatus?: 'full' | 'none' | 'partial';
  status: PaymentStatus;
  statusReason?: string;
  subscriptionId?: string;
  updatedAt?: string;
}

export interface SubscriptionRecord {
  amountCents: number;
  canceledAt?: string;
  checkoutSessionId?: string;
  createdAt: string;
  currency: 'EUR' | 'INR' | 'USD';
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  id: string;
  interval: 'annual' | 'monthly';
  nextBillingAt?: string;
  organizerId: string;
  planId: 'free' | 'premium';
  provider: PaymentProvider;
  providerSubscriptionId?: string;
  startedAt: string;
  status: 'active' | 'canceled' | 'expired' | 'past_due' | 'trialing';
  updatedAt?: string;
}

export interface RevenueOverview {
  currency: 'EUR' | 'INR' | 'USD';
  grossRevenueCents: number;
  netRevenueCents: number;
  paidEventCount: number;
  platformFeeCents: number;
  refundedCents: number;
  subscriptionRevenueCents: number;
}

export interface CheckoutSessionRecord {
  amountCents: number;
  cancelUrl: string;
  checkoutSessionId?: string;
  createdAt: string;
  currency: 'EUR' | 'INR' | 'USD';
  customerEmail?: string;
  expiresAt?: string;
  id: string;
  mode: 'payment' | 'subscription';
  paymentId: string;
  provider: PaymentProvider;
  providerReference?: string;
  status: 'canceled' | 'completed' | 'expired' | 'initiated' | 'open';
  successUrl: string;
  updatedAt: string;
  url?: string;
}

export interface PaymentAttemptRecord {
  amountCents: number;
  checkoutSessionId: string;
  createdAt: string;
  currency: 'EUR' | 'INR' | 'USD';
  errorCode?: string;
  errorMessage?: string;
  id: string;
  paymentId: string;
  provider: PaymentProvider;
  providerReference?: string;
  requestId?: string;
  status: PaymentStatus;
  updatedAt: string;
}

export interface PaymentInspection {
  attempts: PaymentAttemptRecord[];
  checkoutSession: CheckoutSessionRecord | null;
  payment: PaymentRecord | null;
  subscription?: SubscriptionRecord | null;
  webhookEvents: Array<{
    eventType: string;
    id: string;
    processingStatus: string;
    receivedAt: string;
  }>;
}

export interface PaymentCheckoutResponse {
  checkoutSession: CheckoutSessionRecord;
  payment: PaymentRecord;
  revenue?: RevenueOverview;
  subscription?: SubscriptionRecord;
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
  shares: number;
  invitesSent: number;
  inviteAccepts: number;
  conversionRate: number;
  inviteConversionRate: number;
  promotionLift: number;
  estimatedRevenueCents: number;
  event: EventSummary;
}

export interface AnalyticsOverview {
  eventsPublished: number;
  totalViews: number;
  totalRsvps: number;
  totalShares: number;
  totalInvites: number;
  totalInviteAccepts: number;
  paidEvents: number;
  promotedEvents: number;
  revenueReadyEvents: number;
  repeatGuestCount: number;
  averageConversionRate: number;
  funnel: {
    discoveryViews: number;
    eventClicks: number;
    rsvps: number;
    communityJoins: number;
    returnVisitors: number;
  };
  communityStats: Array<{
    groupId: string;
    name: string;
    memberCount: number;
    discussionActivity: number;
    engagement: number;
    retentionScore: number;
    inviteCount: number;
    shareCount: number;
  }>;
  feedbackSummary: {
    count: number;
    averageRating: number;
    recent: Array<{
      id: string;
      rating: number;
      message: string;
      createdAt: string;
    }>;
  };
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
  groups: GroupSummary[];
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
  communitiesYouMayFeelAtHomeIn: GroupRecommendationItem[];
  peopleLikeYouAreJoining: RecommendationItem[];
  gatheringsNearYou: RecommendationItem[];
  becauseYouJoined: RecommendationItem[];
  inYourLanguage: RecommendationItem[];
  peopleLikeYouAttended: RecommendationItem[];
  trendingNearYou: RecommendationItem[];
  peopleWhoAttendedAlsoJoined: GroupRecommendationItem[];
  communitiesGrowingLikeYours: GroupRecommendationItem[];
  eventsYouWillLikelyAttend: RecommendationItem[];
  communitiesYouMayJoinNext: GroupRecommendationItem[];
  modelSummary: {
    ctrWeight: number;
    rsvpWeight: number;
    repeatWeight: number;
    communityWeight: number;
    networkWeight: number;
    behaviorWeight: number;
    regionalWeight: number;
    timeWeight: number;
    explainabilityNotes: string[];
    fallbackActive: boolean;
  };
}

export interface HelpResponse {
  chunks: KnowledgeChunk[];
}

export interface ContinuityItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  groupId?: string;
  groupName?: string;
  eventId?: string;
  eventTitle?: string;
  kind: 'announcement' | 'discussion' | 'event' | 'reflection';
  reasons: string[];
  targetUrl: string;
}

export interface OrganizerContinuityNudge {
  id: string;
  title: string;
  body: string;
  priority: 'gentle' | 'high' | 'medium';
  targetUrl: string;
}

export interface ContinuityResponse {
  continueConversation: ContinuityItem[];
  newInYourCommunities: ContinuityItem[];
  organizerNudges: OrganizerContinuityNudge[];
  recentActivity: ContinuityItem[];
}

export interface CopilotResponse {
  content: string;
  logId: string;
  requiresHumanReview: boolean;
}

export interface AIGrowthSuggestion {
  id: string;
  type: 'schedule' | 'audience' | 'promotion' | 'share_text' | 'growth_signal' | 'automation';
  title: string;
  summary: string;
  recommendedAction: string;
  draftText?: string;
  locale: string;
  confidence: number;
  reasons: string[];
  requiresHumanReview: boolean;
  targetType: 'event' | 'group' | 'organizer';
  targetId: string;
}

export interface AIUsageMetricRecord {
  id: string;
  userId: string;
  feature:
    | 'schedule_suggestion'
    | 'audience_suggestion'
    | 'promotion_recommendation'
    | 'share_text'
    | 'growth_insight'
    | 'automation_nudge';
  targetType: 'event' | 'group' | 'organizer';
  targetId: string;
  status: 'suggested' | 'accepted' | 'dismissed';
  estimatedLift: number;
  createdAt: string;
}

export interface RecommendationInteractionRecord {
  id: string;
  userId: string;
  targetType: 'event' | 'group';
  targetId: string;
  section: string;
  type: 'view' | 'click' | 'rsvp' | 'join' | 'dismiss';
  createdAt: string;
}

export interface ExperimentEventRecord {
  id: string;
  experimentKey: string;
  variantKey: string;
  actorId?: string;
  locale: string;
  type: 'exposure' | 'conversion';
  createdAt: string;
}

export interface MarketplaceBidRecord {
  id: string;
  eventId: string;
  organizerId: string;
  bidCents: number;
  createdAt: string;
}

export interface OrganizerAutomationSuggestion {
  id: string;
  type: 'send_reminder' | 'post_follow_up' | 'reengage_members' | 'improve_targeting';
  title: string;
  body: string;
  oneClickLabel: string;
  requiresHumanReview: boolean;
}

export interface EventPerformanceInsight {
  eventId: string;
  title: string;
  attendancePrediction: number;
  dropOffRisk: 'low' | 'medium' | 'high';
  status: 'strong' | 'watch' | 'underperforming';
  reasons: string[];
  recommendedActions: OrganizerAutomationSuggestion[];
}

export interface CommunityHealthSignal {
  groupId: string;
  name: string;
  status: 'growing' | 'steady' | 'needs_attention';
  engagementScore: number;
  reasons: string[];
}

export interface OrganizerInsightsResponse {
  eventInsights: EventPerformanceInsight[];
  communityHealth: CommunityHealthSignal[];
  growthSuggestions: AIGrowthSuggestion[];
  organizerSuggestions: AIGrowthSuggestion[];
  aiUsageSummary: {
    total: number;
    accepted: number;
    averageEstimatedLift: number;
  };
  feedbackSignals: Array<{
    id: string;
    rating: number;
    message: string;
  }>;
  funnel: AnalyticsOverview['funnel'];
}

export interface AIGrowthInsightsResponse {
  suggestions: AIGrowthSuggestion[];
}

export interface MarketplaceOverviewResponse {
  featuredListings: Array<{
    eventId: string;
    title: string;
    tier: 'standard' | 'featured' | 'priority';
    rank: number;
    bidCents: number;
    qualityScore: number;
    rankingReasons: string[];
    trust: {
      organizerId: string;
      organizerName: string;
      rating: number;
      reviewCount: number;
      qualityScore: number;
      reasons: string[];
    };
  }>;
  topOrganizers: Array<{
    organizerId: string;
    organizerName: string;
    rating: number;
    reviewCount: number;
    qualityScore: number;
    reasons: string[];
  }>;
  transparencyNotes: string[];
}

export interface ExperimentOverviewResponse {
  featureFlags: Array<{
    key: string;
    enabled: boolean;
    description: string;
    audience: string;
  }>;
  assignments: Array<{
    experiment: {
      key: string;
      name: string;
      description: string;
      status: string;
      defaultVariant: string;
      variants: Array<{
        key: string;
        label: string;
        headline?: string;
        subtext?: string;
        primaryCta?: string;
      }>;
    };
    assignment: {
      id: string;
      experimentKey: string;
      variantKey: string;
      actorId?: string;
      locale: string;
      assignedAt: string;
    } | null;
  }>;
  metrics: Array<{
    experimentKey: string;
    variantKey: string;
    exposures: number;
    conversions: number;
    conversionRate: number;
  }>;
}

export interface RecommendationLearningResponse {
  model: {
    ctrWeight: number;
    rsvpWeight: number;
    repeatWeight: number;
    communityWeight: number;
    networkWeight: number;
    behaviorWeight: number;
    regionalWeight: number;
    timeWeight: number;
    sampleSize: number;
    fallbackActive: boolean;
    lastUpdated: string;
    explainabilityNotes: string[];
  };
  sections: {
    recommendedForYou: {
      clicks: number;
      rsvps: number;
    };
    communitiesGrowingLikeYours: {
      joins: number;
    };
  };
  topEvents: Array<{
    eventId: string;
    title: string;
    clickThroughRate: number;
    repeatAttendance: number;
    tunedScore: number;
    reasons: string[];
  }>;
  topGroups: Array<{
    groupId: string;
    name: string;
    signal: {
      communityJoinRate: number;
      tunedScore: number;
      reasons: string[];
    } | null;
  }>;
}

export interface RsvpResponse {
  event: EventSummary;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export type IntegrationProvider =
  | 'google_calendar'
  | 'apple_calendar'
  | 'whatsapp_share'
  | 'ics_feed'
  | 'webhook';

export type IntegrationStatus = 'available' | 'connected' | 'paused';
export type IntegrationScope = 'event' | 'community' | 'platform';
export type SyncTargetType = 'event' | 'group' | 'platform';
export type SyncStatus = 'queued' | 'synced' | 'failed';
export type PlatformApiAccess = 'public' | 'authenticated' | 'organizer' | 'moderator' | 'admin';

export interface NetworkConnectionRecord {
  id: string;
  sourceUserId: string;
  targetUserId: string;
  type: 'community' | 'event' | 'introduced';
  sharedGroupIds: string[];
  sharedEventIds: string[];
  createdAt: string;
}

export interface NetworkSuggestion {
  userId: string;
  fullName: string;
  city: string;
  sharedGroupIds: string[];
  sharedEventIds: string[];
  score: number;
  reasons: string[];
}

export interface CommunityOverlapSignal {
  groupId: string;
  name: string;
  score: number;
  sharedMemberIds: string[];
  sharedGroupIds: string[];
  reasons: string[];
}

export interface EventNetworkSignal {
  eventId: string;
  score: number;
  connectedAttendees: Array<{
    userId: string;
    fullName: string;
    city: string;
  }>;
  sharedGroupIds: string[];
  reasons: string[];
}

export interface GroupNetworkSignal {
  groupId: string;
  score: number;
  connectedMembers: Array<{
    userId: string;
    fullName: string;
    role: string;
  }>;
  overlapGroupIds: string[];
  reasons: string[];
}

export interface SocialGraphOverviewResponse {
  userId: string;
  connections: NetworkConnectionRecord[];
  peopleYouMayKnow: NetworkSuggestion[];
  overlappingCommunities: CommunityOverlapSignal[];
  eventSignals: EventNetworkSignal[];
  groupSignals: GroupNetworkSignal[];
  privacyNotes: string[];
}

export interface ReputationIndicator {
  id: string;
  label: string;
  score: number;
  status: 'strong' | 'steady' | 'watch';
  reasons: string[];
}

export interface OrganizerProfileRecord {
  organizerId: string;
  organizerName: string;
  publicIdentity: string;
  hostedEventIds: string[];
  hostedGroupIds: string[];
  trustScore: number;
  reliabilityScore: number;
  badge: string;
  recentHighlights: string[];
}

export interface ReputationOverviewResponse {
  userId: string;
  displayName: string;
  identityStatus: 'verified' | 'lightweight_verified' | 'unverified';
  trustScore: number;
  repeatAttendance: number;
  organizerReliability: number;
  participationScore: number;
  indicators: ReputationIndicator[];
  organizerProfiles: OrganizerProfileRecord[];
  trustNotes: string[];
}

export interface IntegrationRecord {
  id: string;
  userId: string;
  provider: IntegrationProvider;
  scope: IntegrationScope;
  status: IntegrationStatus;
  label: string;
  lastSyncedAt?: string;
  syncCount: number;
  metadata: {
    externalAccountId?: string;
    syncCursor?: string;
    webhookUrl?: string;
  };
}

export interface ExternalSyncRecord {
  id: string;
  userId: string;
  provider: IntegrationProvider;
  targetType: SyncTargetType;
  targetId: string;
  status: SyncStatus;
  note: string;
  createdAt: string;
  completedAt?: string;
}

export interface IntegrationOverviewResponse {
  userId: string;
  connectedIntegrations: IntegrationRecord[];
  availableIntegrations: IntegrationRecord[];
  recentSyncs: ExternalSyncRecord[];
  transparencyNotes: string[];
}

export interface PlatformApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  access: PlatformApiAccess;
  auditLogged: boolean;
}

export interface PlatformOverviewResponse {
  network: SocialGraphOverviewResponse;
  reputation: ReputationOverviewResponse;
  integrations: IntegrationOverviewResponse;
  organizerProfiles: OrganizerProfileRecord[];
  apiDirectory: PlatformApiEndpoint[];
  mcpTools: Array<{
    name: string;
    description: string;
    capability: 'read_only' | 'approval_required';
    parameters: Record<string, unknown>;
  }>;
  scale?: PlatformScaleSnapshot;
  organizations?: OrganizationOverviewResponse;
  regional?: RegionalIntelligenceOverviewResponse;
  dataPlatform?: DataPlatformOverviewResponse;
  developer?: DeveloperOverviewResponse;
  safety?: SafetyOverviewResponse;
  notes: string[];
}

export interface PlatformScaleSnapshot {
  cacheHitRate: number;
  cacheEntries: number;
  queuedJobs: number;
  activeTraces: number;
  averageResponseMs: number;
  notes: string[];
}

export interface OrganizationRecurringSeries {
  id: string;
  label: string;
  cadence: 'weekly' | 'monthly' | 'quarterly';
  nextRunAt: string;
  eventIds: string[];
  groupIds: string[];
}

export interface OrganizationRecord {
  id: string;
  name: string;
  description: string;
  region: string;
  memberCount: number;
  organizerCount: number;
  communityCount: number;
  seriesCount: number;
  leadOrganizers: string[];
  groupIds: string[];
  recurringSeries: OrganizationRecurringSeries[];
  notes: string[];
}

export interface OrganizationOverviewResponse {
  organizationCount: number;
  organizations: OrganizationRecord[];
  summary: string[];
}

export interface RegionalIntelligenceItem {
  id: string;
  title: string;
  score: number;
  reasons: string[];
  localeMatch: boolean;
  languageMatch: boolean;
}

export interface RegionalIntelligenceOverviewResponse {
  userId: string;
  locale: string;
  regionLabel: string;
  city: string;
  localEvents: RegionalIntelligenceItem[];
  localCommunities: RegionalIntelligenceItem[];
  hybridRecommendations: RegionalIntelligenceItem[];
  culturalSignals: string[];
  notes: string[];
}

export interface DataPlatformCohort {
  id: string;
  label: string;
  size: number;
  retentionRate: number;
  trend: 'up' | 'flat' | 'down';
  notes: string[];
}

export interface DataPlatformMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  explanation: string;
}

export interface DataPlatformOverviewResponse {
  eventTaxonomy: Array<{
    label: string;
    count: number;
  }>;
  cohorts: DataPlatformCohort[];
  metrics: DataPlatformMetric[];
  growthInsights: string[];
  pipelineNotes: string[];
  lastUpdated: string;
}

export interface SafetyRiskSignal {
  id: string;
  targetType: 'event' | 'group' | 'user' | 'discussion_post';
  targetId: string;
  score: number;
  status: 'watch' | 'needs_review' | 'high';
  reasons: string[];
  humanActions: string[];
}

export interface SafetyOverviewResponse {
  riskLevel: 'low' | 'medium' | 'elevated';
  openReports: number;
  flaggedReports: number;
  riskSignals: SafetyRiskSignal[];
  aiAssistedNotes: string[];
  dashboardNotes: string[];
}

export interface DeveloperApiKeyRecord {
  id: string;
  label: string;
  prefix: string;
  ownerId?: string;
  scopes: string[];
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
  rateLimitPerMinute: number;
}

export interface DeveloperApplicationRecord {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  ownerId: string;
  createdAt: string;
  approvedApis: string[];
  keyCount: number;
}

export interface DeveloperOverviewResponse {
  applications: DeveloperApplicationRecord[];
  apiKeys: DeveloperApiKeyRecord[];
  auditLogs: Array<{
    id: string;
    action: string;
    targetId: string;
    createdAt: string;
    actorId?: string;
  }>;
  publicApis: PlatformApiEndpoint[];
  rateLimitPolicy: string[];
  notes: string[];
}
