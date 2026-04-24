import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiClient, getErrorMessage } from '../api/client';
import type {
  AnalyticsOverview,
  AuthSessionResponse,
  ContinuityResponse,
  ExperimentOverviewResponse,
  GroupRecommendationItem,
  MarketplaceOverviewResponse,
  NotificationItem,
  OrganizerInsightsResponse,
  RecommendationItem,
  RecommendationLearningResponse,
  RecommendationsResponse,
} from '../api/types';
import { EventCard } from '../components/EventCard';
import {
  Button,
  EmptyState,
  Field,
  InlineNotice,
  MetricTile,
  Pill,
  ScreenIntro,
  SectionHeader,
  Surface,
} from '../components/ui';
import { theme } from '../theme';
import type { MobileRoute } from '../navigation/deepLinks';
import { notificationRouteLabel, resolveNotificationRoute } from '../notifications/routing';
import {
  capitalizeLabel,
  formatDateTime,
  formatPercent,
  toShortName,
} from '../utils/format';

const demoAccounts = [
  {
    email: 'vipin@example.local',
    label: 'Vipin organizer',
    password: 'Samgamam!Demo2026',
  },
  {
    email: 'arjun@example.local',
    label: 'Arjun organizer',
    password: 'Samgamam!Demo2026',
  },
  {
    email: 'admin@example.local',
    label: 'Admin reviewer',
    password: 'Samgamam!Admin2026',
  },
];

