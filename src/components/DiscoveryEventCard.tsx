import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, Check, MapPin, UsersRound } from 'lucide-react-native';
import type { EventSummary } from '../api/types';
import { brand } from '../brand';
import { formatCurrency, formatEventDate } from '../utils/format';

export function DiscoveryEventCard({ event, locale, actionLabel, disabled, onPress, onPressCard }: {
  event: EventSummary; locale: string; actionLabel: string; disabled?: boolean; onPress: () => void; onPressCard?: () => void;
}) {
  const date = new Date(event.startsAt);
  const cardBody = (
    <>
      <View style={styles.top}>
        <View style={styles.date} accessible accessibilityLabel={formatEventDate(event.startsAt, locale)}>
          <Text style={styles.month}>{date.toLocaleDateString(locale, { month: 'short' }).toUpperCase()}</Text>
          <Text style={styles.day}>{date.getDate()}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.category}>{event.category}</Text>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{event.title}</Text>
          <Text style={styles.time}>{date.toLocaleDateString(locale, { weekday: 'short' })} · {date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</Text>
        </View>
      </View>
      <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
      <View style={styles.meta}><MapPin size={14} color={brand.muted} /><Text style={styles.metaText} numberOfLines={1}>{event.location}</Text></View>
    </>
  );

  return <View style={styles.card}>
    {onPressCard ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${event.title}`} onPress={onPressCard} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        {cardBody}
      </Pressable>
    ) : cardBody}
    <View style={styles.footer}>
      <View style={styles.priceGroup}>
        <Text style={styles.price}>{formatCurrency(event.ticketPriceCents, event.currency, locale)}</Text>
        {typeof event.attendeeCount === 'number' ? (
          <View style={styles.meta}><UsersRound size={12} color={brand.muted} /><Text style={styles.attending}>{event.attendeeCount} attending</Text></View>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${event.title}`} accessibilityState={{ disabled }} disabled={disabled}
        onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }, disabled && { opacity: 0.65 }]}>
        <Text style={styles.actionText}>{actionLabel}</Text>
        {event.viewerRsvpState === 'going' ? <Check size={15} color={brand.primaryStrong} /> : <ArrowUpRight size={15} color={brand.primaryStrong} />}
      </Pressable>
    </View>
  </View>;
}
export function EventSkeleton() {
  return <View style={styles.skeleton} accessibilityLabel="Loading events" accessibilityRole="progressbar">
    {[0, 1].map((key) => <View key={key} style={styles.card}>
      <View style={styles.top}><View style={[styles.block, { width: 52, height: 64 }]} /><View style={{ flex: 1, gap: 12 }}><View style={[styles.block, { width: '40%', height: 10 }]} /><View style={[styles.block, { width: '85%', height: 20 }]} /><View style={[styles.block, { width: '55%', height: 10 }]} /></View></View>
      <View style={[styles.block, { height: 12, width: '92%' }]} /><View style={[styles.block, { height: 12, width: '70%' }]} />
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: brand.surface, borderRadius: 18, borderWidth: 1, borderColor: brand.border, padding: 18, gap: 12 },
  top: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  date: { width: 52, minHeight: 64, paddingVertical: 9, borderRadius: 12, backgroundColor: brand.primarySoft, alignItems: 'center' },
  month: { fontFamily: brand.fonts.bold, fontSize: 10, letterSpacing: 1, color: brand.primaryStrong },
  day: { fontFamily: brand.fonts.display, fontSize: 28, lineHeight: 33, color: brand.primaryStrong },
  titleBlock: { flex: 1, gap: 4 },
  category: { fontFamily: brand.fonts.bold, fontSize: 10, color: brand.accentStrong, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontFamily: brand.fonts.display, fontSize: 19, lineHeight: 24, color: brand.ink },
  time: { fontFamily: brand.fonts.medium, fontSize: 11, color: brand.muted },
  description: { fontFamily: brand.fonts.body, color: brand.muted, fontSize: 12, lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flex: 1, fontFamily: brand.fonts.medium, fontSize: 11, color: brand.muted },
  footer: { borderTopWidth: 1, borderTopColor: brand.border, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  priceGroup: { gap: 4 }, price: { color: brand.ink, fontFamily: brand.fonts.bold, fontSize: 15 },
  attending: { color: brand.muted, fontFamily: brand.fonts.body, fontSize: 10 },
  action: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, backgroundColor: brand.primarySoft },
  actionText: { fontFamily: brand.fonts.bold, fontSize: 11, color: brand.primaryStrong },
  skeleton: { gap: 14 }, block: { backgroundColor: brand.mutedSurface, borderRadius: 6 },
});
