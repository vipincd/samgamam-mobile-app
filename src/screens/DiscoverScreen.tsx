import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiClient, getErrorMessage } from '../api/client';
import type { EventSummary } from '../api/types';
import { EventCard } from '../components/EventCard';
import {
  Button,
  EmptyState,
  Field,
  InlineNotice,
  Pill,
  ScreenIntro,
  SectionHeader,
  Surface,
} from '../components/ui';
import { theme } from '../theme';
import { toShortName } from '../utils/format';

export function DiscoverScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  onRequestSignIn: () => void;
  viewerName: string | null;
}) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents(useSearch: boolean, isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      if (useSearch && query.trim()) {
        const response = await apiClient.searchEvents(query, props.locale);
        setEvents(response.items);
        setSummary(`Showing ${response.total} search matches for “${query.trim()}”.`);
      } else {
        const response = await apiClient.getEvents(props.locale);
        setEvents(response.events);
        setSummary(`Showing ${response.events.length} upcoming community moments.`);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!props.isFocused) {
      return;
    }

    void loadEvents(false);
  }, [props.authenticated, props.isFocused, props.locale]);

  async function handleRsvp(event: EventSummary) {
    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from the Profile tab to RSVP for events.');
      return;
    }

    setPendingEventId(event.id);
    setError(null);

    try {
      const nextState = event.remainingCapacity > 0 ? 'going' : 'waitlist';
      const response = await apiClient.rsvpToEvent(event.id, nextState);
      setEvents((currentEvents) =>
        currentEvents.map((item) => (item.id === response.event.id ? response.event : item)),
      );
      setSummary(
        nextState === 'going'
          ? 'Your place is confirmed.'
          : 'You have been added to the waitlist.',
      );
    } catch (rsvpError) {
      setError(getErrorMessage(rsvpError));
    } finally {
      setPendingEventId(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void loadEvents(Boolean(query.trim()), true);
          }}
          refreshing={refreshing}
          tintColor={theme.colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <ScreenIntro
        eyebrow="Discover"
        subtitle={`Hello ${toShortName(props.viewerName)}. Browse events already served by the Samgamam backend and RSVP in one tap.`}
        title="Find the next gathering worth showing up for."
      />

      <Surface style={styles.heroCard}>
        <View style={styles.heroStats}>
          <Pill label={props.authenticated ? 'Signed in' : 'Guest mode'} tone="accent" />
          <Pill label={props.locale.toUpperCase()} tone="success" />
        </View>
        <Text style={styles.heroTitle}>Community events, not placeholder cards.</Text>
        <Text style={styles.heroText}>
          Search the real event API, browse multilingual meetups, and RSVP directly from your phone.
        </Text>
      </Surface>

      <Surface style={styles.searchCard}>
        <SectionHeader
          subtitle="Use the backend search endpoint for quick filtering."
          title="Search events"
        />
        <Field
          label="Search phrase"
          onChangeText={setQuery}
          placeholder="Try brunch, family, music, or alumni"
          returnKeyType="search"
          value={query}
        />
        <View style={styles.row}>
          <Button
            label={loading ? 'Searching...' : 'Search'}
            onPress={() => {
              void loadEvents(true);
            }}
            style={styles.flexButton}
          />
          <Button
            label="Reset"
            onPress={() => {
              setQuery('');
              void loadEvents(false);
            }}
            style={styles.flexButton}
            variant="ghost"
          />
        </View>
      </Surface>

      {summary ? <InlineNotice message={summary} tone="success" /> : null}
      {error ? <InlineNotice message={error} tone="warning" title="Action needed" /> : null}
      {!props.authenticated ? (
        <InlineNotice
          message="You can browse everything as a guest. Sign in from Profile to RSVP and unlock personalized tabs."
          tone="accent"
          title="Guest mode"
        />
      ) : null}

      <SectionHeader
        subtitle={loading ? 'Refreshing live content from the backend.' : 'Pulled from /api/events or /api/search.'}
        title="Upcoming moments"
      />

      {loading ? (
        <Surface>
          <Text style={styles.loadingText}>Loading events from Samgamam...</Text>
        </Surface>
      ) : null}

      {!loading && events.length === 0 ? (
        <EmptyState
          message="Try a broader search phrase or refresh after checking your API connection."
          title="No events matched this search"
        />
      ) : null}

      {events.map((event) => (
        <EventCard
          actionDisabled={pendingEventId === event.id || event.viewerRsvpState === 'going'}
          actionLabel={
            !props.authenticated
              ? 'Sign in to RSVP'
              : event.viewerRsvpState === 'going'
                ? 'Already going'
                : event.remainingCapacity > 0
                  ? 'RSVP now'
                  : 'Join waitlist'
          }
          event={event}
          key={event.id}
          locale={props.locale}
          onActionPress={() => {
            void handleRsvp(event);
          }}
        />
      ))}
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
  searchCard: {
    gap: 14,
  },
  row: {
    columnGap: 12,
    flexDirection: 'row',
  },
  flexButton: {
    flex: 1,
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
});
