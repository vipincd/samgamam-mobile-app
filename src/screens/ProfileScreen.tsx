import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiClient, getErrorMessage, isProductionEnvironment } from '../api/client';
import { parseDeepLinkUrl, type NavigationTarget } from "../services/deep-links";
import {
  checkPushPermissionAsync,
  requestPushPermissionAsync,
  registerDevicePushTokenAsync,
  type PushPermissionState,
} from '../services/notifications';
import { OrganizerDashboardScreen } from "./OrganizerDashboardScreen";
import type {
  AnalyticsOverview,
  GroupSummary,
  AuthSessionResponse,
  GroupRecommendationItem,
  NotificationItem,
  RecommendationItem,
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
import {
  capitalizeLabel,
  formatDateTime,
  formatPercent,
  toShortName,
} from '../utils/format';

export function ProfileScreen(props: {
  apiBaseUrl: string;
  authStatus?:
    | 'unresolved'
    | 'authenticated'
    | 'signed-out'
    | 'reconciliation-failed'
    | 'initializing'
    | 'signedOut'
    | 'signingIn'
    | 'signedIn'
    | 'refreshing'
    | 'expired'
    | 'error';
  connectionError: string | null;
  isFocused: boolean;
  locale: string;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onSaveApiBaseUrl: (value: string | null) => Promise<string>;
  session: AuthSessionResponse;
  onNavigateTarget?: (target: NavigationTarget) => void;
}) {
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(props.apiBaseUrl);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const dashboardGen = useRef(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recommendations, setRecommendations] =
    useState<RecommendationsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [showOrganizerStudio, setShowOrganizerStudio] = useState(false);
  const [organizerGroups, setOrganizerGroups] = useState<GroupSummary[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>('undetermined');
  const [requestingPush, setRequestingPush] = useState(false);

  const isDev = typeof __DEV__ !== 'undefined' && Boolean(__DEV__) && !isProductionEnvironment();

  useEffect(() => {
    setDraftApiBaseUrl(props.apiBaseUrl);
  }, [props.apiBaseUrl]);

  useEffect(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      void checkPushPermissionAsync().then((state) => {
        setPushPermission(state);
      });
    }
  }, [props.isFocused, props.session.authenticated]);

  async function handleRequestPushPermission() {
    setRequestingPush(true);
    try {
      const nextState = await requestPushPermissionAsync();
      setPushPermission(nextState);
      if (nextState === 'granted' && props.session.viewer?.id) {
        await registerDevicePushTokenAsync(apiClient, props.session.viewer.id, {
          locale: props.locale,
        });
        setStatusMessage('Notifications enabled on this device.');
      }
    } catch (err) {
      setDashboardError(getErrorMessage(err));
    } finally {
      setRequestingPush(false);
    }
  }

  async function loadDashboard(isRefresh = false) {
    if (!props.isFocused) {
      return;
    }
    const thisGen = ++dashboardGen.current;

    if (isRefresh) {
      setRefreshing(true);
    }

    setDashboardError(null);

    try {
      const health = await apiClient.healthCheck();
      setHealthMessage(`Connected to ${health.service} · ${formatDateTime(health.timestamp, props.locale)}`);
    } catch (healthError) {
      setHealthMessage(null);
      setDashboardError(getErrorMessage(healthError));
    }

    if (!props.session.authenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setRecommendations(null);
      setAnalytics(null);
      setRefreshing(false);
      return;
    }

    const promises = await Promise.allSettled([
      apiClient.getNotifications(),
      apiClient.getRecommendations(3),
      props.session.viewer?.roles.includes('organizer') || props.session.viewer?.roles.includes('admin')
        ? apiClient.getAnalytics()
        : Promise.resolve(null),
      props.session.viewer?.roles.includes('organizer') || props.session.viewer?.roles.includes('admin')
        ? apiClient.getGroups()
        : Promise.resolve(null),
    ]);

    if (thisGen !== dashboardGen.current || !props.session.authenticated) {
      return;
    }
    const [notificationsResult, recommendationsResult, analyticsResult, groupsResult] = promises;

    if (groupsResult && groupsResult.status === "fulfilled" && groupsResult.value) {
      setOrganizerGroups(groupsResult.value.groups || []);
    }

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

    if (analyticsResult.status === 'fulfilled' && analyticsResult.value) {
      setAnalytics(analyticsResult.value);
    } else if (analyticsResult.status === 'rejected') {
      setDashboardError((currentValue) => currentValue ?? getErrorMessage(analyticsResult.reason));
    } else {
      setAnalytics(null);
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
      await props.onLogin();
      setStatusMessage('Signed in successfully.');
      await loadDashboard();
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    dashboardGen.current++;
    setAuthLoading(true);
    setStatusMessage(null);

    try {
      await props.onLogout();
      setNotifications([]);
      setUnreadCount(0);
      setRecommendations(null);
      setAnalytics(null);
      setStatusMessage('Signed out from this device.');
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSaveBaseUrl() {
    if (!isDev) {
      return;
    }
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

  type RecommendationSection = {
    items: (RecommendationItem | GroupRecommendationItem)[];
    key:
      | 'recommendedForYou'
      | 'communitiesYouMayFeelAtHomeIn'
      | 'peopleLikeYouAreJoining'
      | 'gatheringsNearYou'
      | 'becauseYouJoined'
      | 'inYourLanguage';
    title: string;
    kind: 'community' | 'event';
  };

  function recommendationSections(): RecommendationSection[] {
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
        items: recommendations.communitiesYouMayFeelAtHomeIn,
        key: 'communitiesYouMayFeelAtHomeIn',
        title: 'Communities you may feel at home in',
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
    ];
  }

  if (showOrganizerStudio) {
    return (
      <OrganizerDashboardScreen
        groups={organizerGroups}
        locale={props.locale}
        onBack={() => setShowOrganizerStudio(false)}
        viewerName={props.session.viewer?.fullName}
      />
    );
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
        subtitle={`This tab handles session management, notifications, recommendations, and organizer stats for ${toShortName(props.session.viewer?.fullName)}.`}
        title="Account & Preferences"
      />

      {isDev ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Set this when your phone cannot reach localhost. The saved URL persists through app restarts."
            title="Backend connection (Dev Only)"
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
              variant="secondary"
            />
          </View>
        </Surface>
      ) : null}

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Signed in sessions automatically include the Bearer token on all API calls."
          title="Account session"
        />
        {statusMessage ? <InlineNotice message={statusMessage} tone="accent" /> : null}
        {dashboardError ? (
          <InlineNotice message={dashboardError} tone="warning" title="Backend notice" />
        ) : null}

        {props.session.authenticated && props.session.viewer ? (
          <>
            <Text style={styles.accountName}>{props.session.viewer.fullName}</Text>
            <Text style={styles.accountMeta}>
              {props.session.viewer.email} · {props.session.viewer.roles.map(capitalizeLabel).join(', ')}
            </Text>
            <View style={styles.quickActions}>
              <Pill
                label={props.session.viewer.emailVerified ? 'Email verified' : 'Email unverified'}
                tone={props.session.viewer.emailVerified ? 'success' : 'warning'}
              />
              <Pill label={`Locale ${props.locale.toUpperCase()}`} tone="default" />
              {pushPermission === 'granted' ? (
                <Pill label="Push notifications active" tone="success" />
              ) : pushPermission === 'denied' ? (
                <Pill label="Notifications disabled in settings" tone="default" />
              ) : null}
            </View>

            {pushPermission === 'undetermined' ? (
              <Surface style={styles.notificationCard}>
                <View style={styles.notificationHeader}>
                  <Text style={styles.notificationTitle}>Enable Push Notifications</Text>
                  <Pill label="Action" tone="accent" />
                </View>
                <Text style={styles.notificationBody}>
                  Receive real-time updates when spots open up on waitlists and important event announcements.
                </Text>
                <Button
                  disabled={requestingPush}
                  label={requestingPush ? 'Requesting...' : 'Enable notifications'}
                  onPress={() => {
                    void handleRequestPushPermission();
                  }}
                  variant="primary"
                />
              </Surface>
            ) : null}

            <View style={styles.row}>
              <Button
                disabled={authLoading}
                label={authLoading ? 'Signing out...' : 'Sign out'}
                onPress={() => {
                  void handleLogout();
                }}
                style={styles.flexButton}
                variant="secondary"
              />
            </View>
          </>
        ) : (
          <>
            <EmptyState
              message="Sign in to RSVP, manage communities, and receive waitlist updates."
              title="You’re currently signed out"
            />
            <Button
              disabled={authLoading}
              label={authLoading ? 'Signing in...' : 'Sign in with Auth0'}
              onPress={() => {
                void handleLogin();
              }}
              variant="primary"
            />
          </>
        )}
      </Surface>

      {props.session.authenticated ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            action={<Pill label={`${unreadCount} unread`} tone={unreadCount > 0 ? 'accent' : 'default'} />}
            subtitle="Real-time notifications sent to your account."
            title="Activity feed"
          />
          {notifications.length === 0 ? (
            <EmptyState
              message="You have no notifications yet. RSVPs and community announcements will appear here."
              title="Inbox is clear"
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
              <View style={styles.row}>
                {notification.targetUrl ? (
                  <Button
                    compact
                    label="View details"
                    onPress={() => {
                      if (notification.status !== "read") {
                        void handleMarkNotificationRead(notification.id);
                      }
                      const target = parseDeepLinkUrl(notification.targetUrl);
                      if (target.type !== "unknown") {
                        props.onNavigateTarget?.(target);
                      }
                    }}
                    style={styles.flexButton}
                    variant="secondary"
                  />
                ) : null}
                {notification.status !== 'read' ? (
                  <Button
                    compact
                    disabled={markingNotificationId === notification.id}
                    label={markingNotificationId === notification.id ? 'Saving...' : 'Mark read'}
                    onPress={() => {
                      void handleMarkNotificationRead(notification.id);
                    }}
                    style={notification.targetUrl ? styles.flexButton : undefined}
                    variant="ghost"
                  />
                ) : null}
              </View>
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
                          {item.group.memberCount} members · {item.group.discussionCount} discussions
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
          <Button
            label="Open Organizer Studio"
            onPress={() => setShowOrganizerStudio(true)}
            variant="primary"
          />

          <View style={styles.metricRow}>
            <MetricTile label="Events published" value={String(analytics.eventsPublished)} />
            <MetricTile label="Total views" value={String(analytics.totalViews)} />
            <MetricTile label="Total RSVPs" value={String(analytics.totalRsvps)} />
            <MetricTile label="Avg conversion" value={formatPercent(analytics.averageConversionRate)} />
          </View>
          {analytics.eventStats.map((stat) => (
            <Surface key={stat.eventId} style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>{stat.event.title}</Text>
              <Text style={styles.analyticsMeta}>
                {stat.views} views · {stat.clicks} clicks · {stat.rsvps} RSVPs · {formatPercent(stat.conversionRate)} conversion
              </Text>
            </Surface>
          ))}
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
