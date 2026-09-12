import React, { useEffect, useRef, useState } from 'react';
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
  authStatus?: 'unresolved' | 'authenticated' | 'signed-out' | 'reconciliation-failed';
  connectionError: string | null;
  isFocused: boolean;
  locale: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onSaveApiBaseUrl: (value: string | null) => Promise<string>;
  session: AuthSessionResponse;
}) {
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(props.apiBaseUrl);
  const [email, setEmail] = useState('vipin@example.local');
  const [password, setPassword] = useState('Samgamam!Demo2026');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const dashboardGen = useRef(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recommendations, setRecommendations] =
    useState<RecommendationsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

  useEffect(() => {
    setDraftApiBaseUrl(props.apiBaseUrl);
  }, [props.apiBaseUrl]);

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
    ]);

    if (thisGen !== dashboardGen.current || !props.session.authenticated) {
      return;
    }
    const [notificationsResult, recommendationsResult, analyticsResult] = promises;

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

      {props.authStatus === 'reconciliation-failed' ? (
        <Surface style={styles.sectionCard}>
          <SectionHeader
            subtitle="Your saved credentials are preserved on this device, but Samgamam could not reach the server to verify your session."
            title="Session verification paused"
          />
          <InlineNotice
            message={props.connectionError ?? 'Unable to reach backend to verify session while offline.'}
            tone="warning"
            title="Verification paused"
          />
          <View style={styles.row}>
            <Button
              label={authLoading ? 'Verifying...' : 'Retry verification'}
              onPress={async () => {
                setAuthLoading(true);
                try {
                  await props.onRefreshSession();
                  await loadDashboard();
                } finally {
                  setAuthLoading(false);
                }
              }}
              style={styles.flexButton}
            />
            <Button
              label="Sign out from device"
              onPress={() => {
                void handleLogout();
              }}
              style={styles.flexButton}
              variant="ghost"
            />
          </View>
        </Surface>
      ) : !props.session.authenticated ? (
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
            subtitle={`${unreadCount} unread · synced from /api/notifications`}
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
