import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiClient, getErrorMessage } from '../api/client';
import type { DiscussionPost, GroupSummary } from '../api/types';
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
import { capitalizeLabel, formatDateTime } from '../utils/format';

export function GroupsScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  onRequestSignIn: () => void;
}) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [discussions, setDiscussions] = useState<DiscussionPost[]>([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;
  const canOpenSelectedDiscussion = Boolean(
    props.authenticated && selectedGroup?.viewerMembershipStatus === 'active',
  );

  async function loadGroups(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await apiClient.getGroups(props.locale);
      setGroups(response.groups);
      setSelectedGroupId((currentValue) => {
        if (currentValue && response.groups.some((group) => group.id === currentValue)) {
          return currentValue;
        }

        return (
          response.groups.find((group) => group.viewerMembershipStatus === 'active')?.id ??
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

  async function loadDiscussions(group: GroupSummary) {
    if (!props.authenticated) {
      setDiscussions([]);
      setNotice('Sign in to read and post in community discussions.');
      return;
    }

    if (group.viewerMembershipStatus !== 'active') {
      setDiscussions([]);
      setNotice('This preview is public, but discussions are reserved for active members.');
      return;
    }

    setDiscussionLoading(true);
    setError(null);

    try {
      const response = await apiClient.getDiscussions(group.id, props.locale);
      setDiscussions(response.discussions);
      setNotice(
        response.discussions.length === 0
          ? 'No one has posted yet. Start the conversation.'
          : null,
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
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

  async function handlePostDiscussion() {
    if (!selectedGroup) {
      return;
    }

    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to participate in group discussions.');
      return;
    }

    if (selectedGroup.viewerMembershipStatus !== 'active') {
      setError('Only active members can add a discussion post.');
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const response = await apiClient.createDiscussion(selectedGroup.id, draftMessage.trim());
      setDiscussions((currentDiscussions) => [response.post, ...currentDiscussions]);
      setDraftMessage('');
      setNotice('Your discussion post is live.');
    } catch (postError) {
      setError(getErrorMessage(postError));
    } finally {
      setPosting(false);
    }
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
        subtitle="Browse community circles, inspect membership status, and load real discussion threads from the backend."
        title="Keep each circle feeling alive."
      />

      {error ? <InlineNotice message={error} tone="warning" title="Could not load everything" /> : null}
      {notice ? <InlineNotice message={notice} tone="accent" /> : null}

      <SectionHeader
        subtitle={loading ? 'Refreshing group summaries.' : 'Group cards come from /api/groups.'}
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

        return (
          <Surface
            key={group.id}
            style={[styles.groupCard, isSelected ? styles.groupCardSelected : undefined]}
          >
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              <View style={styles.badges}>
                <Pill label={group.category} tone="accent" />
                <Pill
                  label={group.viewerMembershipStatus ? capitalizeLabel(group.viewerMembershipStatus) : 'Preview'}
                  tone={group.viewerMembershipStatus === 'active' ? 'success' : 'default'}
                />
              </View>
            </View>
            <Text style={styles.groupDescription}>{group.description}</Text>
            <Text style={styles.groupMeta}>
              {group.memberCount} members · {group.discussionCount} posts
              {group.requiresApproval ? ' · Approval required' : ''}
            </Text>
            <View style={styles.badges}>
              {group.tags.slice(0, 4).map((tag) => (
                <Pill key={tag} label={tag} />
              ))}
            </View>
            <Button
              label={isSelected ? 'Viewing discussion' : 'Open group'}
              onPress={() => {
                setSelectedGroupId(group.id);
                setNotice(null);
              }}
              variant={isSelected ? 'secondary' : 'ghost'}
            />
          </Surface>
        );
      })}

      {selectedGroup ? (
        <Surface style={styles.discussionCard}>
          <SectionHeader
            subtitle={`Selected group: ${selectedGroup.name}`}
            title="Discussion lounge"
          />
          {!canOpenSelectedDiscussion ? (
            <InlineNotice
              message={
                props.authenticated
                  ? 'Join or get approved in this group to read the discussion thread.'
                  : 'Sign in to open the live discussion feed.'
              }
              tone="warning"
              title="Discussion locked"
            />
          ) : null}
          {discussionLoading ? (
            <Text style={styles.loadingText}>Loading posts...</Text>
          ) : null}
          {canOpenSelectedDiscussion && discussions.length === 0 && !discussionLoading ? (
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
            placeholder="Share an update, question, or coordination note"
            style={styles.multilineInput}
            textAlignVertical="top"
            value={draftMessage}
          />
          <View style={styles.row}>
            <Button
              disabled={!draftMessage.trim() || !canOpenSelectedDiscussion || posting}
              label={posting ? 'Posting...' : 'Post message'}
              onPress={() => {
                void handlePostDiscussion();
              }}
              style={styles.flexButton}
            />
            {!props.authenticated ? (
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
    fontWeight: '800',
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
    fontWeight: '600',
  },
  badges: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  discussionCard: {
    gap: 14,
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  post: {
    backgroundColor: theme.colors.cardAlt,
    borderRadius: theme.radius.sm,
    gap: 8,
    padding: 14,
  },
  postHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  postAuthor: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  postBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  postMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  multilineInput: {
    minHeight: 110,
  },
  row: {
    columnGap: 12,
    flexDirection: 'row',
  },
  flexButton: {
    flex: 1,
  },
});
