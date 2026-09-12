import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, MapPin, Search, SearchX, WifiOff, X } from "lucide-react-native";
import { apiClient, getErrorMessage } from "../api/client";
import type { EventSummary, RecommendationsResponse } from "../api/types";
import { brand } from "../brand";
import { DiscoveryEventCard, EventSkeleton } from "../components/DiscoveryEventCard";
import { within } from "../startup/within";
import { formatCurrency, formatEventDate } from "../utils/format";

export function DiscoverScreen(props: {
  authenticated: boolean; isFocused: boolean; locale: string; onRequestSignIn: () => void; viewerName: string | null;
}) {
  const { authenticated, isFocused, locale, onRequestSignIn } = props;
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Event Detail state
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  

  const loadEvents = useCallback(async (
    search: string,
    refresh = false,
    isCancelled: () => boolean = () => false,
  ) => {
    const request = ++generation.current;
    setRefreshing(refresh);
    setLoading(!refresh);
    setError(null);
    setSubmittedQuery(search);
    setCategory("All");
    setNextCursor(null);
    setHasNextPage(false);

    try {
      if (search.trim()) {
        const result = await within(apiClient.searchEvents(search, locale));
        if (request === generation.current && !isCancelled()) {
          setEvents(result.items);
          setNextCursor(null);
          setHasNextPage(false);
        }
      } else {
        const result = await within(apiClient.getEvents({ locale, limit: 6 }));
        if (request === generation.current && !isCancelled()) {
          setEvents(result.events);
          if (result.events.length > 0 && !selectedEvent) {
            setSelectedEvent(result.events[0]);
          }
          setNextCursor(result.page?.nextCursor ?? null);
          setHasNextPage(Boolean(result.page?.hasNextPage && result.page?.nextCursor));
        }
      }
    } catch (e) {
      if (request === generation.current && !isCancelled()) setError(getErrorMessage(e));
    } finally {
      if (request === generation.current && !isCancelled()) { setLoading(false); setRefreshing(false); }
    }
  }, [locale]);

  const loadMoreEvents = useCallback(async () => {
    if (!hasNextPage || !nextCursor || loadingMore || loading || submittedQuery.trim()) {
      return;
    }

    setLoadingMore(true);
    try {
      const result = await apiClient.getEvents({ locale, cursor: nextCursor, limit: 6 });
      setEvents((current) => {
        const existingIds = new Set(current.map((e) => e.id));
        const newItems = result.events.filter((e) => !existingIds.has(e.id));
        return [...current, ...newItems];
      });
      setNextCursor(result.page?.nextCursor ?? null);
      setHasNextPage(Boolean(result.page?.hasNextPage && result.page?.nextCursor));
    } catch {
      // transient pagination failure, keep existing items
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, nextCursor, loadingMore, loading, submittedQuery, locale]);

  useEffect(() => {
    const operation = { cancelled: false };
    if (isFocused) void loadEvents("", false, () => operation.cancelled);
    return () => {
      operation.cancelled = true;
    };
  }, [isFocused, authenticated, loadEvents]);

  useEffect(() => {
    let active = true;
    setRecommendations(null);
    if (authenticated && isFocused) {
      void within(apiClient.getRecommendations(2))
        .then((r) => { if (active) setRecommendations(r); })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [authenticated, isFocused, locale]);

  async function openEventDetail(eventSummary: EventSummary) {
    setSelectedEvent(eventSummary);
    
    try {
      const detailed = await apiClient.getEvent(eventSummary.id, locale);
      setSelectedEvent(detailed.event);
    } catch {
      // keep summary
    } finally {
      
    }
  }

  async function handleRsvp(event: EventSummary) {
    if (!authenticated) { onRequestSignIn(); return; }
    setPendingEventId(event.id); setMessage(null);
    try {
      const next = (event.capacityMode === "unlimited" || (event.remainingCapacity ?? 0) > 0) ? "going" : "waitlist";
      const response = await apiClient.rsvpToEvent(event.id, next);
      setEvents(current => current.map(item => item.id === response.event.id ? response.event : item));
      if (selectedEvent?.id === response.event.id) {
        setSelectedEvent(response.event);
      }
      setRecommendations(current => current ? { ...current, recommendedForYou: current.recommendedForYou.map(item => item.event.id === response.event.id ? { ...item, event: response.event } : item) } : current);
      setMessage(next === "going" ? "Your place is confirmed." : "You’re on the waitlist.");
    } catch (e) { setMessage(getErrorMessage(e)); }
    finally { setPendingEventId(null); }
  }

  const actionLabel = (event: EventSummary) =>
    pendingEventId === event.id ? "Saving…" :
    !authenticated ? "Sign in to join" :
    event.viewerRsvpState === "going" ? "Going" :
    (event.capacityMode === "unlimited" || (event.remainingCapacity ?? 0) > 0) ? "Join gathering" : "Join waitlist";

  const renderEvent = (event: EventSummary) => (
    <DiscoveryEventCard
      event={event}
      locale={locale}
      actionLabel={actionLabel(event)}
      disabled={pendingEventId === event.id || event.viewerRsvpState === "going"}
      onPress={() => { void handleRsvp(event); }}
      onPressCard={() => { void openEventDetail(event); }}
    />
  );

  const categories = ["All", ...Array.from(new Set(events.map(e => e.category)))];
  const visible = category === "All" ? events : events.filter(e => e.category === category);

  return (
    <>
      <FlatList
        data={loading ? [] : visible}
        keyExtractor={item => item.id}
        renderItem={({ item }) => renderEvent(item)}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        windowSize={5}
        onEndReached={() => { void loadMoreEvents(); }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={brand.primary}
            onRefresh={() => { void loadEvents(submittedQuery, true); }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Image source={brand.logo} resizeMode="contain" style={styles.logo} accessibilityLabel={`Samgamam. ${brand.caption}`} />
              <View style={styles.locale}><Text style={styles.localeText}>{locale.toUpperCase()}</Text></View>
            </View>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>DISCOVER YOUR COMMUNITY</Text>
              <Text style={styles.heading} accessibilityRole="header">Find your next{"\n"}shared moment.</Text>
              <Text style={styles.subtitle}>Good company is closer than you think.</Text>
            </View>
            <View style={styles.search}>
              <Search size={19} color={brand.muted} />
              <TextInput
                accessibilityLabel="Search events"
                value={query}
                onChangeText={setQuery}
                placeholder="City, gathering or a little inspiration…"
                placeholderTextColor={brand.muted}
                returnKeyType="search"
                autoCorrect={false}
                style={styles.searchInput}
                onSubmitEditing={() => { void loadEvents(query); }}
              />
              {query ? (
                <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => { setQuery(""); void loadEvents(""); }} style={styles.searchButton}>
                  <X size={17} color={brand.muted} />
                </Pressable>
              ) : null}
              <Pressable accessibilityLabel="Search" accessibilityRole="button" style={({ pressed }) => [styles.submit, pressed && { opacity: 0.7 }]} onPress={() => { void loadEvents(query); }}>
                <ArrowRight size={18} color="#FFF" />
              </Pressable>
            </View>
            {!submittedQuery && (
              <View style={styles.editorial}>
                <View style={styles.editorialCopy}>
                  <Text style={styles.eyebrow}>BETTER TOGETHER</Text>
                  <Text style={styles.editorialTitle}>A place to meet.{"\n"}A reason to stay.</Text>
                  <Text style={styles.editorialBody}>Make room for real connection.</Text>
                </View>
                <Image source={brand.community} style={styles.editorialImage} resizeMode="cover" accessibilityLabel="Friends sharing a conversation, from the Samgamam website" />
              </View>
            )}
            {recommendations && recommendations.recommendedForYou.length > 0 ? (
              <View style={styles.recommendations}>
                <Text style={styles.sectionTitle}>For your circles</Text>
                {recommendations.recommendedForYou.map(item => <View key={item.event.id}>{renderEvent(item.event)}</View>)}
                {recommendations.communitiesYouMayFeelAtHomeIn.map(item => (
                  <View key={item.group.id} style={styles.community}>
                    <Text style={styles.communityTitle}>{item.group.name}</Text>
                    <Text style={styles.subtitle}>{item.group.memberCount} members · {item.group.languages.join(" · ")}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{submittedQuery ? "Search results" : "Explore gatherings"}</Text>
              {!loading && <Text style={styles.count}>{visible.length} {visible.length === 1 ? "gathering" : "gatherings"}</Text>}
            </View>
            {categories.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {categories.map(item => (
                  <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={({ pressed }) => [styles.chip, category === item && styles.chipActive, pressed && { opacity: 0.7 }]}>
                    <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
            {error && (
              <View style={styles.feedback} accessibilityLiveRegion="polite">
                <WifiOff size={24} color={brand.primary} />
                <Text style={styles.feedbackTitle}>Let’s reconnect</Text>
                <Text style={styles.feedbackCopy}>We couldn’t load the latest gatherings. Check your connection and try again.</Text>
                <Pressable accessibilityRole="button" onPress={() => { void loadEvents(submittedQuery); }} style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? <EventSkeleton /> : !error ? (
            <View style={styles.feedback}>
              <SearchX size={30} color={brand.primary} />
              <Text style={styles.feedbackTitle}>A new moment is around the corner</Text>
              <Text style={styles.feedbackCopy}>Try another city or topic, or explore all gatherings.</Text>
              <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setQuery(""); void loadEvents(""); }}>
                <Text style={styles.retryText}>Explore all</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ fontFamily: brand.fonts.medium, color: brand.muted, fontSize: 12 }}>Loading more gatherings...</Text>
            </View>
          ) : !loading && visible.length > 0 ? (
            <Text style={styles.endNote}>Every gathering starts with showing up.</Text>
          ) : null
        }
      />

      {selectedEvent ? (
        <Modal
          animationType="slide"
          transparent={false}
          visible={Boolean(selectedEvent)}
          onRequestClose={() => setSelectedEvent(null)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Pressable
                accessibilityLabel="Close details"
                accessibilityRole="button"
                onPress={() => setSelectedEvent(null)}
                style={styles.modalCloseButton}
              >
                <ArrowLeft size={20} color={brand.ink} />
                <Text style={styles.modalCloseText}>Back</Text>
              </Pressable>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>Event details</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.modalTopBadgeRow}>
                <View style={styles.badgeChip}>
                  <Text style={styles.badgeChipText}>{selectedEvent.category.toUpperCase()}</Text>
                </View>
                <View style={[styles.badgeChip, { backgroundColor: brand.primarySoft }]}>
                  <Text style={[styles.badgeChipText, { color: brand.primaryStrong }]}>
                    {selectedEvent.capacityMode === "unlimited" || (selectedEvent.remainingCapacity ?? 0) > 0
                      ? (selectedEvent.capacityMode === "unlimited" ? "Open gathering" : `${selectedEvent.remainingCapacity} spots left`)
                      : "Waitlist only"}
                  </Text>
                </View>
              </View>
              <Text style={styles.modalTitle}>{selectedEvent.title}</Text>
              <View style={styles.modalMetaSection}>
                <Text style={styles.modalDateText}>
                  {formatEventDate(selectedEvent.startsAt, locale)} {selectedEvent.timeZone ? `(${selectedEvent.timeZone})` : ""}
                </Text>
                <View style={styles.modalMetaRow}>
                  <MapPin size={15} color={brand.muted} />
                  <Text style={styles.modalLocationText}>{selectedEvent.location}</Text>
                </View>
                <Text style={styles.modalPriceText}>
                  {formatCurrency(selectedEvent.ticketPriceCents, selectedEvent.currency, locale)}
                  {typeof selectedEvent.attendeeCount === "number" ? ` · ${selectedEvent.attendeeCount} attending` : ""}
                </Text>
              </View>

              <Text style={styles.modalSectionHeading}>About this gathering</Text>
              <Text style={styles.modalDescription}>{selectedEvent.description}</Text>

              {selectedEvent.tags && selectedEvent.tags.length > 0 ? (
                <View style={styles.modalTagRow}>
                  {selectedEvent.tags.map(tag => (
                    <View key={tag} style={styles.tagPill}><Text style={styles.tagPillText}>#{tag}</Text></View>
                  ))}
                </View>
              ) : null}

              {selectedEvent.viewerRsvpState ? (
                <View style={styles.modalRsvpStateBox}>
                  <Text style={styles.modalRsvpStateText}>
                    Your RSVP status: {selectedEvent.viewerRsvpState === "going" ? "Confirmed (Going)" : "On waitlist"}
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={actionLabel(selectedEvent)}
                disabled={pendingEventId === selectedEvent.id || selectedEvent.viewerRsvpState === "going"}
                onPress={() => { void handleRsvp(selectedEvent); }}
                style={({ pressed }) => [
                  styles.modalActionButton,
                  pressed && { opacity: 0.8 },
                  (pendingEventId === selectedEvent.id || selectedEvent.viewerRsvpState === "going") && { opacity: 0.65 }
                ]}
              >
                <Text style={styles.modalActionText}>{actionLabel(selectedEvent)}</Text>
                {selectedEvent.viewerRsvpState === "going" ? <Check size={18} color="#FFF" /> : <ArrowUpRight size={18} color="#FFF" />}
              </Pressable>
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24, maxWidth: 680, width: "100%", alignSelf: "center" },
  header: { gap: 20, paddingTop: 12, paddingBottom: 14 }, brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 158, height: 36 }, locale: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderColor: brand.border, borderWidth: 1 }, localeText: { fontFamily: brand.fonts.bold, color: brand.muted, fontSize: 10 },
  intro: { gap: 7 }, eyebrow: { fontFamily: brand.fonts.bold, fontSize: 9, letterSpacing: 1.5, color: brand.primaryStrong },
  heading: { fontFamily: brand.fonts.display, fontSize: 33, lineHeight: 37, letterSpacing: -0.8, color: brand.ink }, subtitle: { fontFamily: brand.fonts.body, fontSize: 12, lineHeight: 20, color: brand.muted },
  search: { flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 6, borderWidth: 1, borderColor: brand.border, borderRadius: 13, backgroundColor: brand.surface, gap: 8 },
  searchInput: { flex: 1, fontFamily: brand.fonts.body, fontSize: 11, color: brand.ink, minHeight: 52, paddingVertical: 12 },
  searchButton: { minWidth: 32, minHeight: 44, justifyContent: "center", alignItems: "center" },
  submit: { width: 44, height: 40, borderRadius: 9, backgroundColor: brand.primaryStrong, alignItems: "center", justifyContent: "center" },
  editorial: { flexDirection: "row", minHeight: 145, borderRadius: 17, overflow: "hidden", backgroundColor: brand.mutedSurface },
  editorialCopy: { flex: 1, padding: 17, gap: 9, justifyContent: "center" }, editorialTitle: { fontFamily: brand.fonts.display, fontSize: 21, lineHeight: 25, color: brand.ink }, editorialBody: { fontFamily: brand.fonts.body, fontSize: 10, lineHeight: 16, color: brand.muted }, editorialImage: { width: "44%", height: "100%", minHeight: 145 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }, sectionTitle: { fontFamily: brand.fonts.display, fontSize: 22, color: brand.ink }, count: { fontFamily: brand.fonts.medium, fontSize: 10, color: brand.muted },
  filters: { gap: 8 }, chip: { paddingHorizontal: 15, minHeight: 44, justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface }, chipActive: { backgroundColor: brand.primaryStrong, borderColor: brand.primaryStrong }, chipText: { color: brand.muted, fontFamily: brand.fonts.medium, fontSize: 11 }, chipTextActive: { color: "#FFF" },
  notice: { fontFamily: brand.fonts.medium, color: brand.primaryStrong, fontSize: 13, lineHeight: 20 },
  feedback: { backgroundColor: brand.mutedSurface, borderRadius: 18, alignItems: "center", padding: 24, gap: 12 }, feedbackTitle: { fontFamily: brand.fonts.display, fontSize: 21, textAlign: "center", color: brand.ink }, feedbackCopy: { fontFamily: brand.fonts.body, color: brand.muted, fontSize: 12, lineHeight: 20, textAlign: "center" }, retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 20, backgroundColor: brand.primaryStrong, borderRadius: 12 }, retryText: { color: "#FFF", fontFamily: brand.fonts.bold, fontSize: 12 },
  endNote: { fontFamily: brand.fonts.body, fontSize: 11, textAlign: "center", color: brand.muted, marginVertical: 26 }, recommendations: { gap: 14 }, community: { borderLeftWidth: 2, borderLeftColor: brand.primary, paddingLeft: 12 }, communityTitle: { fontFamily: brand.fonts.display, fontSize: 17, color: brand.ink },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: brand.canvas },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: brand.border, backgroundColor: brand.surface },
  modalCloseButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 8 },
  modalCloseText: { fontFamily: brand.fonts.bold, color: brand.ink, fontSize: 15 },
  modalHeaderTitle: { fontFamily: brand.fonts.bold, fontSize: 16, color: brand.ink },
  modalContent: { padding: 20, gap: 18 },
  modalTopBadgeRow: { flexDirection: "row", gap: 8 },
  badgeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: brand.mutedSurface },
  badgeChipText: { fontFamily: brand.fonts.bold, fontSize: 11, color: brand.accentStrong },
  modalTitle: { fontFamily: brand.fonts.display, fontSize: 26, lineHeight: 32, color: brand.ink },
  modalMetaSection: { gap: 6, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: brand.border },
  modalDateText: { fontFamily: brand.fonts.bold, fontSize: 14, color: brand.primaryStrong },
  modalMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  modalLocationText: { fontFamily: brand.fonts.body, fontSize: 13, color: brand.muted },
  modalPriceText: { fontFamily: brand.fonts.bold, fontSize: 15, color: brand.ink },
  modalSectionHeading: { fontFamily: brand.fonts.display, fontSize: 18, color: brand.ink, marginTop: 6 },
  modalDescription: { fontFamily: brand.fonts.body, fontSize: 14, lineHeight: 22, color: brand.muted },
  modalTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: brand.mutedSurface },
  tagPillText: { fontFamily: brand.fonts.medium, fontSize: 12, color: brand.muted },
  modalRsvpStateBox: { padding: 12, borderRadius: 10, backgroundColor: brand.primarySoft, alignItems: "center" },
  modalRsvpStateText: { fontFamily: brand.fonts.bold, fontSize: 13, color: brand.primaryStrong },
  modalActionButton: { minHeight: 52, borderRadius: 14, backgroundColor: brand.primaryStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  modalActionText: { fontFamily: brand.fonts.bold, fontSize: 16, color: "#FFF" },
});
