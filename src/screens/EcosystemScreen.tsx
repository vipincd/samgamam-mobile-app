import React, {useEffect, useState} from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {apiClient, getErrorMessage} from '../api/client';
import type {
  IntegrationOverviewResponse,
  PlatformOverviewResponse,
  ReputationOverviewResponse,
  SocialGraphOverviewResponse,
} from '../api/types';
import {
  Button,
  EmptyState,
  InlineNotice,
  Pill,
  ScreenIntro,
  SectionHeader,
  Surface,
} from '../components/ui';
import {theme} from '../theme';
import {capitalizeLabel, formatDateTime, toShortName} from '../utils/format';

export function EcosystemScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  onRequestSignIn: () => void;
  roles: string[];
  viewerName: string | null;
}) {
  const [socialGraph, setSocialGraph] = useState<SocialGraphOverviewResponse | null>(null);
  const [reputation, setReputation] = useState<ReputationOverviewResponse | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationOverviewResponse | null>(null);
  const [platform, setPlatform] = useState<PlatformOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReadPlatformDirectory = props.roles.includes('organizer') || props.roles.includes('admin');

  async function loadEcosystem(isRefresh = false) {
    if (!props.isFocused) {
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    if (!props.authenticated) {
      setSocialGraph(null);
      setReputation(null);
      setIntegrations(null);
      setPlatform(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const results = await Promise.allSettled([
      apiClient.getSocialGraph(props.locale),
      apiClient.getReputation(props.locale),
      apiClient.getIntegrations(props.locale),
      canReadPlatformDirectory ? apiClient.getPlatform(props.locale) : Promise.resolve(null),
    ]);

    const [socialGraphResult, reputationResult, integrationsResult, platformResult] = results;

    if (socialGraphResult.status === 'fulfilled') {
      setSocialGraph(socialGraphResult.value);
    } else {
      setSocialGraph(null);
      setError((currentValue) => currentValue ?? getErrorMessage(socialGraphResult.reason));
    }

    if (reputationResult.status === 'fulfilled') {
      setReputation(reputationResult.value);
    } else {
      setReputation(null);
      setError((currentValue) => currentValue ?? getErrorMessage(reputationResult.reason));
    }

    if (integrationsResult.status === 'fulfilled') {
      setIntegrations(integrationsResult.value);
    } else {
      setIntegrations(null);
      setError((currentValue) => currentValue ?? getErrorMessage(integrationsResult.reason));
    }

    if (platformResult.status === 'fulfilled' && platformResult.value) {
      setPlatform(platformResult.value);
    } else {
      setPlatform(null);
      if (platformResult.status === 'rejected') {
        setError((currentValue) => currentValue ?? getErrorMessage(platformResult.reason));
      }
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadEcosystem();
    }, 0);

    return () => clearTimeout(timer);
  }, [props.isFocused, props.locale, props.authenticated, props.roles.join('|')]);

  const networkConnections = socialGraph?.connections ?? [];
  const peopleYouMayKnow = socialGraph?.peopleYouMayKnow ?? [];
  const overlappingCommunities = socialGraph?.overlappingCommunities ?? [];
  const trustIndicators = reputation?.indicators ?? [];
  const connectedIntegrations = integrations?.connectedIntegrations ?? [];
  const availableIntegrations = integrations?.availableIntegrations ?? [];
  const recentSyncs = integrations?.recentSyncs ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void loadEcosystem(true);
          }}
          refreshing={refreshing}
          tintColor={theme.colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <ScreenIntro
        eyebrow="Ecosystem"
        subtitle={`Hi ${toShortName(props.viewerName)}. This tab surfaces the network, trust, integrations, and extension layer that sits behind Samgamam.`}
        title="The platform grows through circles, not follower counts."
      />

      {!props.authenticated ? (
        <InlineNotice
          message="Sign in from Profile to read your social graph, reputation signals, and integration state."
          tone="warning"
          title="Sign in required"
        />
      ) : null}

      {error ? <InlineNotice message={error} tone="warning" title="Some data could not load" /> : null}

      <Surface style={styles.heroCard}>
        <View style={styles.heroStats}>
          <Pill label={props.authenticated ? 'Signed in' : 'Guest preview'} tone="accent" />
          <Pill label={`${networkConnections.length} connections`} tone="success" />
          <Pill label={`${peopleYouMayKnow.length} suggestions`} tone="warning" />
          {reputation ? <Pill label={`Trust ${reputation.trustScore}`} tone="default" /> : null}
        </View>
        <Text style={styles.heroTitle}>Belonging, trust, and extensibility stay in one calm view.</Text>
        <Text style={styles.heroText}>
          Samgamam keeps events as the entry point, communities as the retention layer, and the ecosystem layer
          privacy-aware so the product still feels human.
        </Text>
        <View style={styles.heroStats}>
          <Button
            compact
            label="Go to Profile"
            onPress={props.onRequestSignIn}
            variant="ghost"
          />
          <Button
            compact
            label={loading ? 'Refreshing...' : 'Refresh ecosystem'}
            onPress={() => {
              void loadEcosystem(true);
            }}
            variant="secondary"
          />
        </View>
      </Surface>

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Network overlap grows through people you know, shared communities, and event participation."
          title="Network effects"
        />
        <View style={styles.metricsRow}>
          <View style={styles.metricTile}>
            <Text style={styles.metricValue}>{networkConnections.length}</Text>
            <Text style={styles.metricLabel}>Connections</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricValue}>{peopleYouMayKnow.length}</Text>
            <Text style={styles.metricLabel}>People you may know</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricValue}>{overlappingCommunities.length}</Text>
            <Text style={styles.metricLabel}>Overlapping communities</Text>
          </View>
        </View>
        {networkConnections.length === 0 && peopleYouMayKnow.length === 0 ? (
          <EmptyState
            message="Connections and overlap signals will appear after more event participation."
            title="No network data yet"
          />
        ) : (
          <>
            {networkConnections.slice(0, 3).map((connection) => (
              <Surface key={connection.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>
                    {connection.sourceUserId} | {connection.targetUserId}
                  </Text>
                  <Pill label={capitalizeLabel(connection.type)} tone="accent" />
                </View>
                <Text style={styles.listBody}>
                  Shared groups {connection.sharedGroupIds.length} | shared events {connection.sharedEventIds.length}
                </Text>
              </Surface>
            ))}
            {peopleYouMayKnow.slice(0, 3).map((person) => (
              <Surface key={person.userId} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{person.fullName}</Text>
                  <Pill label={`Score ${person.score}`} tone="success" />
                </View>
                <Text style={styles.listBody}>
                  {person.city} | {person.reasons.join(' ')}
                </Text>
              </Surface>
            ))}
            {overlappingCommunities.slice(0, 3).map((community) => (
              <Surface key={community.groupId} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{community.name}</Text>
                  <Pill label={`Score ${community.score}`} tone="warning" />
                </View>
                <Text style={styles.listBody}>{community.reasons.join(' ')}</Text>
              </Surface>
            ))}
          </>
        )}
        <View style={styles.noticeStack}>
          {socialGraph?.privacyNotes.map((note) => (
            <InlineNotice key={note} message={note} tone="accent" />
          ))}
        </View>
      </Surface>

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Identity, participation, and repeat attendance are blended into a trust signal that still reads human."
          title="Trust and reputation"
        />
        {reputation ? (
          <>
            <View style={styles.heroStats}>
              <Pill label={reputation.identityStatus.replace(/_/g, ' ')} tone="accent" />
              <Pill label={`Trust ${reputation.trustScore}`} tone="success" />
              <Pill label={`Repeat ${reputation.repeatAttendance}`} tone="warning" />
            </View>
            {trustIndicators.map((indicator) => (
              <Surface key={indicator.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{indicator.label}</Text>
                  <Pill label={`${indicator.score}`} tone={indicator.status === 'strong' ? 'success' : 'default'} />
                </View>
                <Text style={styles.listBody}>{indicator.reasons.join(' ')}</Text>
              </Surface>
            ))}
            {reputation.trustNotes.map((note) => (
              <InlineNotice key={note} message={note} tone="accent" />
            ))}
          </>
        ) : (
          <EmptyState
            message="Trust signals appear after sign-in and verified email access."
            title="No reputation data yet"
          />
        )}
      </Surface>

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Integrations stay modular so calendars, shares, and sync history do not clutter the core app."
          title="Integrations"
        />
        {integrations ? (
          <>
            <View style={styles.metricsRow}>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{connectedIntegrations.length}</Text>
                <Text style={styles.metricLabel}>Connected</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{availableIntegrations.length}</Text>
                <Text style={styles.metricLabel}>Available</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{recentSyncs.length}</Text>
                <Text style={styles.metricLabel}>Recent syncs</Text>
              </View>
            </View>
            {connectedIntegrations.slice(0, 3).map((integration) => (
              <Surface key={integration.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{integration.label}</Text>
                  <Pill label={capitalizeLabel(integration.status)} tone="success" />
                </View>
                <Text style={styles.listBody}>
                  {integration.scope} scope | sync count {integration.syncCount}
                </Text>
                {integration.lastSyncedAt ? (
                  <Text style={styles.listMeta}>
                    Last synced {formatDateTime(integration.lastSyncedAt, props.locale)}
                  </Text>
                ) : null}
              </Surface>
            ))}
            {availableIntegrations.slice(0, 2).map((integration) => (
              <Surface key={integration.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{integration.label}</Text>
                  <Pill label={capitalizeLabel(integration.status)} tone="default" />
                </View>
                <Text style={styles.listBody}>{integration.scope} scope | ready to connect</Text>
              </Surface>
            ))}
            {recentSyncs.slice(0, 3).map((sync) => (
              <Surface key={sync.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{sync.provider}</Text>
                  <Pill label={capitalizeLabel(sync.status)} tone="warning" />
                </View>
                <Text style={styles.listBody}>
                  {sync.note} | {sync.targetType} / {sync.targetId}
                </Text>
                <Text style={styles.listMeta}>
                  {formatDateTime(sync.createdAt, props.locale)}
                </Text>
              </Surface>
            ))}
            {integrations.transparencyNotes.map((note) => (
              <InlineNotice key={note} message={note} tone="accent" />
            ))}
          </>
        ) : (
          <EmptyState
            message="Integration state appears after verified sign-in."
            title="No integration data yet"
          />
        )}
      </Surface>

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Platform APIs and read-only tools stay safe so partner surfaces can grow later."
          title="Platform extensibility"
        />
        {platform || canReadPlatformDirectory ? (
          <>
            {platform ? (
              <>
                <View style={styles.metricsRow}>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricValue}>{platform.apiDirectory.length}</Text>
                    <Text style={styles.metricLabel}>APIs</Text>
                  </View>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricValue}>{platform.mcpTools.length}</Text>
                    <Text style={styles.metricLabel}>MCP tools</Text>
                  </View>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricValue}>{platform.organizerProfiles.length}</Text>
                    <Text style={styles.metricLabel}>Creators</Text>
                  </View>
                </View>
                {platform.apiDirectory.map((endpoint) => (
                  <Surface key={endpoint.id} style={styles.listCard}>
                    <View style={styles.listRow}>
                      <Text style={styles.listTitle}>
                        {endpoint.method} {endpoint.path}
                      </Text>
                      <Pill label={endpoint.access} tone="accent" />
                    </View>
                    <Text style={styles.listBody}>{endpoint.description}</Text>
                  </Surface>
                ))}
                {platform.mcpTools.map((tool) => (
                  <Surface key={tool.name} style={styles.listCard}>
                    <View style={styles.listRow}>
                      <Text style={styles.listTitle}>{tool.name}</Text>
                      <Pill label={tool.capability} tone="success" />
                    </View>
                    <Text style={styles.listBody}>{tool.description}</Text>
                  </Surface>
                ))}
                {platform.notes.map((note) => (
                  <InlineNotice key={note} message={note} tone="accent" />
                ))}
              </>
            ) : (
              <InlineNotice
                message="Platform API directory is reserved for organizers and admins."
                tone="warning"
                title="Restricted view"
              />
            )}
          </>
        ) : (
          <InlineNotice
            message="Only verified organizers and admins can inspect the platform API directory in detail."
            tone="warning"
            title="Restricted view"
          />
        )}
      </Surface>

      {platform ? (
        <>
          <Surface style={styles.sectionCard}>
            <SectionHeader
              subtitle="Cache, queue, and trace signals show the modular monolith can absorb more load without a microservice split."
              title="Scale and safety"
            />
            <View style={styles.metricsRow}>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{Math.round((platform.scale?.cacheHitRate ?? 0) * 100)}%</Text>
                <Text style={styles.metricLabel}>Cache hit rate</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{platform.scale?.queuedJobs ?? 0}</Text>
                <Text style={styles.metricLabel}>Queued jobs</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{platform.safety?.riskLevel ?? 'low'}</Text>
                <Text style={styles.metricLabel}>Risk level</Text>
              </View>
            </View>
            {platform.scale?.notes.map((note) => (
              <InlineNotice key={note} message={note} tone="accent" />
            ))}
            {platform.safety?.dashboardNotes.map((note) => (
              <InlineNotice key={note} message={note} tone="warning" />
            ))}
          </Surface>

          <Surface style={styles.sectionCard}>
            <SectionHeader
              subtitle="Organizations, regional ranking, analytics, and developer access now sit behind the same platform layer."
              title="Organizations and intelligence"
            />
            <View style={styles.metricsRow}>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{platform.organizations?.organizationCount ?? 0}</Text>
                <Text style={styles.metricLabel}>Organizations</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{platform.regional?.hybridRecommendations.length ?? 0}</Text>
                <Text style={styles.metricLabel}>Hybrid picks</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{platform.dataPlatform?.cohorts.length ?? 0}</Text>
                <Text style={styles.metricLabel}>Cohorts</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{platform.developer?.apiKeys.length ?? 0}</Text>
                <Text style={styles.metricLabel}>API keys</Text>
              </View>
            </View>
            {platform.organizations?.organizations.slice(0, 2).map((organization) => (
              <Surface key={organization.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{organization.name}</Text>
                  <Pill label={`${organization.memberCount} members`} tone="accent" />
                </View>
                <Text style={styles.listBody}>{organization.notes.join(' ')}</Text>
              </Surface>
            ))}
            {platform.regional?.hybridRecommendations.slice(0, 2).map((item) => (
              <Surface key={item.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Pill label={`Score ${item.score}`} tone="success" />
                </View>
                <Text style={styles.listBody}>{item.reasons.join(' ')}</Text>
              </Surface>
            ))}
            {platform.dataPlatform?.metrics.slice(0, 2).map((metric) => (
              <Surface key={metric.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{metric.label}</Text>
                  <Pill label={metric.unit} tone="warning" />
                </View>
                <Text style={styles.listBody}>{metric.explanation}</Text>
              </Surface>
            ))}
            {platform.developer?.applications.slice(0, 2).map((app) => (
              <Surface key={app.id} style={styles.listCard}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>{app.name}</Text>
                  <Pill label={app.status} tone="accent" />
                </View>
                <Text style={styles.listBody}>{app.description}</Text>
              </Surface>
            ))}
          </Surface>
        </>
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
  heroCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 12,
  },
  heroStats: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  heroText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  sectionCard: {
    gap: 14,
  },
  metricsRow: {
    columnGap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  metricTile: {
    backgroundColor: theme.colors.cardAlt,
    borderRadius: theme.radius.sm,
    flex: 1,
    minWidth: 96,
    padding: 14,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  listCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 8,
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  listTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 12,
  },
  listBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  listMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  noticeStack: {
    gap: 8,
  },
});
