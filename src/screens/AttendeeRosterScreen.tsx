import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { apiClient, getErrorMessage } from "../api/client";
import type { AttendeeItem } from "../api/types";
import {
  Button,
  EmptyState,
  Field,
  InlineNotice,
  Pill,
  ScreenIntro,
  Surface,
} from "../components/ui";
import { theme } from "../theme";
import { formatDateTime } from "../utils/format";

type FilterTab = "all" | "going" | "checked_in" | "not_checked_in" | "waitlist" | "cancelled";

export function AttendeeRosterScreen(props: {
  eventId: string;
  eventTitle: string;
  locale: string;
  onBack: () => void;
  onOpenScanner?: () => void;
}) {
  const [attendees, setAttendees] = useState<AttendeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<FilterTab>("all");
  const [actionInProgressUserId, setActionInProgressUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadAttendees = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.getOrganizerEventRoster(props.eventId);
      setAttendees(response.attendees || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [props.eventId]);

  useEffect(() => {
    void loadAttendees();
  }, [loadAttendees]);

  async function handleToggleAttendance(attendee: AttendeeItem) {
    const nextCheckedInState = !attendee.checkedIn;

    setActionInProgressUserId(attendee.userId);
    setError(null);
    setStatusMessage(null);

    try {
      await apiClient.markAttendance(props.eventId, attendee.userId, nextCheckedInState);
      setAttendees((prev) =>
        prev.map((item) =>
          item.userId === attendee.userId
            ? {
                ...item,
                checkedIn: nextCheckedInState,
                checkedInAt: nextCheckedInState ? new Date().toISOString() : undefined,
              }
            : item
        )
      );
      setStatusMessage(
        nextCheckedInState
          ? `Checked in ${attendee.fullName}`
          : `Undid check-in for ${attendee.fullName}`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionInProgressUserId(null);
    }
  }

  const filteredAttendees = attendees.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.userId.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedTab === "all") return true;
    if (selectedTab === "going") return item.state === "going";
    if (selectedTab === "checked_in") return item.checkedIn;
    if (selectedTab === "not_checked_in") return item.state === "going" && !item.checkedIn;
    if (selectedTab === "waitlist") return item.state === "waitlist";
    if (selectedTab === "cancelled") return item.state === "cancelled";
    return true;
  });

  const goingCount = attendees.filter((a) => a.state === "going").length;
  const checkedInCount = attendees.filter((a) => a.checkedIn).length;
  const waitlistCount = attendees.filter((a) => a.state === "waitlist").length;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button compact label="Back" onPress={props.onBack} variant="ghost" />
        <Text numberOfLines={1} style={styles.headerTitle}>
          {props.eventTitle}
        </Text>
        {props.onOpenScanner ? (
          <Button compact label="Scan QR" onPress={props.onOpenScanner} variant="secondary" />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <ScreenIntro
              eyebrow="Attendee Roster"
              subtitle="Search guests, monitor registration status, and perform manual entrance check-in."
              title="Verified Guest List"
            />

            <View style={styles.metricBar}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{attendees.length}</Text>
                <Text style={styles.metricLabel}>Total</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{goingCount}</Text>
                <Text style={styles.metricLabel}>Confirmed</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={[styles.metricValue, { color: theme.colors.success }]}>
                  {checkedInCount}
                </Text>
                <Text style={styles.metricLabel}>Checked In</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{waitlistCount}</Text>
                <Text style={styles.metricLabel}>Waitlist</Text>
              </View>
            </View>

            {statusMessage ? (
              <InlineNotice message={statusMessage} tone="success" title="Success" />
            ) : null}

            {error ? <InlineNotice message={error} tone="warning" title="Error" /> : null}

            <Field
              label="Search Attendees"
              onChangeText={setSearchQuery}
              placeholder="Search by name or ID..."
              value={searchQuery}
            />

            <View style={styles.tabsRow}>
              {(
                [
                  { key: "all", label: `All (${attendees.length})` },
                  { key: "going", label: `Going (${goingCount})` },
                  { key: "checked_in", label: `Checked In (${checkedInCount})` },
                  { key: "not_checked_in", label: "Not Checked In" },
                  { key: "waitlist", label: `Waitlist (${waitlistCount})` },
                  { key: "cancelled", label: "Cancelled" },
                ] as const
              ).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setSelectedTab(tab.key)}
                  style={[
                    styles.tabButton,
                    selectedTab === tab.key && styles.tabButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      selectedTab === tab.key && styles.tabButtonTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        contentContainerStyle={styles.listContent}
        data={filteredAttendees}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadAttendees(true)} />
        }
        renderItem={({ item }) => {
          const isMutating = actionInProgressUserId === item.userId;
          const isGoing = item.state === "going";

          return (
            <Surface style={styles.attendeeCard}>
              <View style={styles.attendeeHeader}>
                <View style={styles.attendeeNameCol}>
                  <Text style={styles.attendeeName}>{item.fullName}</Text>
                  <Text style={styles.attendeeUserId}>ID: {item.userId}</Text>
                </View>
                <View style={styles.pillRow}>
                  <Pill
                    label={item.state.toUpperCase()}
                    tone={
                      item.state === "going"
                        ? "success"
                        : item.state === "waitlist"
                        ? "accent"
                        : "default"
                    }
                  />
                  <Pill
                    label={item.checkedIn ? "Checked In" : "Not Checked In"}
                    tone={item.checkedIn ? "success" : "default"}
                  />
                </View>
              </View>

              {item.checkedInAt ? (
                <Text style={styles.checkedInTime}>
                  Checked in: {formatDateTime(item.checkedInAt, props.locale)}
                </Text>
              ) : null}

              {item.dietaryRequirements ? (
                <Text style={styles.dietaryText}>Diet: {item.dietaryRequirements}</Text>
              ) : null}

              {isGoing ? (
                <View style={styles.actionRow}>
                  <Button
                    compact
                    disabled={isMutating}
                    label={
                      isMutating
                        ? "Saving..."
                        : item.checkedIn
                        ? "Undo Check-In"
                        : "Manual Check-In"
                    }
                    onPress={() => void handleToggleAttendance(item)}
                    style={styles.actionButton}
                    variant={item.checkedIn ? "ghost" : "primary"}
                  />
                </View>
              ) : null}
            </Surface>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message={
                searchQuery
                  ? "No attendees match your search query."
                  : "No attendees found in this category."
              }
              title="No Attendees Found"
            />
          ) : (
            <ActivityIndicator color={theme.colors.teal} size="large" style={{ marginVertical: 32 }} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  headerBar: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  headerContent: {
    gap: 14,
    paddingBottom: 12,
  },
  listContent: {
    gap: 12,
    padding: 16,
    paddingBottom: 32,
  },
  metricBar: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
  },
  metricItem: {
    alignItems: "center",
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  metricLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  metricDivider: {
    backgroundColor: theme.colors.border,
    width: 1,
  },
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabButton: {
    backgroundColor: theme.colors.cardAlt,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabButtonActive: {
    backgroundColor: theme.colors.teal,
    borderColor: theme.colors.teal,
  },
  tabButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  attendeeCard: {
    backgroundColor: theme.colors.card,
    gap: 10,
    padding: 14,
  },
  attendeeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  attendeeNameCol: {
    flex: 1,
    marginRight: 8,
  },
  attendeeName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  attendeeUserId: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  pillRow: {
    alignItems: "flex-end",
    gap: 4,
  },
  checkedInTime: {
    color: theme.colors.success,
    fontSize: 12,
    fontWeight: "600",
  },
  dietaryText: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  actionButton: {
    minWidth: 120,
  },
});
