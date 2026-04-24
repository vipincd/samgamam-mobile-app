import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { apiClient, getErrorMessage } from '../api/client';
import type { CopilotAction, KnowledgeChunk, UserRole } from '../api/types';
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
import { capitalizeLabel, toShortName } from '../utils/format';

export function HelpScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  onRequestSignIn: () => void;
  roles: UserRole[];
  viewerName: string | null;
}) {
  const [helpQuery, setHelpQuery] = useState('');
  const [helpLoading, setHelpLoading] = useState(false);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotResult, setCopilotResult] = useState<string | null>(null);
  const [copilotMeta, setCopilotMeta] = useState<string | null>(null);
  const [copilotLoading, setCopilotLoading] = useState<null | CopilotAction>(null);
  const [error, setError] = useState<string | null>(null);

  const canUseCopilot = props.roles.includes('organizer') || props.roles.includes('admin');

  async function handleHelpSearch() {
    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to use the AI help assistant.');
      return;
    }

    setHelpLoading(true);
    setError(null);

    try {
      const response = await apiClient.searchHelp(helpQuery.trim());
      setChunks(response.chunks);
    } catch (searchError) {
      setError(getErrorMessage(searchError));
    } finally {
      setHelpLoading(false);
    }
  }

  async function handleCopilot(action: CopilotAction) {
    if (!canUseCopilot) {
      setError('Only verified organizers and admins can use the event drafting copilot.');
      return;
    }

    setCopilotLoading(action);
    setError(null);

    try {
      const response = await apiClient.askCopilot(action, copilotPrompt.trim());
      setCopilotResult(response.content);
      setCopilotMeta(
        `Audit log ${response.logId} | ${response.requiresHumanReview ? 'Human review required' : 'Ready to use'}`,
      );
    } catch (copilotError) {
      setError(getErrorMessage(copilotError));
    } finally {
      setCopilotLoading(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenIntro
        eyebrow="AI Help"
        subtitle={`Hi ${toShortName(props.viewerName)}. This tab now calls the real knowledge and copilot APIs instead of showing a dead placeholder.`}
        title="Get grounded answers before you organize."
      />

      {!props.authenticated ? (
        <InlineNotice
          message="The backend protects this feature behind sign-in and verified accounts. Use the Profile tab to unlock it."
          tone="warning"
          title="Sign in required"
        />
      ) : null}

      {error ? <InlineNotice message={error} tone="warning" title="Request failed" /> : null}

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Queries are sent to /api/ai/help and return the retrieved context chunks."
          title="Knowledge search"
        />
        <Field
          label="What do you need help with?"
          multiline
          onChangeText={setHelpQuery}
          placeholder="Example: what is the organizer export policy?"
          style={styles.multilineInput}
          textAlignVertical="top"
          value={helpQuery}
        />
        <View style={styles.row}>
          <Button
            disabled={!helpQuery.trim() || helpLoading}
            label={helpLoading ? 'Searching...' : 'Get help'}
            onPress={() => {
              void handleHelpSearch();
            }}
            style={styles.flexButton}
          />
          {!props.authenticated ? (
            <Button
              label="Go to Profile"
              onPress={props.onRequestSignIn}
              style={styles.flexButton}
              variant="ghost"
            />
          ) : null}
        </View>
        {props.authenticated && chunks.length === 0 && !helpLoading ? (
          <EmptyState
            message="Run a help query and the returned knowledge chunks will appear here."
            title="No help results yet"
          />
        ) : null}
        {chunks.map((chunk) => (
          <Surface key={`${chunk.documentId}-${chunk.title}`} style={styles.chunkCard}>
            <View style={styles.chunkHeader}>
              <Text style={styles.chunkTitle}>{chunk.title}</Text>
              <Pill label={capitalizeLabel(chunk.sourceType)} tone="accent" />
            </View>
            <Text style={styles.chunkBody}>{chunk.content}</Text>
          </Surface>
        ))}
      </Surface>

      <Surface style={styles.sectionCard}>
        <SectionHeader
          subtitle="Organizer and admin accounts can generate mobile-ready event drafts."
          title="Organizer copilot"
        />
        {canUseCopilot ? (
          <InlineNotice
            message="This uses the same audited AI drafting endpoint as the web app."
            tone="success"
          />
        ) : (
          <InlineNotice
            message="This account does not currently have organizer copilot access."
            tone="warning"
          />
        )}
        <Field
          editable={canUseCopilot}
          label="Describe the event you want to draft"
          multiline
          onChangeText={setCopilotPrompt}
          placeholder="Example: A relaxed alumni brunch for families in Berlin with music and memory photos."
          style={styles.multilineInput}
          textAlignVertical="top"
          value={copilotPrompt}
        />
        <View style={styles.row}>
          <Button
            disabled={!copilotPrompt.trim() || !canUseCopilot || copilotLoading !== null}
            label={copilotLoading === 'suggest_title' ? 'Drafting...' : 'Suggest title'}
            onPress={() => {
              void handleCopilot('suggest_title');
            }}
            style={styles.flexButton}
          />
          <Button
            disabled={!copilotPrompt.trim() || !canUseCopilot || copilotLoading !== null}
            label={copilotLoading === 'suggest_description' ? 'Drafting...' : 'Suggest description'}
            onPress={() => {
              void handleCopilot('suggest_description');
            }}
            style={styles.flexButton}
            variant="secondary"
          />
        </View>
        <View style={styles.row}>
          <Button
            disabled={!copilotPrompt.trim() || !canUseCopilot || copilotLoading !== null}
            label={copilotLoading === 'suggest_share_text' ? 'Drafting...' : 'Suggest share text'}
            onPress={() => {
              void handleCopilot('suggest_share_text');
            }}
            style={styles.flexButton}
            variant="ghost"
          />
        </View>
        {copilotResult ? (
          <Surface style={styles.resultCard}>
            <Text style={styles.resultLabel}>Copilot output</Text>
            <Text style={styles.resultText}>{copilotResult}</Text>
            {copilotMeta ? <Text style={styles.resultMeta}>{copilotMeta}</Text> : null}
          </Surface>
        ) : null}
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 28,
  },
  sectionCard: {
    gap: 14,
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
  chunkCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
    padding: 14,
  },
  chunkHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chunkTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 12,
  },
  chunkBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  resultCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 8,
  },
  resultLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  resultText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  resultMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
