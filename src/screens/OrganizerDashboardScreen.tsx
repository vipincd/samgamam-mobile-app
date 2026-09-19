import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { apiClient, getErrorMessage } from "../api/client";
import type {
  AnalyticsOverview,
  EventAnalytics,
  EventSummary,
  GroupSummary,
} from "../api/types";
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
} from "../components/ui";
import { theme } from "../theme";
import { formatDateTime, formatPercent } from "../utils/format";
import { AttendeeRosterScreen } from "./AttendeeRosterScreen";
import { GroupMembershipApprovalsScreen } from "./GroupMembershipApprovalsScreen";
import { QrCheckInScreen } from "./QrCheckInScreen";

type SubScreen = "main" | "roster" | "scanner" | "approvals";
type EventFilter = "upcoming" | "ongoing" | "past" | "cancelled" | "all";

export function OrganizerDashboardScreen(props: {
  groups: GroupSummary[];
  locale: string;
  onBack: () => void;
  viewerName?: string | null;
}) {
  const [activeSubScreen, setActiveSubScreen] = useState<SubScreen>("main");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("upcoming");
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [eventAnalytics, setEventAnalytics] = useState<EventAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Announcement modal state
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementPinned] = useState(false);
  const [announcementSending, setAnnouncementSending] = useState(false);

  // Edit event modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Cancel event modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // Copilot in event context
  const [copilotModalOpen, setCopilotModalOpen] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotResult, setCopilotResult] = useState<string | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const loadOrganizerData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.getOrganizerEvents();
      setEvents(response.events || []);
      setOverview(response.overview || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizerData();
  }, [loadOrganizerData]);

  const loadEventDetailAnalytics = useCallback(async (eventId: string) => {
    setLoadingAnalytics(true);
    try {
      const analytics = await apiClient.getEventAnalytics(eventId);
      setEventAnalytics(analytics);
    } catch {
      setEventAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  function handleSelectEvent(event: EventSummary) {
    setSelectedEvent(event);
    setEventAnalytics(null);
    void loadEventDetailAnalytics(event.id);
  }

  function getEventTemporalState(event: EventSummary): "upcoming" | "ongoing" | "past" | "cancelled" {
    if (event.status === "cancelled") return "cancelled";
    const now = Date.now();
    const start = new Date(event.startsAt).getTime();
    const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 3 * 60 * 60 * 1000;
    if (now < start) return "upcoming";
    if (now >= start && now <= end) return "ongoing";
    return "past";
  }

  const filteredEvents = events.filter((event) => {
    const state = getEventTemporalState(event);
    if (eventFilter === "all") return true;
    return state === eventFilter;
  });

  async function handleSendAnnouncement() {
    if (!selectedEvent || !announcementText.trim()) return;

    setAnnouncementSending(true);
    setError(null);
    setStatusMessage(null);

    try {
      await apiClient.sendAnnouncement(selectedEvent.id, {
        body: announcementText.trim(),
        pinned: announcementPinned,
      });
      setAnnouncementModalOpen(false);
      setAnnouncementText("");
      setStatusMessage("Announcement published and sent to attendees.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAnnouncementSending(false);
    }
  }

  async function handleSaveEventEdit() {
    if (!selectedEvent || !editTitle.trim()) return;

    setEditSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const capNum = editCapacity.trim() ? Number(editCapacity.trim()) : undefined;
      const res = await apiClient.updateEvent(selectedEvent.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        location: editLocation.trim() || undefined,
        capacity: capNum,
      });
      setSelectedEvent(res.event);
      setEvents((prev) => prev.map((e) => (e.id === res.event.id ? res.event : e)));
      setEditModalOpen(false);
      setStatusMessage("Event updated successfully.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleConfirmCancellation() {
    if (!selectedEvent) return;

    setCancelSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await apiClient.cancelEvent(selectedEvent.id, {
        cancellationReason: cancelReason.trim() || undefined,
      });
      setSelectedEvent(res.event);
      setEvents((prev) => prev.map((e) => (e.id === res.event.id ? res.event : e)));
      setCancelModalOpen(false);
      setStatusMessage("Event has been cancelled. Affected attendees have been notified.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCancelSaving(false);
    }
  }

  async function handleAskEventCopilot() {
    if (!copilotPrompt.trim() || !selectedEvent) return;

    setCopilotLoading(true);
    setError(null);
    try {
      const res = await apiClient.askCopilotForEvent("suggest_description", copilotPrompt.trim(), {
        title: selectedEvent.title,
        description: selectedEvent.description,
        location: selectedEvent.location,
      });
      setCopilotResult(res.content);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCopilotLoading(false);
    }
  }

  // Routing to Sub-screens
  if (activeSubScreen === "roster" && selectedEvent) {
    return (
      <AttendeeRosterScreen
        eventId={selectedEvent.id}
        eventTitle={selectedEvent.title}
        locale={props.locale}
        onBack={() => setActiveSubScreen("main")}
        onOpenScanner={() => setActiveSubScreen("scanner")}
      />
    );
  }

  if (activeSubScreen === "scanner" && selectedEvent) {
    return (
      <QrCheckInScreen
        eventId={selectedEvent.id}
        eventTitle={selectedEvent.title}
        locale={props.locale}
        onBack={() => setActiveSubScreen("main")}
        onOpenRoster={() => setActiveSubScreen("roster")}
      />
    );
  }

  if (activeSubScreen === "approvals") {
    return (
      <GroupMembershipApprovalsScreen
        groups={props.groups}
        locale={props.locale}
        onBack={() => setActiveSubScreen("main")}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void loadOrganizerData(true)} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Button compact label="Back to Profile" onPress={props.onBack} variant="ghost" />
        <Button
          compact
          label="Community Approvals"
          onPress={() => setActiveSubScreen("approvals")}
          variant="secondary"
        />
      </View>

      <ScreenIntro
        eyebrow="Organizer Studio"
        subtitle="Manage your events, attendee rosters, on-site check-in, and community communications."
        title="Organizer Dashboard"
      />

      {/* Global Overview Metrics */}
      {overview ? (
        <Surface style={styles.metricsCard}>
          <SectionHeader
            subtitle="Overall impact across all of your published events"
            title="Performance Snapshot"
          />
          <View style={styles.metricGrid}>
            <MetricTile label="Events Published" value={String(overview.eventsPublished)} />
            <MetricTile label="Total RSVPs" value={String(overview.totalRsvps)} />
            <MetricTile label="Total Views" value={String(overview.totalViews)} />
            <MetricTile label="Avg Conversion" value={formatPercent(overview.averageConversionRate)} />
          </View>
        </Surface>
      ) : null}

      {statusMessage ? (
        <InlineNotice message={statusMessage} tone="success" title="Success" />
      ) : null}

      {error ? <InlineNotice message={error} tone="warning" title="Error" /> : null}

      {/* Event Filter Pills */}
      <View style={styles.filterRow}>
        {(
          [
            { key: "upcoming", label: "Upcoming" },
            { key: "ongoing", label: "Ongoing" },
            { key: "past", label: "Past" },
            { key: "cancelled", label: "Cancelled" },
            { key: "all", label: `All (${events.length})` },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setEventFilter(tab.key)}
            style={[
              styles.filterTab,
              eventFilter === tab.key && styles.filterTabActive,
            ]}
          >
            <Text
              style={[
                styles.filterTabText,
                eventFilter === tab.key && styles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Events List */}
      <Surface style={styles.eventsSection}>
        <SectionHeader
          subtitle="Select an event to open management controls, roster, and scanner."
          title="Your Managed Events"
        />

        {loading ? (
          <ActivityIndicator color={theme.colors.teal} size="large" style={{ marginVertical: 24 }} />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            message="No events found matching this filter."
            title="No Events Found"
          />
        ) : (
          filteredEvents.map((event) => {
            const temporalState = getEventTemporalState(event);
            const isSelected = selectedEvent?.id === event.id;

            return (
              <Surface
                key={event.id}
                style={[
                  styles.eventCard,
                  isSelected && styles.eventCardSelected,
                ]}
              >
                <View style={styles.eventCardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventMeta}>
                      {formatDateTime(event.startsAt, props.locale)} · {event.location}
                    </Text>
                  </View>
                  <Pill
                    label={temporalState.toUpperCase()}
                    tone={
                      temporalState === "upcoming" ? "success" : temporalState === "ongoing" ? "accent" : "default"
                    }
                  />
                </View>

                <View style={styles.badgeRow}>
                  <ChipLike
                    label={`RSVPs: ${event.goingCount ?? event.attendeeCount ?? 0}${
                      event.capacity ? ` / ${event.capacity}` : ""
                    }`}
                  />
                  {event.waitlistCount ? (
                    <ChipLike label={`Waitlist: ${event.waitlistCount}`} tone="accent" />
                  ) : null}
                  <ChipLike label={event.isPaid ? `${event.currency} ${(event.ticketPriceCents / 100).toFixed(2)}` : "Free"} />
                </View>

                {/* Event Actions */}
                <View style={styles.actionButtonRow}>
                  <Button
                    compact
                    label="Dashboard & Controls"
                    onPress={() => handleSelectEvent(event)}
                    style={styles.flexBtn}
                    variant={isSelected ? "primary" : "secondary"}
                  />
                  <Button
                    compact
                    label="Roster"
                    onPress={() => {
                      setSelectedEvent(event);
                      setActiveSubScreen("roster");
                    }}
                    style={styles.flexBtn}
                    variant="secondary"
                  />
                  <Button
                    compact
                    label="Scan"
                    onPress={() => {
                      setSelectedEvent(event);
                      setActiveSubScreen("scanner");
                    }}
                    style={styles.flexBtn}
                    variant="ghost"
                  />
                </View>

                {/* Selected Event Controls Drawer */}
                {isSelected ? (
                  <Surface style={styles.drawerCard}>
                    <SectionHeader
                      subtitle={`Management controls for ${event.title}`}
                      title="Event Controls"
                    />

                    {/* Live Scoped Analytics */}
                    {loadingAnalytics ? (
                      <ActivityIndicator color={theme.colors.teal} />
                    ) : eventAnalytics ? (
                      <View style={styles.eventMetrics}>
                        <MetricTile label="Views" value={String(eventAnalytics.views)} />
                        <MetricTile label="RSVPs" value={String(eventAnalytics.rsvps)} />
                        <MetricTile label="Checked In" value={String(eventAnalytics.checkedInCount ?? 0)} />
                        <MetricTile label="Conversion" value={formatPercent(eventAnalytics.conversionRate)} />
                      </View>
                    ) : null}

                    {/* Operational Management Buttons */}
                    <View style={styles.controlGrid}>
                      <Button
                        label="View Attendee Roster"
                        onPress={() => setActiveSubScreen("roster")}
                        variant="primary"
                      />
                      <Button
                        label="Open Ticket Scanner"
                        onPress={() => setActiveSubScreen("scanner")}
                        variant="secondary"
                      />
                      <Button
                        label="Broadcast Announcement"
                        onPress={() => {
                          setAnnouncementText("");
                          setAnnouncementModalOpen(true);
                        }}
                        variant="secondary"
                      />
                      <Button
                        label="Edit Event Details"
                        onPress={() => {
                          setEditTitle(event.title);
                          setEditDescription(event.description || "");
                          setEditLocation(event.location);
                          setEditCapacity(event.capacity ? String(event.capacity) : "");
                          setEditModalOpen(true);
                        }}
                        variant="secondary"
                      />
                      <Button
                        label="Draft with Event Copilot"
                        onPress={() => {
                          setCopilotPrompt("");
                          setCopilotResult(null);
                          setCopilotModalOpen(true);
                        }}
                        variant="secondary"
                      />
                      {event.status !== "cancelled" ? (
                        <Button
                          label="Cancel Event"
                          onPress={() => {
                            setCancelReason("");
                            setCancelModalOpen(true);
                          }}
                          variant="ghost"
                        />
                      ) : (
                        <InlineNotice
                          message={`This event was cancelled.${
                            event.cancellationReason ? ` Reason: ${event.cancellationReason}` : ""
                          }`}
                          tone="warning"
                        />
                      )}
                    </View>
                  </Surface>
                ) : null}
              </Surface>
            );
          })
        )}
      </Surface>

      {/* Announcement Modal */}
      <Modal visible={announcementModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            <SectionHeader
              subtitle="This announcement will be posted to the event discussion thread and dispatched as notifications to registered attendees."
              title="Broadcast Announcement"
            />
            <Field
              label="Announcement message"
              multiline
              onChangeText={setAnnouncementText}
              placeholder="Important update for attendees regarding venue or schedule..."
              style={styles.multilineInput}
              value={announcementText}
            />
            <View style={styles.modalActions}>
              <Button
                disabled={announcementSending}
                label="Cancel"
                onPress={() => setAnnouncementModalOpen(false)}
                variant="ghost"
              />
              <Button
                disabled={!announcementText.trim() || announcementSending}
                label={announcementSending ? "Broadcasting..." : "Confirm & Send"}
                onPress={() => void handleSendAnnouncement()}
                variant="primary"
              />
            </View>
          </Surface>
        </View>
      </Modal>

      {/* Edit Event Modal */}
      <Modal visible={editModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            <SectionHeader
              subtitle="Update core event metadata. If time or venue changes, affected attendees will be notified."
              title="Edit Event"
            />
            <Field label="Title" onChangeText={setEditTitle} value={editTitle} />
            <Field
              label="Description"
              multiline
              onChangeText={setEditDescription}
              style={styles.multilineInput}
              value={editDescription}
            />
            <Field label="Location / Venue" onChangeText={setEditLocation} value={editLocation} />
            <Field
              keyboardType="numeric"
              label="Capacity (leave empty for unlimited)"
              onChangeText={setEditCapacity}
              value={editCapacity}
            />
            <View style={styles.modalActions}>
              <Button
                disabled={editSaving}
                label="Cancel"
                onPress={() => setEditModalOpen(false)}
                variant="ghost"
              />
              <Button
                disabled={!editTitle.trim() || editSaving}
                label={editSaving ? "Saving..." : "Save Changes"}
                onPress={() => void handleSaveEventEdit()}
                variant="primary"
              />
            </View>
          </Surface>
        </View>
      </Modal>

      {/* Cancel Event Modal */}
      <Modal visible={cancelModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            <SectionHeader
              subtitle="Cancelling an event updates its status permanently, stops registrations, and sends cancellation notices to all confirmed and waitlisted attendees."
              title="Cancel Event"
            />
            <Field
              label="Cancellation reason (optional)"
              multiline
              onChangeText={setCancelReason}
              placeholder="e.g. Venue double-booked or severe weather..."
              style={styles.multilineInput}
              value={cancelReason}
            />
            <InlineNotice
              message="This action is irreversible. The event record will remain in the archive."
              tone="warning"
            />
            <View style={styles.modalActions}>
              <Button
                disabled={cancelSaving}
                label="Keep Event"
                onPress={() => setCancelModalOpen(false)}
                variant="ghost"
              />
              <Button
                disabled={cancelSaving}
                label={cancelSaving ? "Cancelling..." : "Confirm Cancellation"}
                onPress={() => void handleConfirmCancellation()}
                variant="primary"
              />
            </View>
          </Surface>
        </View>
      </Modal>

      {/* Event Copilot Modal */}
      <Modal visible={copilotModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            <SectionHeader
              subtitle={`Drafting copy for ${selectedEvent?.title}`}
              title="Event Copilot"
            />
            <Field
              label="What would you like to draft?"
              multiline
              onChangeText={setCopilotPrompt}
              placeholder="e.g. A friendly reminder to bring laptops and notebooks..."
              style={styles.multilineInput}
              value={copilotPrompt}
            />
            <Button
              disabled={!copilotPrompt.trim() || copilotLoading}
              label={copilotLoading ? "Generating..." : "Generate Draft"}
              onPress={() => void handleAskEventCopilot()}
            />
            {copilotResult ? (
              <Surface style={styles.copilotResultCard}>
                <Text style={styles.copilotResultLabel}>Generated Draft (Review Required)</Text>
                <Text style={styles.copilotResultText}>{copilotResult}</Text>
              </Surface>
            ) : null}
            <Button
              label="Close"
              onPress={() => setCopilotModalOpen(false)}
              variant="ghost"
            />
          </Surface>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ChipLike(props: { label: string; tone?: "default" | "accent" }) {
  return (
    <View
      style={[
        styles.chipLike,
        props.tone === "accent" && { backgroundColor: theme.colors.accent + "22", borderColor: theme.colors.accent },
      ]}
    >
      <Text style={[styles.chipLikeText, props.tone === "accent" && { color: theme.colors.accent }]}>
        {props.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 16,
    paddingBottom: 40,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricsCard: {
    backgroundColor: theme.colors.card,
    gap: 12,
    padding: 16,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterTab: {
    backgroundColor: theme.colors.cardAlt,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterTabActive: {
    backgroundColor: theme.colors.teal,
    borderColor: theme.colors.teal,
  },
  filterTabText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },
  eventsSection: {
    backgroundColor: theme.colors.card,
    gap: 14,
    padding: 16,
  },
  eventCard: {
    backgroundColor: theme.colors.cardAlt,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  eventCardSelected: {
    borderColor: theme.colors.teal,
    borderWidth: 2,
  },
  eventCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eventTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  eventMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chipLike: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipLikeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "600",
  },
  actionButtonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  flexBtn: {
    flex: 1,
  },
  drawerCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.teal,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    marginTop: 8,
    padding: 14,
  },
  eventMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  controlGrid: {
    gap: 10,
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    gap: 14,
    maxWidth: 500,
    padding: 20,
    width: "100%",
  },
  multilineInput: {
    minHeight: 100,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  copilotResultCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 6,
    padding: 12,
  },
  copilotResultLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  copilotResultText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});
