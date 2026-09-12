import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EventSummary } from '../api/types';
import { theme } from '../theme';
import { formatCurrency, formatEventDate } from '../utils/format';
import { Button, Pill, Surface } from './ui';

export function EventCard(props: {
  actionDisabled?: boolean;
  actionLabel?: string;
  event: EventSummary;
  locale: string;
  onActionPress?: () => void;
}) {
  const { event } = props;

  return (
    <Surface style={styles.card}>
      <View style={styles.topRow}>
        <Pill label={event.category} tone="accent" />
        <Pill
          label={(event.capacityMode === 'unlimited' || (event.remainingCapacity ?? 0) > 0) ? (event.capacityMode === 'unlimited' ? 'Open gathering' : `${event.remainingCapacity} spots left`) : 'Waitlist only'}
          tone={(event.capacityMode === 'unlimited' || (event.remainingCapacity ?? 0) > 0) ? 'success' : 'warning'}
        />
      </View>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{event.title}</Text>
        <Text numberOfLines={3} style={styles.description}>
          {event.description}
        </Text>
      </View>
      <View style={styles.metaList}>
        <Text style={styles.metaLine}>{formatEventDate(event.startsAt, props.locale)}</Text>
        <Text style={styles.metaLine}>{event.location}</Text>
        <Text style={styles.metaLine}>
          {formatCurrency(event.ticketPriceCents, event.currency, props.locale)}{typeof event.attendeeCount === 'number' ? ` · ${event.attendeeCount} attending` : ''}
        </Text>
      </View>
      <View style={styles.tags}>
        {event.tags.slice(0, 4).map((tag) => (
          <Pill key={tag} label={tag} />
        ))}
      </View>
      {event.viewerRsvpState ? (
        <Text style={styles.rsvpStatus}>
          Your RSVP: {event.viewerRsvpState === 'going' ? 'Going' : 'On the waitlist'}
        </Text>
      ) : null}
      {props.onActionPress ? (
        <Button
          disabled={props.actionDisabled}
          label={props.actionLabel ?? 'Open'}
          onPress={props.onActionPress}
          variant={(event.capacityMode === 'unlimited' || (event.remainingCapacity ?? 0) > 0) ? 'primary' : 'secondary'}
        />
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  topRow: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  copyBlock: {
    gap: 6,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  description: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  metaList: {
    gap: 4,
  },
  metaLine: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  tags: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  rsvpStatus: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
