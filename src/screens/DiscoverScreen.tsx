import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  MapPin,
  Search,
  SearchX,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react-native";
import { apiClient, ApiError, getErrorMessage } from "../api/client";
import type { EventSummary, RecommendationsResponse } from "../api/types";
import { brand } from "../brand";
import { DiscoveryEventCard, EventSkeleton } from "../components/DiscoveryEventCard";
import { within } from "../startup/within";
import { formatCurrency, formatEventDate } from "../utils/format";

export function DiscoverScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  onRequestSignIn: () => void;
  viewerName: string | null;
  targetEventId?: string | null;
  onClearTargetEventId?: () => void;
}) {
  const { authenticated, isFocused, locale, onRequestSignIn, targetEventId, onClearTargetEventId } = props;
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [actionState, setActionState] = useState<"idle" | "submitting" | "cancelling">("idle");
  const [modalLoading, setModalLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  // Selected event modal
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);

  useEffect(() => {
    if (!targetEventId) return;

    let cancelled = false;
    async function loadTargetEvent(id: string) {
      try {
        setModalLoading(true);
        const detailed = await apiClient.getEvent(id, locale);
        if (!cancelled) {
          setSelectedEvent(detailed.event);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setModalLoading(false);
          onClearTargetEventId?.();
        }
      }
    }

    void loadTargetEvent(targetEventId);
    return () => {
      cancelled = true;
    };
  }, [targetEventId, locale, onClearTargetEventId]);

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadEvents = useCallback(
    async (search = "", isPullRefresh = false, isCancelled: () => boolean = () => false) => {
      const request = ++generation.current;
      if (isPullRefresh) setRefreshing(true);
      else setLoading(true);
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
            setSelectedEvent((current) => {
              if (!current) return null;
              return result.items.find((e) => e.id === current.id) ?? current;
            });
            setNextCursor(null);
            setHasNextPage(false);
          }
        } else {
          const result = await within(apiClient.getEvents({ locale, limit: 6 }));
          if (request === generation.current && !isCancelled()) {
            setEvents(result.events);
            setSelectedEvent((current) => {
              if (!current) return null;
              return result.events.find((e) => e.id === current.id) ?? current;
            });
            setNextCursor(result.page?.nextCursor ?? null);
            setHasNextPage(Boolean(result.page?.hasNextPage && result.page?.nextCursor));
          }
        }
      } catch (e) {
        if (request === generation.current && !isCancelled()) setError(getErrorMessage(e));
      } finally {
        if (request === generation.current && !isCancelled()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [locale]
  );

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
      setSelectedEvent((current) => {
        if (!current) return null;
        return result.events.find((e) => e.id === current.id) ?? current;
      });
      setNextCursor(result.page?.nextCursor ?? null);
      setHasNextPage(Boolean(result.page?.hasNextPage && result.page?.nextCursor));
    } catch (err) {
      setMessage(getErrorMessage(err));
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
        .then((r) => {
          if (active) setRecommendations(r);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [authenticated, isFocused, locale]);

  async function openEventDetail(eventSummary: EventSummary) {
    setSelectedEvent(eventSummary);
    setModalLoading(true);
    setMessage(null);
    try {
      const detailed = await apiClient.getEvent(eventSummary.id, locale);
      setSelectedEvent(detailed.event);
      setEvents((current) => current.map((item) => (item.id === detailed.event.id ? detailed.event : item)));
    } catch {
      // Keep existing summary if network fetch fails
    } finally {
      setModalLoading(false);
    }
  }

  async function handleRsvp(event: EventSummary) {
    if (!authenticated) {
      onRequestSignIn();
      return;
    }
    setPendingEventId(event.id);
    setActionState("submitting");
    setMessage(null);
    try {
      const response = await apiClient.rsvpToEvent(event.id);
      setEvents((current) =>
        current.map((item) => (item.id === response.event.id ? response.event : item))
      );
      if (selectedEvent?.id === response.event.id) {
        setSelectedEvent(response.event);
      }
      setRecommendations((current) =>
        current
          ? {
              ...current,
              recommendedForYou: current.recommendedForYou.map((item) =>
                item.event.id === response.event.id ? { ...item, event: response.event } : item
              ),
            }
          : current
      );
      if (response.data?.state === "going" || response.event.viewerRsvpState === "going") {
        setMessage("Your place is confirmed. You're going!");
      } else {
        setMessage("You are on the waitlist. We'll notify you if a spot opens up.");
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "email_verification_required") {
          setMessage("Email verification required. Please verify your email before joining events.");
        } else if (e.code === "event_registration_paused") {
          setMessage("Event registration is currently paused by platform administrators.");
        } else if (e.code === "event_cancelled") {
          setMessage("This event has been cancelled. Registrations are closed.");
        } else if (e.code === "event_past") {
          setMessage("This event has already taken place. Registration is closed.");
        } else if (e.isAuthError) {
          setMessage("Please sign in to join this gathering.");
        } else if (e.isNetworkError) {
          setMessage("Connection error. Your registration could not be submitted. Please try again.");
        } else {
          setMessage(e.message || "Failed to join event.");
        }
      } else {
        setMessage(getErrorMessage(e));
      }
    } finally {
      setPendingEventId(null);
      setActionState("idle");
    }
  }

  async function handleCancelRsvp(event: EventSummary) {
    if (!authenticated) return;
    setPendingEventId(event.id);
    setActionState("cancelling");
    setMessage(null);
    try {
      const response = await apiClient.cancelRsvp(event.id);
      setEvents((current) =>
        current.map((item) => (item.id === response.event.id ? response.event : item))
      );
      if (selectedEvent?.id === response.event.id) {
        setSelectedEvent(response.event);
      }
      setRecommendations((current) =>
        current
          ? {
              ...current,
              recommendedForYou: current.recommendedForYou.map((item) =>
                item.event.id === response.event.id ? { ...item, event: response.event } : item
              ),
            }
          : current
      );
      setMessage("Your registration has been cancelled.");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "event_past") {
          setMessage("Cannot cancel registration for past events.");
        } else if (e.code === "event_not_found") {
          setMessage("Event not found.");
        } else if (e.isNetworkError) {
          setMessage("Connection failed. Your registration was not cancelled.");
        } else {
          setMessage(e.message || "Failed to cancel registration.");
        }
      } else {
        setMessage(getErrorMessage(e));
      }
    } finally {
      setPendingEventId(null);
      setActionState("idle");
    }
  }

  function confirmCancelRsvp(event: EventSummary) {
    const isWaitlisted = event.viewerRsvpState === "waitlist";
    const title = isWaitlisted ? "Leave Waitlist" : "Cancel RSVP";
    const prompt = isWaitlisted
      ? `Are you sure you want to leave the waitlist for "${event.title}"?`
      : `Are you sure you want to cancel your registration for "${event.title}"? Your spot may be given to someone on the waitlist.`;

    Alert.alert(
      title,
      prompt,
      [
        { text: "Keep Spot", style: "cancel" },
        {
          text: isWaitlisted ? "Leave Waitlist" : "Cancel RSVP",
          style: "destructive",
          onPress: () => {
            void handleCancelRsvp(event);
          },
        },
      ],
      { cancelable: true }
    );
  }

  const actionLabel = (event: EventSummary) => {
    if (pendingEventId === event.id) {
      return actionState === "cancelling" ? "Cancelling…" : "Saving…";
    }
    if (!authenticated) return "Sign in to join";
    if (event.status === "cancelled") return "Event Cancelled";
    if (event.viewerRsvpState === "going") return "Going";
    if (event.viewerRsvpState === "waitlist") return "Waitlisted";
    if (event.viewerRsvpState === "cancelled") {
      return (event.capacityMode === "unlimited" || (event.remainingCapacity ?? 0) > 0)
        ? "Rejoin gathering"
        : "Join waitlist";
    }
    return (event.capacityMode === "unlimited" || (event.remainingCapacity ?? 0) > 0)
      ? "Join gathering"
      : "Join waitlist";
  };

  const renderEvent = (event: EventSummary) => {
    const isGoing = event.viewerRsvpState === "going";
    const isWaitlisted = event.viewerRsvpState === "waitlist";
    const isPending = pendingEventId === event.id;

    return (
      <DiscoveryEventCard
        event={event}
        locale={locale}
        actionLabel={actionLabel(event)}
        disabled={isPending}
        onPress={() => {
          if (isGoing || isWaitlisted) {
            void openEventDetail(event);
          } else {
            void handleRsvp(event);
          }
        }}
        onPressCard={() => {
          void openEventDetail(event);
        }}
      />
    );
  };

  const categories = ["All", ...Array.from(new Set(events.map((e) => e.category)))];
  const visible = category === "All" ? events : events.filter((e) => e.category === category);

  return (
    <>
      <FlatList
        data={loading ? [] : visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderEvent(item)}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        windowSize={5}
        onEndReached={() => {
          void loadMoreEvents();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={brand.primary}
            onRefresh={() => {
              void loadEvents(submittedQuery, true);
            }}
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
                {recommendations.recommendedForYou.map((item) => <View key={item.event.id}>{renderEvent(item.event)}</View>)}
                {recommendations.communitiesYouMayFeelAtHomeIn.map((item) => (
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
                {categories.map((item) => (
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
              <View style={{ width: 60, alignItems: "flex-end", paddingRight: 16 }}>
                {modalLoading ? <ActivityIndicator size="small" color={brand.primary} /> : null}
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.modalTopBadgeRow}>
                <View style={styles.badgeChip}>
                  <Text style={styles.badgeChipText}>{selectedEvent.category.toUpperCase()}</Text>
                </View>
                <View
                  style={[
                    styles.badgeChip,
                    {
                      backgroundColor:
                        selectedEvent.status === "cancelled"
                          ? "rgba(192,70,70,0.12)"
                          : brand.primarySoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeChipText,
                      {
                        color:
                          selectedEvent.status === "cancelled"
                            ? brand.danger
                            : brand.primaryStrong,
                      },
                    ]}
                  >
                    {selectedEvent.status === "cancelled"
                      ? "Event Cancelled"
                      : selectedEvent.capacityMode === "unlimited" || (selectedEvent.remainingCapacity ?? 0) > 0
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
                <View style={styles.modalMetaRow}>
                  <UsersRound size={15} color={brand.muted} />
                  <Text style={styles.modalLocationText}>
                    {selectedEvent.capacityMode === "limited" && typeof selectedEvent.capacity === "number"
                      ? `${selectedEvent.capacity} capacity limit`
                      : "Unlimited capacity"}
                    {typeof selectedEvent.attendeeCount === "number" ? ` · ${selectedEvent.attendeeCount} going` : ""}
                    {typeof selectedEvent.waitlistCount === "number" && selectedEvent.waitlistCount > 0 ? ` · ${selectedEvent.waitlistCount} waitlisted` : ""}
                  </Text>
                </View>
                <Text style={styles.modalPriceText}>
                  {formatCurrency(selectedEvent.ticketPriceCents, selectedEvent.currency, locale)}
                </Text>
              </View>

              <Text style={styles.modalSectionHeading}>About this gathering</Text>
              <Text style={styles.modalDescription}>{selectedEvent.description}</Text>

              {selectedEvent.tags && selectedEvent.tags.length > 0 ? (
                <View style={styles.modalTagRow}>
                  {selectedEvent.tags.map((tag) => (
                    <View key={tag} style={styles.tagPill}><Text style={styles.tagPillText}>#{tag}</Text></View>
                  ))}
                </View>
              ) : null}

              {message ? (
                <View style={styles.modalNoticeBox}>
                  <Text style={styles.modalNoticeText}>{message}</Text>
                </View>
              ) : null}

              {/* Attendee Participation Status Banner */}
              {selectedEvent.viewerRsvpState === "going" ? (
                <View style={styles.modalRsvpStateBoxGoing}>
                  <View style={styles.modalRsvpStatusHeader}>
                    <Check size={18} color={brand.primaryStrong} />
                    <Text style={styles.modalRsvpStateTitleGoing}>{"You're Going!"}</Text>
                  </View>
                  <Text style={styles.modalRsvpStateSubtitle}>
                    Your place is confirmed for this gathering.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel registration for ${selectedEvent.title}`}
                    accessibilityState={{ disabled: pendingEventId === selectedEvent.id }}
                    disabled={pendingEventId === selectedEvent.id}
                    onPress={() => confirmCancelRsvp(selectedEvent)}
                    style={({ pressed }) => [
                      styles.modalCancelButton,
                      pressed && { opacity: 0.8 },
                      pendingEventId === selectedEvent.id && { opacity: 0.65 },
                    ]}
                  >
                    <Text style={styles.modalCancelButtonText}>
                      {pendingEventId === selectedEvent.id && actionState === "cancelling" ? "Cancelling…" : "Cancel RSVP"}
                    </Text>
                  </Pressable>
                </View>
              ) : selectedEvent.viewerRsvpState === "waitlist" ? (
                <View style={styles.modalRsvpStateBoxWaitlist}>
                  <View style={styles.modalRsvpStatusHeader}>
                    <Clock size={18} color={brand.accentStrong} />
                    <Text style={styles.modalRsvpStateTitleWaitlist}>You are on the waitlist</Text>
                  </View>
                  <Text style={styles.modalRsvpStateSubtitle}>
                    If a spot opens up, you will be automatically confirmed and notified.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Leave waitlist for ${selectedEvent.title}`}
                    accessibilityState={{ disabled: pendingEventId === selectedEvent.id }}
                    disabled={pendingEventId === selectedEvent.id}
                    onPress={() => confirmCancelRsvp(selectedEvent)}
                    style={({ pressed }) => [
                      styles.modalCancelButton,
                      pressed && { opacity: 0.8 },
                      pendingEventId === selectedEvent.id && { opacity: 0.65 },
                    ]}
                  >
                    <Text style={styles.modalCancelButtonText}>
                      {pendingEventId === selectedEvent.id && actionState === "cancelling" ? "Leaving waitlist…" : "Leave Waitlist"}
                    </Text>
                  </Pressable>
                </View>
              ) : selectedEvent.viewerRsvpState === "cancelled" ? (
                <View style={styles.modalRsvpStateBoxCancelled}>
                  <Text style={styles.modalRsvpStateTitleCancelled}>Registration Cancelled</Text>
                  <Text style={styles.modalRsvpStateSubtitle}>
                    You previously cancelled your registration. You can rejoin below if spots remain available.
                  </Text>
                </View>
              ) : null}

              {/* Action Button for non-going & non-waitlisted attendees */}
              {selectedEvent.viewerRsvpState !== "going" && selectedEvent.viewerRsvpState !== "waitlist" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={actionLabel(selectedEvent)}
                  accessibilityState={{
                    disabled: pendingEventId === selectedEvent.id || selectedEvent.status === "cancelled",
                  }}
                  disabled={pendingEventId === selectedEvent.id || selectedEvent.status === "cancelled"}
                  onPress={() => {
                    void handleRsvp(selectedEvent);
                  }}
                  style={({ pressed }) => [
                    styles.modalActionButton,
                    pressed && { opacity: 0.8 },
                    (pendingEventId === selectedEvent.id || selectedEvent.status === "cancelled") && { opacity: 0.65 },
                  ]}
                >
                  <Text style={styles.modalActionText}>{actionLabel(selectedEvent)}</Text>
                  <ArrowUpRight size={18} color="#FFF" />
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24, maxWidth: 680, width: "100%", alignSelf: "center" },
  header: { gap: 20, paddingTop: 12, paddingBottom: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 158, height: 36 },
  locale: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderColor: brand.border, borderWidth: 1 },
  localeText: { fontFamily: brand.fonts.bold, color: brand.muted, fontSize: 10 },
  intro: { gap: 7 },
  eyebrow: { fontFamily: brand.fonts.bold, fontSize: 9, letterSpacing: 1.5, color: brand.primaryStrong },
  heading: { fontFamily: brand.fonts.display, fontSize: 33, lineHeight: 37, letterSpacing: -0.8, color: brand.ink },
  subtitle: { fontFamily: brand.fonts.body, fontSize: 12, lineHeight: 20, color: brand.muted },
  search: { flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 6, borderWidth: 1, borderColor: brand.border, borderRadius: 13, backgroundColor: brand.surface, gap: 8 },
  searchInput: { flex: 1, fontFamily: brand.fonts.body, fontSize: 11, color: brand.ink, minHeight: 52, paddingVertical: 12 },
  searchButton: { minWidth: 32, minHeight: 44, justifyContent: "center", alignItems: "center" },
  submit: { width: 44, height: 40, borderRadius: 9, backgroundColor: brand.primaryStrong, alignItems: "center", justifyContent: "center" },
  editorial: { flexDirection: "row", minHeight: 145, borderRadius: 17, overflow: "hidden", backgroundColor: brand.mutedSurface },
  editorialCopy: { flex: 1, padding: 17, gap: 9, justifyContent: "center" },
  editorialTitle: { fontFamily: brand.fonts.display, fontSize: 21, lineHeight: 25, color: brand.ink },
  editorialBody: { fontFamily: brand.fonts.body, fontSize: 10, lineHeight: 16, color: brand.muted },
  editorialImage: { width: "44%", height: "100%", minHeight: 145 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  sectionTitle: { fontFamily: brand.fonts.display, fontSize: 22, color: brand.ink },
  count: { fontFamily: brand.fonts.medium, fontSize: 10, color: brand.muted },
  filters: { gap: 8 },
  chip: { paddingHorizontal: 15, minHeight: 44, justifyContent: "center", borderRadius: 22, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  chipActive: { backgroundColor: brand.primaryStrong, borderColor: brand.primaryStrong },
  chipText: { color: brand.muted, fontFamily: brand.fonts.medium, fontSize: 11 },
  chipTextActive: { color: "#FFF" },
  notice: { fontFamily: brand.fonts.medium, color: brand.primaryStrong, fontSize: 13, lineHeight: 20 },
  feedback: { backgroundColor: brand.mutedSurface, borderRadius: 18, alignItems: "center", padding: 24, gap: 12 },
  feedbackTitle: { fontFamily: brand.fonts.display, fontSize: 21, textAlign: "center", color: brand.ink },
  feedbackCopy: { fontFamily: brand.fonts.body, color: brand.muted, fontSize: 12, lineHeight: 20, textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 20, backgroundColor: brand.primaryStrong, borderRadius: 12 },
  retryText: { color: "#FFF", fontFamily: brand.fonts.bold, fontSize: 12 },
  endNote: { fontFamily: brand.fonts.body, fontSize: 11, textAlign: "center", color: brand.muted, marginVertical: 26 },
  recommendations: { gap: 14 },
  community: { borderLeftWidth: 2, borderLeftColor: brand.primary, paddingLeft: 12 },
  communityTitle: { fontFamily: brand.fonts.display, fontSize: 17, color: brand.ink },

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

  // Notice inside modal
  modalNoticeBox: { padding: 12, borderRadius: 10, backgroundColor: brand.primarySoft, borderWidth: 1, borderColor: brand.primary },
  modalNoticeText: { fontFamily: brand.fonts.medium, fontSize: 13, color: brand.primaryStrong, textAlign: "center" },

  // Participation boxes
  modalRsvpStateBoxGoing: { padding: 16, borderRadius: 14, backgroundColor: brand.primarySoft, gap: 8, borderWidth: 1, borderColor: "rgba(34,127,109,0.2)" },
  modalRsvpStateBoxWaitlist: { padding: 16, borderRadius: 14, backgroundColor: "rgba(201,110,78,0.08)", gap: 8, borderWidth: 1, borderColor: "rgba(201,110,78,0.2)" },
  modalRsvpStateBoxCancelled: { padding: 14, borderRadius: 12, backgroundColor: brand.mutedSurface, gap: 4 },
  modalRsvpStatusHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalRsvpStateTitleGoing: { fontFamily: brand.fonts.bold, fontSize: 16, color: brand.primaryStrong },
  modalRsvpStateTitleWaitlist: { fontFamily: brand.fonts.bold, fontSize: 16, color: brand.accentStrong },
  modalRsvpStateTitleCancelled: { fontFamily: brand.fonts.bold, fontSize: 14, color: brand.muted },
  modalRsvpStateSubtitle: { fontFamily: brand.fonts.body, fontSize: 13, color: brand.muted, lineHeight: 18 },
  modalCancelButton: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: brand.danger, alignItems: "center", justifyContent: "center", marginTop: 6, backgroundColor: brand.surface },
  modalCancelButtonText: { fontFamily: brand.fonts.bold, fontSize: 14, color: brand.danger },

  // Primary action button
  modalActionButton: { minHeight: 52, borderRadius: 14, backgroundColor: brand.primaryStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  modalActionText: { fontFamily: brand.fonts.bold, fontSize: 16, color: "#FFF" },
});
