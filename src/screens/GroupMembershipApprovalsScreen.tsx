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
import type { GroupMemberItem, GroupSummary } from "../api/types";
import {
  Button,
  EmptyState,
  InlineNotice,
  Pill,
  ScreenIntro,
  Surface,
} from "../components/ui";
import { theme } from "../theme";
import { formatDateTime } from "../utils/format";

export function GroupMembershipApprovalsScreen(props: {
  groups: GroupSummary[];
  locale: string;
  onBack: () => void;
}) {
  const manageableGroups = props.groups.filter(
    (g) =>
      g.viewerMembershipRole === "organizer" ||
      g.viewerMembershipRole === "co-organizer"
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    manageableGroups[0]?.id || props.groups[0]?.id || ""
  );
  const [pendingMembers, setPendingMembers] = useState<GroupMemberItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgressUserId, setActionInProgressUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadRequests = useCallback(async (isRefresh = false) => {
    if (!selectedGroupId) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.getGroupMembers(selectedGroupId, "pending");
      setPendingMembers(response.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function handleAction(targetUserId: string, action: "approve" | "reject") {
    setActionInProgressUserId(targetUserId);
    setError(null);
    setStatusMessage(null);

    try {
      await apiClient.updateGroupMemberStatus(selectedGroupId, targetUserId, action);
      setPendingMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      setStatusMessage(
        action === "approve"
          ? `Approved membership for ${targetUserId}`
          : `Rejected membership request for ${targetUserId}`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionInProgressUserId(null);
    }
  }

  const selectedGroup = props.groups.find((g) => g.id === selectedGroupId);

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button compact label="Back" onPress={props.onBack} variant="ghost" />
        <Text numberOfLines={1} style={styles.headerTitle}>
          Community Approvals
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <ScreenIntro
              eyebrow="Membership Gate"
              subtitle="Review and authorize pending membership requests for your moderated communities."
              title="Pending Requests"
            />

            {/* Community selector tabs */}
            {manageableGroups.length > 1 ? (
              <View style={styles.groupTabs}>
                {manageableGroups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setSelectedGroupId(g.id)}
                    style={[
                      styles.groupTab,
                      selectedGroupId === g.id && styles.groupTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.groupTabText,
                        selectedGroupId === g.id && styles.groupTabTextActive,
                      ]}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {selectedGroup ? (
              <Surface style={styles.groupInfoCard}>
                <View style={styles.groupInfoHeader}>
                  <Text style={styles.groupName}>{selectedGroup.name}</Text>
                  <Pill
                    label={selectedGroup.requiresApproval ? "Approval Required" : "Open Join"}
                    tone={selectedGroup.requiresApproval ? "accent" : "success"}
                  />
                </View>
                <Text style={styles.groupMeta}>
                  {selectedGroup.memberCount} members · {pendingMembers.length} pending requests
                </Text>
              </Surface>
            ) : null}

            {statusMessage ? (
              <InlineNotice message={statusMessage} tone="success" title="Action Completed" />
            ) : null}

            {error ? <InlineNotice message={error} tone="warning" title="Request Failed" /> : null}
          </View>
        }
        contentContainerStyle={styles.listContent}
        data={pendingMembers}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadRequests(true)} />
        }
        renderItem={({ item }) => {
          const isMutating = actionInProgressUserId === item.userId;

          return (
            <Surface style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.applicantName}>User ID: {item.userId}</Text>
                  <Text style={styles.requestDate}>
                    Requested {formatDateTime(item.joinedAt, props.locale)}
                  </Text>
                </View>
                <Pill label="PENDING" tone="accent" />
              </View>

              <View style={styles.buttonRow}>
                <Button
                  compact
                  disabled={isMutating}
                  label={isMutating ? "Processing..." : "Approve"}
                  onPress={() => void handleAction(item.userId, "approve")}
                  style={styles.flexButton}
                  variant="primary"
                />
                <Button
                  compact
                  disabled={isMutating}
                  label={isMutating ? "Processing..." : "Reject"}
                  onPress={() => void handleAction(item.userId, "reject")}
                  style={styles.flexButton}
                  variant="secondary"
                />
              </View>
            </Surface>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message="There are no pending membership requests waiting for review in this community."
              title="All Caught Up"
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
  groupTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  groupTab: {
    backgroundColor: theme.colors.cardAlt,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  groupTabActive: {
    backgroundColor: theme.colors.teal,
    borderColor: theme.colors.teal,
  },
  groupTabText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  groupTabTextActive: {
    color: "#FFFFFF",
  },
  groupInfoCard: {
    backgroundColor: theme.colors.card,
    gap: 6,
    padding: 14,
  },
  groupInfoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  groupName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  groupMeta: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  requestCard: {
    backgroundColor: theme.colors.card,
    gap: 12,
    padding: 14,
  },
  requestHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  applicantName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  requestDate: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  flexButton: {
    flex: 1,
  },
});
