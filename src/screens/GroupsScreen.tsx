import React, { useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiClient, getErrorMessage } from "../api/client";
import type { DiscussionPost, GroupSummary } from "../api/types";
import {
  Button,
  EmptyState,
  Field,
  InlineNotice,
  Pill,
  ScreenIntro,
  SectionHeader,
  Surface,
} from "../components/ui";
import { theme } from "../theme";
import { formatDateTime } from "../utils/format";

export function GroupsScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  onRequestSignIn: () => void;
  targetGroupId?: string | null;
  onClearTargetGroupId?: () => void;
}) {
  const { targetGroupId, onClearTargetGroupId } = props;
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetGroupId) return;
    let cancelled = false;

    async function loadTargetGroup(id: string) {
      setSelectedGroupId(id);
      try {
        const existing = groups.find((g) => g.id === id);
        if (!existing) {
          const res = await apiClient.getGroup(id, props.locale);
          if (!cancelled && res.group) {
            setGroups((prev) => {
              if (prev.some((g) => g.id === res.group.id)) {
                return prev.map((g) => (g.id === res.group.id ? res.group : g));
              }
              return [res.group, ...prev];
            });
            setSelectedGroupId(res.group.id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          onClearTargetGroupId?.();
        }
      }
    }

    void loadTargetGroup(targetGroupId);
    return () => {
      cancelled = true;
    };
  }, [targetGroupId, props.locale, onClearTargetGroupId, groups]);
  const [discussions, setDiscussions] = useState<DiscussionPost[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionForbidden, setDiscussionForbidden] = useState(false);
  const [posting, setPosting] = useState(false);
  const [mutatingGroupId, setMutatingGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;

  // Membership state distinctions
  const isAnonymous = !props.authenticated;
  const membershipStatus = selectedGroup?.viewerMembershipStatus ?? null;
  const membershipRole = selectedGroup?.viewerMembershipRole ?? null;
  const isActiveMember = props.authenticated && membershipStatus === "active";
  const isPendingMember = props.authenticated && membershipStatus === "pending";
  const isOrganizerOrCoOrganizer =
    props.authenticated &&
    (membershipRole === "organizer" || membershipRole === "co-organizer");
  const canOpenSelectedDiscussion = isActiveMember;

  async function loadGroups(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
      setNextCursor(null);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await apiClient.getGroups({
        locale: props.locale,
        limit: 10,
      });

      setGroups((prev) => {
        const selected = prev.find((g) => g.id === selectedGroupId);
        if (selected && !response.groups.some((g) => g.id === selected.id)) {
          return [selected, ...response.groups];
        }
        return response.groups;
      });
      setNextCursor(response.page?.nextCursor ?? null);
      setHasNextPage(Boolean(response.page?.hasNextPage && response.page?.nextCursor));

      setSelectedGroupId((currentValue) => {
        if (currentValue) {
          return currentValue;
        }

        return (
          response.groups.find((group) => group.viewerMembershipStatus === "active")?.id ??
          response.groups[0]?.id ??
          null
        );
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadMoreGroups() {
    if (!hasNextPage || !nextCursor || loadingMore || loading) {
      return;
    }

    setLoadingMore(true);

    try {
      const response = await apiClient.getGroups({
        locale: props.locale,
        cursor: nextCursor,
        limit: 10,
      });

      setGroups((current) => {
        const existingIds = new Set(current.map((g) => g.id));
        const newGroups = response.groups.filter((g) => !existingIds.has(g.id));
        return [...current, ...newGroups];
      });

      setNextCursor(response.page?.nextCursor ?? null);
      setHasNextPage(Boolean(response.page?.hasNextPage && response.page?.nextCursor));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadDiscussions(group: GroupSummary) {
    setDiscussionForbidden(false);

    if (!props.authenticated) {
      setDiscussions([]);
      setNotice("Sign in to read and post in community discussions.");
      return;
    }

    if (group.viewerMembershipStatus === "pending") {
      setDiscussions([]);
      setNotice("Your membership request is pending approval by group organizers.");
      return;
    }

    if (group.viewerMembershipStatus !== "active") {
      setDiscussions([]);
      setNotice("This circle is visible to the community, but discussions are reserved for active members.");
      return;
    }

    setDiscussionLoading(true);
    setError(null);

    try {
      const response = await apiClient.getDiscussions(group.id, props.locale);
      setDiscussions(response.discussions);
      setNotice(
        response.discussions.length === 0
          ? "No one has posted yet. Start the conversation."
          : null,
      );
    } catch (loadError: any) {
      if (loadError?.status === 403 || loadError?.code === "forbidden") {
        setDiscussionForbidden(true);
        setDiscussions([]);
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setDiscussionLoading(false);
    }
  }

  useEffect(() => {
    if (!props.isFocused) {
      return;
    }

    void loadGroups();
  }, [props.authenticated, props.isFocused, props.locale]);

  useEffect(() => {
    if (!props.isFocused || !selectedGroup) {
      return;
    }

    void loadDiscussions(selectedGroup);
  }, [props.authenticated, props.isFocused, props.locale, selectedGroupId, groups]);

  async function handleJoin(group: GroupSummary) {
    if (!props.authenticated) {
      props.onRequestSignIn();
      return;
    }

    if (mutatingGroupId) {
      return;
    }

    setMutatingGroupId(group.id);
    setError(null);
    setNotice(null);

    try {
      const res = await apiClient.joinGroup(group.id);
      const updated = res.group;

      setGroups((current) =>
        current.map((g) => (g.id === updated.id ? updated : g))
      );

      if (updated.viewerMembershipStatus === "active") {
        setNotice("You joined " + updated.name + "! Member discussions are now unlocked.");
        if (selectedGroupId === updated.id) {
          void loadDiscussions(updated);
        }
      } else if (updated.viewerMembershipStatus === "pending") {
        setNotice("Your request to join " + updated.name + " is pending organizer approval.");
        if (selectedGroupId === updated.id) {
          setDiscussions([]);
        }
      }
    } catch (joinErr) {
      setError(getErrorMessage(joinErr));
    } finally {
      setMutatingGroupId(null);
    }
  }

  async function executeLeave(group: GroupSummary) {
    if (!props.authenticated || mutatingGroupId) {
      return;
    }

    if (
      group.viewerMembershipRole === "organizer" ||
      group.viewerMembershipRole === "co-organizer"
    ) {
      setError("Group organizers and co-organizers cannot leave without transferring ownership in Admin.");
      return;
    }

    setMutatingGroupId(group.id);
    setError(null);
    setNotice(null);

    try {
      const res = await apiClient.leaveGroup(group.id);
      const updated = res.group;

      setGroups((current) =>
        current.map((g) => (g.id === updated.id ? updated : g))
      );

      if (selectedGroupId === updated.id) {
        setDiscussions([]);
      }

      setNotice(
        group.viewerMembershipStatus === "pending"
          ? "Membership request cancelled."
          : "You have left " + group.name + "."
      );
    } catch (leaveErr) {
      setError(getErrorMessage(leaveErr));
    } finally {
      setMutatingGroupId(null);
    }
  }

  function confirmLeave(group: GroupSummary) {
    const isPending = group.viewerMembershipStatus === "pending";
    const title = isPending ? "Cancel Membership Request?" : "Leave " + group.name + "?";
    const message = isPending
      ? "Are you sure you want to withdraw your join request?"
      : "You will lose access to member discussions and community updates.";

    Alert.alert(
      title,
      message,
      [
        { text: "Keep membership", style: "cancel" },
        {
          text: isPending ? "Cancel request" : "Leave circle",
          style: "destructive",
          onPress: () => {
            void executeLeave(group);
          },
        },
      ],
      { cancelable: true }
    );
  }

  async function handlePostDiscussion() {
    if (!selectedGroup) {
      return;
    }

    if (!props.authenticated) {
      props.onRequestSignIn();
      setError("Sign in from Profile to participate in group discussions.");
      return;
    }

    if (selectedGroup.viewerMembershipStatus === "pending") {
      setError("Your membership is pending approval before you can participate.");
      return;
    }

    if (selectedGroup.viewerMembershipStatus !== "active") {
      setError("You must be an active member to post in this discussion.");
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const response = await apiClient.createDiscussion(selectedGroup.id, draftMessage.trim());
      setDiscussions((currentDiscussions) => [response.post, ...currentDiscussions]);
      setDraftMessage("");
      setNotice("Your discussion post is live.");
    } catch (postError) {
      setError(getErrorMessage(postError));
    } finally {
      setPosting(false);
    }
  }

  function getMembershipBadge(group: GroupSummary) {
    if (!props.authenticated) {
      return { label: "Preview", tone: "default" as const };
    }
    if (group.viewerMembershipRole === "organizer") {
      return { label: "Organizer", tone: "accent" as const };
    }
    if (group.viewerMembershipRole === "co-organizer") {
      return { label: "Co-organizer", tone: "accent" as const };
    }
    if (group.viewerMembershipRole === "moderator") {
      return { label: "Moderator", tone: "accent" as const };
    }
    if (group.viewerMembershipStatus === "active") {
      return { label: "Active member", tone: "success" as const };
    }
    if (group.viewerMembershipStatus === "pending") {
      return { label: "Pending approval", tone: "warning" as const };
    }
    return { label: "Non-member", tone: "default" as const };
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void loadGroups(true);
          }}
          refreshing={refreshing}
          tintColor={theme.colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <ScreenIntro
        eyebrow="Groups"
        subtitle="Browse community circles, inspect membership status, and participate in authentic member discussions."
        title="Keep each circle feeling alive."
      />

      {error ? <InlineNotice message={error} tone="warning" title="Could not load everything" /> : null}
      {notice ? <InlineNotice message={notice} tone="accent" /> : null}

      <SectionHeader
        subtitle={loading ? "Refreshing group summaries." : "Group cards come from /api/v1/groups."}
        title="Community circles"
      />

      {!loading && groups.length === 0 ? (
        <EmptyState
          message="Check the API connection from Profile if the list stays empty."
          title="No groups available yet"
        />
      ) : null}

      {groups.map((group) => {
        const isSelected = group.id === selectedGroupId;
        const badge = getMembershipBadge(group);
        const isMutating = mutatingGroupId === group.id;
        const isGroupActive = props.authenticated && group.viewerMembershipStatus === "active";
        const isGroupPending = props.authenticated && group.viewerMembershipStatus === "pending";
        const isGroupOrganizer =
          props.authenticated &&
          (group.viewerMembershipRole === "organizer" || group.viewerMembershipRole === "co-organizer");

        return (
          <Surface
            key={group.id}
            style={[styles.groupCard, isSelected ? styles.groupCardSelected : undefined]}
          >
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              <View style={styles.badges}>
                <Pill label={group.category} tone="accent" />
                <Pill label={badge.label} tone={badge.tone} />
              </View>
            </View>
            <Text style={styles.groupDescription}>{group.description}</Text>
            <Text style={styles.groupMeta}>
              {group.memberCount} active {group.memberCount === 1 ? "member" : "members"} · {group.discussionCount} {group.discussionCount === 1 ? "post" : "posts"}
              {group.requiresApproval ? " · Approval required" : ""}
            </Text>
            <View style={styles.badges}>
              {group.tags.slice(0, 4).map((tag) => (
                <Pill key={tag} label={tag} />
              ))}
            </View>

            <View style={styles.groupActionsRow}>
              <Button
                accessibilityLabel={"View circle " + group.name}
                accessibilityRole="button"
                label={isSelected ? "Viewing circle" : "Open circle"}
                onPress={() => {
                  setSelectedGroupId(group.id);
                  setNotice(null);
                }}
                style={styles.actionButtonFlex}
                variant={isSelected ? "secondary" : "ghost"}
              />

              {!props.authenticated ? (
                <Button
                  accessibilityLabel="Sign in to join group"
                  accessibilityRole="button"
                  label="Sign in to join"
                  onPress={props.onRequestSignIn}
                  style={styles.actionButtonFlex}
                  variant="primary"
                />
              ) : isGroupActive ? (
                isGroupOrganizer ? (
                  <Button
                    accessibilityLabel="Organizer controls managed in admin"
                    accessibilityRole="button"
                    disabled
                    label="Organizer"
                    onPress={() => {}}
                    style={styles.actionButtonFlex}
                    variant="ghost"
                  />
                ) : (
                  <Button
                    accessibilityLabel={"Leave circle " + group.name}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isMutating }}
                    disabled={isMutating}
                    label={isMutating ? "Leaving..." : "Leave circle"}
                    onPress={() => confirmLeave(group)}
                    style={styles.actionButtonFlex}
                    variant="ghost"
                  />
                )
              ) : isGroupPending ? (
                <Button
                  accessibilityLabel={"Cancel request to join " + group.name}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isMutating }}
                  disabled={isMutating}
                  label={isMutating ? "Cancelling..." : "Cancel request"}
                  onPress={() => confirmLeave(group)}
                  style={styles.actionButtonFlex}
                  variant="ghost"
                />
              ) : (
                <Button
                  accessibilityLabel={group.requiresApproval ? "Request to join " + group.name : "Join circle " + group.name}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isMutating }}
                  disabled={isMutating}
                  label={
                    isMutating
                      ? "Submitting..."
                      : group.requiresApproval
                        ? "Request to join"
                        : "Join circle"
                  }
                  onPress={() => {
                    void handleJoin(group);
                  }}
                  style={styles.actionButtonFlex}
                  variant="primary"
                />
              )}
            </View>
          </Surface>
        );
      })}

      {hasNextPage ? (
        <Button
          disabled={loadingMore}
          label={loadingMore ? "Loading more circles..." : "Load more groups"}
          onPress={() => {
            void loadMoreGroups();
          }}
          variant="ghost"
        />
      ) : null}

      {selectedGroup ? (
        <Surface style={styles.discussionCard}>
          <SectionHeader
            subtitle={"Selected group: " + selectedGroup.name}
            title="Discussion lounge"
          />
          {isOrganizerOrCoOrganizer ? (
            <InlineNotice
              message="You are an organizer of this circle. Circle administration is available in the web portal."
              tone="accent"
              title="Organizer access"
            />
          ) : null}
          {!canOpenSelectedDiscussion ? (
            <View style={styles.lockedDiscussionBox}>
              <InlineNotice
                message={
                  isAnonymous
                    ? "Sign in to join this circle and access discussions."
                    : isPendingMember
                      ? "Your membership is awaiting organizer approval. Discussions will unlock once approved."
                      : selectedGroup.requiresApproval
                        ? "This circle requires organizer approval to join. Membership is needed to access discussions."
                        : "You are currently a non-member. Join this group to access discussions."
                }
                tone={isPendingMember ? "accent" : "warning"}
                title={
                  isAnonymous
                    ? "Discussion locked"
                    : isPendingMember
                      ? "Membership pending"
                      : discussionForbidden
                        ? "Forbidden: Members only"
                        : "Members-only discussion"
                }
              />
              <View style={styles.lockedActionRow}>
                {isAnonymous ? (
                  <Button
                    accessibilityLabel="Sign in from discussion lounge"
                    accessibilityRole="button"
                    label="Sign in to participate"
                    onPress={props.onRequestSignIn}
                    variant="primary"
                  />
                ) : isPendingMember ? (
                  <Button
                    accessibilityLabel="Cancel pending membership request"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: Boolean(mutatingGroupId) }}
                    disabled={Boolean(mutatingGroupId)}
                    label={mutatingGroupId === selectedGroup.id ? "Cancelling..." : "Cancel join request"}
                    onPress={() => confirmLeave(selectedGroup)}
                    variant="ghost"
                  />
                ) : (
                  <Button
                    accessibilityLabel={selectedGroup.requiresApproval ? "Request to join circle" : "Join circle to participate"}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: Boolean(mutatingGroupId) }}
                    disabled={Boolean(mutatingGroupId)}
                    label={
                      mutatingGroupId === selectedGroup.id
                        ? "Submitting..."
                        : selectedGroup.requiresApproval
                          ? "Request to join circle"
                          : "Join circle to participate"
                    }
                    onPress={() => {
                      void handleJoin(selectedGroup);
                    }}
                    variant="primary"
                  />
                )}
              </View>
            </View>
          ) : null}
          {discussionLoading ? (
            <Text style={styles.loadingText}>Loading posts...</Text>
          ) : null}
          {canOpenSelectedDiscussion && discussions.length === 0 && !discussionLoading && !discussionForbidden ? (
            <EmptyState
              message="Be the first person to leave a useful note for the group."
              title="No posts yet"
            />
          ) : null}
          {canOpenSelectedDiscussion
            ? discussions.map((post) => (
                <View key={post.id} style={styles.post}>
                  <View style={styles.postHeader}>
                    <Text style={styles.postAuthor}>{post.authorName}</Text>
                    {post.pinned ? <Pill label="Pinned" tone="accent" /> : null}
                  </View>
                  <Text style={styles.postBody}>{post.body}</Text>
                  <Text style={styles.postMeta}>{formatDateTime(post.createdAt, props.locale)}</Text>
                </View>
              ))
            : null}
          <Field
            editable={canOpenSelectedDiscussion && !posting}
            label="Post to the group"
            multiline
            onChangeText={setDraftMessage}
            placeholder={
              canOpenSelectedDiscussion
                ? "Share an update, question, or coordination note"
                : isAnonymous
                  ? "Sign in to participate in group discussions"
                  : isPendingMember
                    ? "Posting locked pending membership approval"
                    : "Posting reserved for group members"
            }
            style={styles.multilineInput}
            textAlignVertical="top"
            value={draftMessage}
          />
          <View style={styles.row}>
            <Button
              disabled={!draftMessage.trim() || !canOpenSelectedDiscussion || posting}
              label={posting ? "Posting..." : "Post message"}
              onPress={() => {
                void handlePostDiscussion();
              }}
              style={styles.flexButton}
            />
            {isAnonymous ? (
              <Button
                label="Sign in"
                onPress={props.onRequestSignIn}
                style={styles.flexButton}
                variant="ghost"
              />
            ) : null}
          </View>
        </Surface>
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
  groupCard: {
    gap: 12,
  },
  groupCardSelected: {
    borderColor: theme.colors.accent,
  },
  groupHeader: {
    gap: 10,
  },
  groupTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
  },
  groupDescription: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  groupMeta: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  badges: {
    columnGap: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  groupActionsRow: {
    columnGap: 10,
    flexDirection: "row",
    marginTop: 4,
  },
  actionButtonFlex: {
    flex: 1,
  },
  discussionCard: {
    gap: 14,
  },
  lockedDiscussionBox: {
    gap: 10,
  },
  lockedActionRow: {
    flexDirection: "row",
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
  post: {
    backgroundColor: theme.colors.cardAlt,
    borderRadius: theme.radius.sm,
    gap: 8,
    padding: 14,
  },
  postHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  postAuthor: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  postBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  postMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  multilineInput: {
    minHeight: 110,
  },
  row: {
    columnGap: 12,
    flexDirection: "row",
  },
  flexButton: {
    flex: 1,
  },
});