export function ProfileScreen(props: {
  apiBaseUrl: string;
  connectionError: string | null;
  isFocused: boolean;
  locale: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenRoute: (route: string | MobileRoute) => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onRegisterPush: () => Promise<string>;
  onSaveApiBaseUrl: (value: string | null) => Promise<string>;
  session: AuthSessionResponse;
}) {
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(props.apiBaseUrl);
  const [email, setEmail] = useState('vipin@example.local');
  const [password, setPassword] = useState('Samgamam!Demo2026');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recommendations, setRecommendations] =
    useState<RecommendationsResponse | null>(null);
  const [continuity, setContinuity] = useState<ContinuityResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [organizerInsights, setOrganizerInsights] = useState<OrganizerInsightsResponse | null>(null);
  const [experiments, setExperiments] = useState<ExperimentOverviewResponse | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceOverviewResponse | null>(null);
  const [recommendationLearning, setRecommendationLearning] =
    useState<RecommendationLearningResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

  useEffect(() => {
    setDraftApiBaseUrl(props.apiBaseUrl);
  }, [props.apiBaseUrl]);

  async function loadDashboard(isRefresh = false) {
    if (!props.isFocused) {
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    }

    setDashboardError(null);

    try {
      const health = await apiClient.healthCheck();
      setHealthMessage(`Connected to ${health.service} | ${formatDateTime(health.timestamp, props.locale)}`);
    } catch (healthError) {
      setHealthMessage(null);
      setDashboardError(getErrorMessage(healthError));
    }

    if (!props.session.authenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setRecommendations(null);
      setContinuity(null);
      setAnalytics(null);
      setOrganizerInsights(null);
      setExperiments(null);
      setMarketplace(null);
      setRecommendationLearning(null);
      setRefreshing(false);
      return;
    }

    const canLoadOrganizerData =
      props.session.viewer?.roles.includes('organizer') || props.session.viewer?.roles.includes('admin');

    const promises = await Promise.allSettled([
      apiClient.getNotifications(),
      apiClient.getRecommendations(3),
      apiClient.getContinuity(4, props.locale),
      canLoadOrganizerData ? apiClient.getAnalytics() : Promise.resolve(null),
      canLoadOrganizerData ? apiClient.getOrganizerInsights() : Promise.resolve(null),
      canLoadOrganizerData ? apiClient.getExperiments() : Promise.resolve(null),
      canLoadOrganizerData ? apiClient.getMarketplace(props.locale) : Promise.resolve(null),
      canLoadOrganizerData ? apiClient.getRecommendationTuning(props.locale) : Promise.resolve(null),
    ]);

    const [
      notificationsResult,
      recommendationsResult,
      continuityResult,
      analyticsResult,
      organizerInsightsResult,
      experimentsResult,
      marketplaceResult,
      recommendationLearningResult,
    ] = promises;

    if (notificationsResult.status === 'fulfilled') {
      setNotifications(notificationsResult.value.notifications);
      setUnreadCount(notificationsResult.value.unreadCount);
    } else {
      setDashboardError(getErrorMessage(notificationsResult.reason));
    }

    if (recommendationsResult.status === 'fulfilled') {
      setRecommendations(recommendationsResult.value);
    } else {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(recommendationsResult.reason));
    }

    if (continuityResult.status === 'fulfilled') {
      setContinuity(continuityResult.value);
    } else {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(continuityResult.reason));
    }

    if (analyticsResult.status === 'fulfilled' && analyticsResult.value) {
      setAnalytics(analyticsResult.value);
    } else if (analyticsResult.status === 'rejected') {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(analyticsResult.reason));
    } else {
      setAnalytics(null);
    }

    if (organizerInsightsResult.status === 'fulfilled' && organizerInsightsResult.value) {
      setOrganizerInsights(organizerInsightsResult.value);
    } else if (organizerInsightsResult.status === 'rejected') {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(organizerInsightsResult.reason));
    } else {
      setOrganizerInsights(null);
    }

    if (experimentsResult.status === 'fulfilled' && experimentsResult.value) {
      setExperiments(experimentsResult.value);
    } else if (experimentsResult.status === 'rejected') {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(experimentsResult.reason));
    } else {
      setExperiments(null);
    }

    if (marketplaceResult.status === 'fulfilled' && marketplaceResult.value) {
      setMarketplace(marketplaceResult.value);
    } else if (marketplaceResult.status === 'rejected') {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(marketplaceResult.reason));
    } else {
      setMarketplace(null);
    }

    if (recommendationLearningResult.status === 'fulfilled' && recommendationLearningResult.value) {
      setRecommendationLearning(recommendationLearningResult.value);
    } else if (recommendationLearningResult.status === 'rejected') {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(recommendationLearningResult.reason));
    } else {
      setRecommendationLearning(null);
    }

    setRefreshing(false);
  }

  useEffect(() => {
    void loadDashboard();
  }, [props.isFocused, props.locale, props.session.authenticated, props.session.viewer?.id]);

  async function handleLogin() {
    setAuthLoading(true);
    setStatusMessage(null);

    try {
      await props.onLogin(email.trim(), password);
      setStatusMessage('Signed in successfully. Mobile-only tabs are now unlocked.');
      await loadDashboard();
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setAuthLoading(true);
    setStatusMessage(null);

    try {
      await props.onLogout();
      setNotifications([]);
      setUnreadCount(0);
      setRecommendations(null);
      setContinuity(null);
      setAnalytics(null);
      setOrganizerInsights(null);
      setExperiments(null);
      setMarketplace(null);
      setRecommendationLearning(null);
      setStatusMessage('Signed out from this device.');
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSaveBaseUrl() {
    setConfigLoading(true);
    setStatusMessage(null);

    try {
      const savedBaseUrl = await props.onSaveApiBaseUrl(draftApiBaseUrl.trim() || null);
      setDraftApiBaseUrl(savedBaseUrl);
      setStatusMessage(`Backend URL saved: ${savedBaseUrl}`);
      await loadDashboard();
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setConfigLoading(false);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    setMarkingNotificationId(notificationId);

    try {
      const response = await apiClient.markNotificationRead(notificationId);
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) =>
          item.id === notificationId ? response.notification : item,
        ),
      );
      setUnreadCount((currentValue) => Math.max(currentValue - 1, 0));
    } catch (error) {
      setDashboardError(getErrorMessage(error));
    } finally {
      setMarkingNotificationId(null);
    }
  }

  async function handleEnablePush() {
    setPushLoading(true);
    setStatusMessage(null);

    try {
      const message = await props.onRegisterPush();
      setPushEnabled(message.includes('enabled'));
      setStatusMessage(message);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setPushLoading(false);
    }
  }

  function recommendationSections(): Array<{
    items: Array<RecommendationItem | GroupRecommendationItem>;
    key:
      | 'recommendedForYou'
      | 'communitiesYouMayFeelAtHomeIn'
      | 'peopleLikeYouAreJoining'
      | 'gatheringsNearYou'
      | 'becauseYouJoined'
      | 'inYourLanguage'
      | 'peopleWhoAttendedAlsoJoined'
      | 'communitiesGrowingLikeYours'
      | 'eventsYouWillLikelyAttend'
      | 'communitiesYouMayJoinNext';
    title: string;
    kind: 'community' | 'event';
  }> {
    if (!recommendations) {
      return [];
    }

    return [
      {
        items: recommendations.recommendedForYou,
        key: 'recommendedForYou',
        title: 'Recommended for you',
        kind: 'event',
      },
      {
        items: recommendations.eventsYouWillLikelyAttend,
        key: 'eventsYouWillLikelyAttend',
        title: 'Events you will likely attend',
        kind: 'event',
      },
      {
        items: recommendations.communitiesYouMayFeelAtHomeIn,
        key: 'communitiesYouMayFeelAtHomeIn',
        title: 'Communities you may feel at home in',
        kind: 'community',
      },
      {
        items: recommendations.communitiesYouMayJoinNext,
        key: 'communitiesYouMayJoinNext',
        title: 'Communities you may join next',
        kind: 'community',
      },
      {
        items: recommendations.peopleLikeYouAreJoining,
        key: 'peopleLikeYouAreJoining',
        title: 'People like you are joining',
        kind: 'event',
      },
      {
        items: recommendations.gatheringsNearYou,
        key: 'gatheringsNearYou',
        title: 'Gatherings near you',
        kind: 'event',
      },
      {
        items: recommendations.becauseYouJoined,
        key: 'becauseYouJoined',
        title: 'Because you joined',
        kind: 'event',
      },
      {
        items: recommendations.inYourLanguage,
        key: 'inYourLanguage',
        title: 'In your language',
        kind: 'event',
      },
      {
        items: recommendations.peopleWhoAttendedAlsoJoined,
        key: 'peopleWhoAttendedAlsoJoined',
        title: 'People who attended also joined',
        kind: 'community',
      },
      {
        items: recommendations.communitiesGrowingLikeYours,
        key: 'communitiesGrowingLikeYours',
        title: 'Communities growing like yours',
        kind: 'community',
      },
    ];
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void loadDashboard(true);
          }}
          refreshing={refreshing}
          tintColor={theme.colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <ScreenIntro
        eyebrow="Profile"
        subtitle={`This tab now handles session restore, secure token storage, backend URL control, notifications, recommendations, and organizer stats for ${toShortName(props.session.viewer?.fullName)}.`}
        title="Make the app usable on a real device."
      />

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Set this when your phone cannot reach localhost. The saved URL persists through app restarts."
          title="Backend connection"
        />
        <Field
          helperText="Examples: http://10.0.2.2:3000 for Android emulator, http://192.168.x.x:3000 for a device on your LAN, or an HTTPS production URL."
          label="API base URL"
          onChangeText={setDraftApiBaseUrl}
          placeholder="http://localhost:3000"
          value={draftApiBaseUrl}
        />
        {healthMessage ? <InlineNotice message={healthMessage} tone="success" /> : null}
        {props.connectionError ? (
          <InlineNotice message={props.connectionError} tone="warning" title="Connection issue" />
        ) : null}
        <View style={styles.row}>
          <Button
            label={configLoading ? 'Saving...' : 'Save URL'}
            onPress={() => {
              void handleSaveBaseUrl();
            }}
            style={styles.flexButton}
          />
          <Button
            label="Retry backend"
            onPress={() => {
              void props.onRefreshSession();
              void loadDashboard();
            }}
            style={styles.flexButton}
            variant="ghost"
          />
        </View>
      </Surface>

      {statusMessage ? <InlineNotice message={statusMessage} tone="accent" /> : null}
      {dashboardError ? <InlineNotice message={dashboardError} tone="warning" title="Some data could not load" /> : null}

      {!props.session.authenticated ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Use a seeded account so every mobile tab can talk to the existing Next.js security model."
            title="Sign in"
          />
          <Field
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="vipin@example.local"
            value={email}
          />
          <Field
            label="Password"
            onChangeText={setPassword}
            placeholder="Samgamam!Demo2026"
            secureTextEntry
            value={password}
          />
          <View style={styles.quickActions}>
            {demoAccounts.map((account) => (
              <Button
                compact
                key={account.email}
                label={account.label}
                onPress={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                variant="secondary"
              />
            ))}
          </View>
          <Button
            label={authLoading ? 'Signing in...' : 'Sign in'}
            onPress={() => {
              void handleLogin();
            }}
          />
        </Surface>
      ) : (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Your access token is stored securely on-device and reused across app launches."
            title="Account"
          />
          <Text style={styles.accountName}>{props.session.viewer?.fullName}</Text>
          <Text style={styles.accountMeta}>{props.session.viewer?.email}</Text>
          <View style={styles.quickActions}>
            {(props.session.viewer?.roles ?? []).map((role) => (
              <Pill key={role} label={capitalizeLabel(role)} tone="accent" />
            ))}
            <Pill
              label={props.session.viewer?.emailVerified ? 'Verified' : 'Verification pending'}
              tone={props.session.viewer?.emailVerified ? 'success' : 'warning'}
            />
          </View>
          <View style={styles.row}>
            <Button
              label="Refresh session"
              onPress={() => {
                void props.onRefreshSession();
                void loadDashboard();
              }}
              style={styles.flexButton}
              variant="secondary"
            />
            <Button
              label={authLoading ? 'Signing out...' : 'Sign out'}
              onPress={() => {
                void handleLogout();
              }}
              style={styles.flexButton}
              variant="ghost"
            />
          </View>
        </Surface>
      )}

      {props.session.authenticated ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="These cards come from /api/continuity and turn return behavior into something warmer than a feed."
            title="Continuity"
          />
          {!continuity ? (
            <EmptyState
              message="Continuity prompts will appear here after the next backend refresh."
              title="No continuity data yet"
            />
          ) : null}
          {continuity?.continueConversation.length ? (
            <View style={styles.recommendationSection}>
              <SectionHeader title="Continue the conversation" />
              {continuity.continueConversation.map((item) => (
                <Surface key={item.id} style={styles.communityRecommendationCard}>
                  <View style={styles.quickActions}>
                    <Pill label={capitalizeLabel(item.kind)} tone="accent" />
                    {item.reasons.slice(0, 2).map((reason) => (
                      <Pill
                        key={`${item.id}-${reason}`}
                        label={capitalizeLabel(reason.replace(/_/g, ' '))}
                        tone="default"
                      />
                    ))}
                  </View>
                  <Text style={styles.analyticsTitle}>{item.title}</Text>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                </Surface>
              ))}
            </View>
          ) : null}
          {continuity?.newInYourCommunities.length ? (
            <View style={styles.recommendationSection}>
              <SectionHeader title="New in your communities" />
              {continuity.newInYourCommunities.map((item) => (
                <Surface key={item.id} style={styles.communityRecommendationCard}>
                  <Text style={styles.analyticsTitle}>{item.title}</Text>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                  <Text style={styles.notificationMeta}>{formatDateTime(item.createdAt, props.locale)}</Text>
                </Surface>
              ))}
            </View>
          ) : null}
          {continuity?.organizerNudges.length ? (
            <View style={styles.recommendationSection}>
              <SectionHeader title="Organizer nudges" />
              {continuity.organizerNudges.map((item) => (
                <Surface key={item.id} style={styles.communityRecommendationCard}>
                  <View style={styles.quickActions}>
                    <Pill
                      label={capitalizeLabel(item.priority)}
                      tone={item.priority === 'high' ? 'warning' : 'accent'}
                    />
                  </View>
                  <Text style={styles.analyticsTitle}>{item.title}</Text>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                </Surface>
              ))}
            </View>
          ) : null}
        </Surface>
      ) : null}

      {props.session.authenticated ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Push registration is device-specific. In-app notifications remain available even if push permission is blocked."
            title="Notification preferences"
          />
          <View style={styles.quickActions}>
            <Button
              compact
              label={inAppNotifications ? 'In-app on' : 'In-app off'}
              onPress={() => setInAppNotifications((currentValue) => !currentValue)}
              variant={inAppNotifications ? 'secondary' : 'ghost'}
            />
            <Button
              compact
              disabled={pushLoading}
              label={pushLoading ? 'Enabling...' : pushEnabled ? 'Push enabled' : 'Enable push'}
              onPress={() => {
                void handleEnablePush();
              }}
              variant={pushEnabled ? 'secondary' : 'ghost'}
            />
          </View>
          <InlineNotice
            message="Notification routes can open event details, communities, private event messages, galleries, and payment status. Missing targets fall back to this profile view."
            tone="accent"
          />
        </Surface>
      ) : null}

      {props.session.authenticated ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle={`${unreadCount} unread | synced from /api/notifications`}
            title="Notifications"
          />
          {notifications.length === 0 ? (
            <EmptyState
              message="You are all caught up."
              title="No notifications right now"
            />
          ) : null}
          {notifications.map((notification) => (
            <Surface key={notification.id} style={styles.notificationCard}>
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Pill
                  label={notification.status === 'read' ? 'Read' : 'Unread'}
                  tone={notification.status === 'read' ? 'default' : 'accent'}
                />
              </View>
              <Text style={styles.notificationBody}>{notification.body}</Text>
              <Text style={styles.notificationMeta}>
                {formatDateTime(notification.createdAt, props.locale)}
              </Text>
              {notification.status !== 'read' ? (
                <Button
                  compact
                  disabled={markingNotificationId === notification.id}
                  label={markingNotificationId === notification.id ? 'Saving...' : 'Mark read'}
                  onPress={() => {
                    void handleMarkNotificationRead(notification.id);
                  }}
                  variant="ghost"
                />
              ) : null}
              {notification.targetUrl ? (
                <Button
                  compact
                  label={notificationRouteLabel(notification)}
                  onPress={() => {
                    void props.onOpenRoute(resolveNotificationRoute(notification));
                  }}
                  variant="secondary"
                />
              ) : (
                <InlineNotice
                  message="This notification has no mobile destination."
                  tone="accent"
                />
              )}
            </Surface>
          ))}
        </Surface>
      ) : null}

      {props.session.authenticated ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="These sections are pulled from /api/recommendations."
            title="Personalized picks"
          />
          {!recommendations ? (
            <EmptyState
              message="Recommendations will appear here after the next successful backend refresh."
              title="No recommendation data yet"
            />
          ) : null}
          {recommendations ? (
            <InlineNotice
              message={`CTR ${recommendations.modelSummary.ctrWeight.toFixed(2)} | RSVP ${recommendations.modelSummary.rsvpWeight.toFixed(2)} | Network ${recommendations.modelSummary.networkWeight.toFixed(2)} | ${recommendations.modelSummary.fallbackActive ? 'Fallback still active' : 'Learning tuned live'}`}
              tone="accent"
              title="Recommendation model"
            />
          ) : null}
          {recommendationSections().map((section) => (
            <View key={section.key} style={styles.recommendationSection}>
              <SectionHeader title={section.title} />
              {section.items.length === 0 ? (
                <EmptyState
                  message="There is nothing in this bucket right now."
                  title="No items in this section"
                />
              ) : (
                section.kind === 'event'
                  ? (section.items as RecommendationItem[]).map((item) => (
                      <View key={`${section.key}-${item.event.id}`} style={styles.recommendationCard}>
                        <View style={styles.quickActions}>
                          <Pill label={`Score ${item.score}`} tone="accent" />
                          {item.reasons.slice(0, 2).map((reason) => (
                            <Pill key={reason} label={reason} tone="success" />
                          ))}
                        </View>
                        <EventCard event={item.event} locale={props.locale} />
                      </View>
                    ))
                  : (section.items as GroupRecommendationItem[]).map((item) => (
                      <Surface key={`${section.key}-${item.group.id}`} style={styles.communityRecommendationCard}>
                        <View style={styles.quickActions}>
                          <Pill label={`Score ${item.score}`} tone="accent" />
                          {item.group.languages.slice(0, 2).map((language) => (
                            <Pill key={`${item.group.id}-${language}`} label={language.toUpperCase()} tone="success" />
                          ))}
                        </View>
                        <Text style={styles.analyticsTitle}>{item.group.name}</Text>
                        <Text style={styles.notificationBody}>{item.group.description}</Text>
                        <Text style={styles.analyticsMeta}>
                          {item.group.memberCount} members | {item.group.discussionCount} discussions
                        </Text>
                        <View style={styles.quickActions}>
                          {item.reasons.slice(0, 2).map((reason) => (
                            <Pill key={reason} label={reason} tone="default" />
                          ))}
                        </View>
                      </Surface>
                    ))
              )}
            </View>
          ))}
        </Surface>
      ) : null}

      {analytics ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Organizer analytics come straight from /api/analytics."
            title="Organizer snapshot"
          />
          <View style={styles.metricRow}>
            <MetricTile label="Events published" value={String(analytics.eventsPublished)} />
            <MetricTile label="Total views" value={String(analytics.totalViews)} />
            <MetricTile label="Total RSVPs" value={String(analytics.totalRsvps)} />
            <MetricTile label="Avg conversion" value={formatPercent(analytics.averageConversionRate)} />
            <MetricTile label="Shares" value={String(analytics.totalShares)} />
            <MetricTile label="Invites" value={String(analytics.totalInvites)} />
          </View>
          <Surface style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>Growth funnel</Text>
            <Text style={styles.analyticsMeta}>
              {analytics.funnel.discoveryViews} discovery views | {analytics.funnel.eventClicks} clicks | {analytics.funnel.rsvps} RSVPs | {analytics.repeatGuestCount} repeat guests
            </Text>
          </Surface>
          {analytics.eventStats.map((stat) => (
            <Surface key={stat.eventId} style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>{stat.event.title}</Text>
              <Text style={styles.analyticsMeta}>
                {stat.views} views | {stat.clicks} clicks | {stat.rsvps} RSVPs | {stat.shares} shares | {stat.invitesSent} invites | {formatPercent(stat.conversionRate)} conversion
              </Text>
            </Surface>
          ))}
          {analytics.communityStats.map((community) => (
            <Surface key={community.groupId} style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>{community.name}</Text>
              <Text style={styles.analyticsMeta}>
                {community.memberCount} members | {community.discussionActivity} discussion touches | {formatPercent(community.retentionScore)} retention signal
              </Text>
            </Surface>
          ))}
        </Surface>
      ) : null}

      {organizerInsights || experiments || marketplace || recommendationLearning ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Phase 7 organizer intelligence now sits beside the familiar analytics stack."
            title="Organizer intelligence"
          />
          {organizerInsights ? (
            <>
              <View style={styles.metricRow}>
                <MetricTile label="AI suggestions" value={String(organizerInsights.growthSuggestions.length)} />
                <MetricTile label="Accepted AI" value={String(organizerInsights.aiUsageSummary.accepted)} />
                <MetricTile label="Avg AI lift" value={formatPercent(organizerInsights.aiUsageSummary.averageEstimatedLift)} />
              </View>
              {organizerInsights.eventInsights.map((insight) => (
                <Surface key={insight.eventId} style={styles.analyticsCard}>
                  <Text style={styles.analyticsTitle}>{insight.title}</Text>
                  <Text style={styles.analyticsMeta}>
                    Predicted attendance {insight.attendancePrediction} | Drop-off {capitalizeLabel(insight.dropOffRisk)} | Status {capitalizeLabel(insight.status)}
                  </Text>
                  {insight.recommendedActions.map((action) => (
                    <Text key={action.id} style={styles.notificationBody}>
                      {action.title}: {action.body}
                    </Text>
                  ))}
                </Surface>
              ))}
              {organizerInsights.communityHealth.map((community) => (
                <Surface key={community.groupId} style={styles.analyticsCard}>
                  <Text style={styles.analyticsTitle}>{community.name}</Text>
                  <Text style={styles.analyticsMeta}>
                    {capitalizeLabel(community.status.replace(/_/g, ' '))} | Engagement {community.engagementScore}
                  </Text>
                  <Text style={styles.notificationBody}>{community.reasons.join(' ')}</Text>
                </Surface>
              ))}
            </>
          ) : null}
          {recommendationLearning ? (
            <Surface style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Recommendation tuning</Text>
              <Text style={styles.analyticsMeta}>
                Sample size {recommendationLearning.model.sampleSize} | CTR {recommendationLearning.model.ctrWeight.toFixed(2)} | Behavior {recommendationLearning.model.behaviorWeight.toFixed(2)} | Regional {recommendationLearning.model.regionalWeight.toFixed(2)} | Time {recommendationLearning.model.timeWeight.toFixed(2)}
              </Text>
              <Text style={styles.notificationBody}>
                {recommendationLearning.model.fallbackActive
                  ? 'Fallback logic is still active while the system gathers more interaction data.'
                  : 'Learning weights now have enough signal to tune recommendations more confidently.'}
              </Text>
              <Text style={styles.notificationBody}>
                {recommendationLearning.model.explainabilityNotes.join(' ')}
              </Text>
            </Surface>
          ) : null}
          {recommendationLearning ? (
            <Surface style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Likely next touches</Text>
              {recommendationLearning.topEvents.slice(0, 3).map((item) => (
                <Text key={item.eventId} style={styles.notificationBody}>
                  {item.title}: {item.tunedScore.toFixed(1)} score | {item.reasons.join(' ')}
                </Text>
              ))}
              {recommendationLearning.topGroups.slice(0, 3).map((item) => (
                <Text key={item.groupId} style={styles.notificationBody}>
                  {item.name}: {item.signal ? item.signal.tunedScore.toFixed(1) : '0.0'} score |{' '}
                  {item.signal ? item.signal.reasons.join(' ') : 'No signal yet.'}
                </Text>
              ))}
            </Surface>
          ) : null}
          {experiments ? (
            <Surface style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Experiments and feature flags</Text>
              <Text style={styles.analyticsMeta}>
                {experiments.assignments.length} experiments | {experiments.featureFlags.filter((flag) => flag.enabled).length} enabled flags
              </Text>
              {experiments.assignments.map((assignment) => (
                <Text key={assignment.experiment.key} style={styles.notificationBody}>
                  {assignment.experiment.name}: {assignment.assignment?.variantKey ?? assignment.experiment.defaultVariant}
                </Text>
              ))}
            </Surface>
          ) : null}
          {marketplace ? (
            <Surface style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>Marketplace readiness</Text>
              <Text style={styles.analyticsMeta}>
                {marketplace.featuredListings.length} ranked listings | {marketplace.topOrganizers.length} trusted organizers
              </Text>
              {marketplace.topOrganizers.slice(0, 3).map((organizer) => (
                <Text key={organizer.organizerId} style={styles.notificationBody}>
                  {organizer.organizerName}: {organizer.rating.toFixed(1)} rating across {organizer.reviewCount} reviews
                </Text>
              ))}
            </Surface>
          ) : null}
        </Surface>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 28,
  },
  sectionCard: {
    gap: 14,
  },
  row: {
    columnGap: 12,
    flexDirection: 'row',
  },
  flexButton: {
    flex: 1,
  },
  quickActions: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  accountName: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  accountMeta: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  notificationCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
    padding: 14,
  },
  notificationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  notificationTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 12,
  },
  notificationBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  notificationMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  recommendationSection: {
    gap: 12,
  },
  recommendationCard: {
    gap: 10,
  },
  communityRecommendationCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
  },
  metricRow: {
    columnGap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  analyticsCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 6,
  },
  analyticsTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  analyticsMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
