import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowRight, Search, SearchX, WifiOff, X } from 'lucide-react-native';
import { apiClient, getErrorMessage } from '../api/client';
import type { EventSummary, RecommendationsResponse } from '../api/types';
import { brand } from '../brand';
import { DiscoveryEventCard, EventSkeleton } from '../components/DiscoveryEventCard';
import { within } from '../startup/within';

export function DiscoverScreen(props: {
  authenticated: boolean; isFocused: boolean; locale: string; onRequestSignIn: () => void; viewerName: string | null;
}) {
  const { authenticated, isFocused, locale, onRequestSignIn } = props;
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const loadEvents = useCallback(async (
    search: string,
    refresh = false,
    isCancelled: () => boolean = () => false,
  ) => {
    const request = ++generation.current;
    setRefreshing(refresh); setLoading(!refresh); setError(null);
    setSubmittedQuery(search); setCategory('All');
    try {
      const result = await within(search.trim() ? apiClient.searchEvents(search, locale).then(r => r.items) : apiClient.getEvents(locale).then(r => r.events));
      if (request === generation.current && !isCancelled()) setEvents(result);
    } catch (e) {
      if (request === generation.current && !isCancelled()) setError(getErrorMessage(e));
    } finally {
      if (request === generation.current && !isCancelled()) { setLoading(false); setRefreshing(false); }
    }
  }, [locale]);

  useEffect(() => {
    const operation = { cancelled: false };
    if (isFocused) void loadEvents('', false, () => operation.cancelled);
    return () => {
      operation.cancelled = true;
    };
  }, [isFocused, authenticated, loadEvents]);

  useEffect(() => {
    let active = true;
    setRecommendations(null);
    if (authenticated && isFocused) void within(apiClient.getRecommendations(2))
      .then(r => { if (active) setRecommendations(r); }).catch(() => undefined);
    return () => { active = false; };
  }, [authenticated, isFocused, locale]);

  async function handleRsvp(event: EventSummary) {
    if (!authenticated) { onRequestSignIn(); return; }
    setPendingEventId(event.id); setMessage(null);
    try {
      const next = event.remainingCapacity > 0 ? 'going' : 'waitlist';
      const response = await apiClient.rsvpToEvent(event.id, next);
      setEvents(current => current.map(item => item.id === response.event.id ? response.event : item));
      setRecommendations(current => current ? { ...current, recommendedForYou: current.recommendedForYou.map(item => item.event.id === response.event.id ? { ...item, event: response.event } : item) } : current);
      setMessage(next === 'going' ? 'Your place is confirmed.' : 'You’re on the waitlist.');
    } catch (e) { setMessage(getErrorMessage(e)); }
    finally { setPendingEventId(null); }
  }
  const actionLabel = (event: EventSummary) => pendingEventId === event.id ? 'Saving…' : !authenticated ? 'Sign in to join' : event.viewerRsvpState === 'going' ? 'Going' : event.remainingCapacity > 0 ? 'Join gathering' : 'Join waitlist';
  const renderEvent = (event: EventSummary) => <DiscoveryEventCard event={event} locale={locale} actionLabel={actionLabel(event)} disabled={pendingEventId === event.id || event.viewerRsvpState === 'going'} onPress={() => { void handleRsvp(event); }} />;
  const categories = ['All', ...Array.from(new Set(events.map(e => e.category)))];
  const visible = category === 'All' ? events : events.filter(e => e.category === category);

  return <FlatList data={loading ? [] : visible} keyExtractor={item => item.id}
    renderItem={({ item }) => renderEvent(item)} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
    contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled" initialNumToRender={4} windowSize={5}
    refreshControl={<RefreshControl refreshing={refreshing} tintColor={brand.primary} onRefresh={() => { void loadEvents(submittedQuery, true); }} />}
    ListHeaderComponent={<View style={styles.header}>
      <View style={styles.brandRow}><Image source={brand.logo} resizeMode="contain" style={styles.logo} accessibilityLabel={`Samgamam. ${brand.caption}`} /><View style={styles.locale}><Text style={styles.localeText}>{locale.toUpperCase()}</Text></View></View>
      <View style={styles.intro}><Text style={styles.eyebrow}>DISCOVER YOUR COMMUNITY</Text><Text style={styles.heading} accessibilityRole="header">Find your next{ '\n' }shared moment.</Text><Text style={styles.subtitle}>Good company is closer than you think.</Text></View>
      <View style={styles.search}>
        <Search size={19} color={brand.muted} />
        <TextInput accessibilityLabel="Search events" value={query} onChangeText={setQuery} placeholder="City, gathering or a little inspiration…" placeholderTextColor={brand.muted} returnKeyType="search" autoCorrect={false} style={styles.searchInput} onSubmitEditing={() => { void loadEvents(query); }} />
        {query ? <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => { setQuery(''); void loadEvents(''); }} style={styles.searchButton}><X size={17} color={brand.muted} /></Pressable> : null}
        <Pressable accessibilityLabel="Search" accessibilityRole="button" style={({ pressed }) => [styles.submit, pressed && { opacity: 0.7 }]} onPress={() => { void loadEvents(query); }}><ArrowRight size={18} color="#FFF" /></Pressable>
      </View>
      {!submittedQuery && <View style={styles.editorial}>
        <View style={styles.editorialCopy}><Text style={styles.eyebrow}>BETTER TOGETHER</Text><Text style={styles.editorialTitle}>A place to meet.{ '\n' }A reason to stay.</Text><Text style={styles.editorialBody}>Make room for real connection.</Text></View>
        <Image source={brand.community} style={styles.editorialImage} resizeMode="cover" accessibilityLabel="Friends sharing a conversation, from the Samgamam website" />
      </View>}
      {recommendations && recommendations.recommendedForYou.length > 0 ? <View style={styles.recommendations}>
        <Text style={styles.sectionTitle}>For your circles</Text>
        {recommendations.recommendedForYou.map(item => <View key={item.event.id}>{renderEvent(item.event)}</View>)}
        {recommendations.communitiesYouMayFeelAtHomeIn.map(item => <View key={item.group.id} style={styles.community}>
          <Text style={styles.communityTitle}>{item.group.name}</Text><Text style={styles.subtitle}>{item.group.memberCount} members · {item.group.languages.join(' · ')}</Text>
        </View>)}
      </View> : null}
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{submittedQuery ? 'Search results' : 'Explore gatherings'}</Text>{!loading && <Text style={styles.count}>{visible.length} {visible.length === 1 ? 'gathering' : 'gatherings'}</Text>}</View>
      {categories.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {categories.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={({ pressed }) => [styles.chip, category === item && styles.chipActive, pressed && { opacity: 0.7 }]}><Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text></Pressable>)}
      </ScrollView>}
      {message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
      {error && <View style={styles.feedback} accessibilityLiveRegion="polite"><WifiOff size={24} color={brand.primary} /><Text style={styles.feedbackTitle}>Let’s reconnect</Text><Text style={styles.feedbackCopy}>We couldn’t load the latest gatherings. Check your connection and try again.</Text><Pressable accessibilityRole="button" onPress={() => { void loadEvents(submittedQuery); }} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>}
    </View>}
    ListEmptyComponent={loading ? <EventSkeleton /> : !error ? <View style={styles.feedback}><SearchX size={30} color={brand.primary} /><Text style={styles.feedbackTitle}>A new moment is around the corner</Text><Text style={styles.feedbackCopy}>Try another city or topic, or explore all gatherings.</Text><Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setQuery(''); void loadEvents(''); }}><Text style={styles.retryText}>Explore all</Text></Pressable></View> : null}
    ListFooterComponent={!loading && visible.length > 0 ? <Text style={styles.endNote}>Every gathering starts with showing up.</Text> : null}
  />;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24, maxWidth: 680, width: '100%', alignSelf: 'center' },
  header: { gap: 20, paddingTop: 12, paddingBottom: 14 }, brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 158, height: 36 }, locale: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderColor: brand.border, borderWidth: 1 }, localeText: { fontFamily: brand.fonts.bold, color: brand.muted, fontSize: 10 },
  intro: { gap: 7 }, eyebrow: { fontFamily: brand.fonts.bold, fontSize: 9, letterSpacing: 1.5, color: brand.primaryStrong },
  heading: { fontFamily: brand.fonts.display, fontSize: 33, lineHeight: 37, letterSpacing: -0.8, color: brand.ink }, subtitle: { fontFamily: brand.fonts.body, fontSize: 12, lineHeight: 20, color: brand.muted },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, borderWidth: 1, borderColor: brand.border, borderRadius: 13, backgroundColor: brand.surface, gap: 8 },
  searchInput: { flex: 1, fontFamily: brand.fonts.body, fontSize: 11, color: brand.ink, minHeight: 52, paddingVertical: 12 },
  searchButton: { minWidth: 32, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  submit: { width: 44, height: 40, borderRadius: 9, backgroundColor: brand.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  editorial: { flexDirection: 'row', minHeight: 145, borderRadius: 17, overflow: 'hidden', backgroundColor: brand.mutedSurface },
  editorialCopy: { flex: 1, padding: 17, gap: 9, justifyContent: 'center' }, editorialTitle: { fontFamily: brand.fonts.display, fontSize: 21, lineHeight: 25, color: brand.ink }, editorialBody: { fontFamily: brand.fonts.body, fontSize: 10, lineHeight: 16, color: brand.muted }, editorialImage: { width: '44%', height: '100%', minHeight: 145 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, sectionTitle: { fontFamily: brand.fonts.display, fontSize: 22, color: brand.ink }, count: { fontFamily: brand.fonts.medium, fontSize: 10, color: brand.muted },
  filters: { gap: 8 }, chip: { paddingHorizontal: 15, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface }, chipActive: { backgroundColor: brand.primaryStrong, borderColor: brand.primaryStrong }, chipText: { color: brand.muted, fontFamily: brand.fonts.medium, fontSize: 11 }, chipTextActive: { color: '#FFF' },
  notice: { fontFamily: brand.fonts.medium, color: brand.primaryStrong, fontSize: 13, lineHeight: 20 },
  feedback: { backgroundColor: brand.mutedSurface, borderRadius: 18, alignItems: 'center', padding: 24, gap: 12 }, feedbackTitle: { fontFamily: brand.fonts.display, fontSize: 21, textAlign: 'center', color: brand.ink }, feedbackCopy: { fontFamily: brand.fonts.body, color: brand.muted, fontSize: 12, lineHeight: 20, textAlign: 'center' }, retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: brand.primaryStrong, borderRadius: 12 }, retryText: { color: '#FFF', fontFamily: brand.fonts.bold, fontSize: 12 },
  endNote: { fontFamily: brand.fonts.body, fontSize: 11, textAlign: 'center', color: brand.muted, marginVertical: 26 }, recommendations: { gap: 14 }, community: { borderLeftWidth: 2, borderLeftColor: brand.primary, paddingLeft: 12 }, communityTitle: { fontFamily: brand.fonts.display, fontSize: 17, color: brand.ink },
});
