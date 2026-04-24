import * as ImagePicker from 'expo-image-picker';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {ApiError, apiClient, getErrorMessage} from '../api/client';
import type {
  DiscussionPost,
  EventConversationDetail,
  EventConversationSummary,
  EventAttendeePreview,
  EventPhotoItem,
  EventPhotoListResponse,
  EventSummary,
  GroupRecommendationItem,
  GroupSummary,
  RecommendationItem,
  RecommendationsResponse,
} from '../api/types';
import {EventCard} from '../components/EventCard';
import {
  Button,
  EmptyState,
  Field,
  InlineNotice,
  LoadingState,
  Pill,
  ScreenIntro,
  SectionHeader,
  Surface,
} from '../components/ui';
import {resolvePhotoUri, validatePickedEventPhoto, type PickedPhotoAsset} from '../gallery/uploadState';
import type {MobileRoute} from '../navigation/deepLinks';
import {
  paymentStateFromRecords,
  paymentStatusTone,
  type MobilePaymentState,
} from '../payments/state';
import {theme} from '../theme';
import {formatDateTime, toShortName} from '../utils/format';

const reactionLabels: Record<'acknowledge' | 'celebrate' | 'like', string> = {
  acknowledge: 'Acknowledge',
  celebrate: 'Celebrate',
  like: 'Like',
};

type RecommendationSectionKey =
  | 'recommendedForYou'
  | 'communitiesYouMayFeelAtHomeIn'
  | 'peopleLikeYouAreJoining'
  | 'gatheringsNearYou'
  | 'becauseYouJoined'
  | 'inYourLanguage'
  | 'peopleWhoAttendedAlsoJoined'
  | 'communitiesGrowingLikeYours'
  | 'eventsYouWillLikelyAttend'
  | 'communitiesYouMayJoinNext';

type EventRecommendationSection = {
  items: RecommendationItem[];
  key: RecommendationSectionKey;
  title: string;
};

type CommunityRecommendationSection = {
  items: GroupRecommendationItem[];
  key: RecommendationSectionKey;
  title: string;
};

export function DiscoverScreen(props: {
  authenticated: boolean;
  isFocused: boolean;
  locale: string;
  navigationTarget?: {id: number; route: MobileRoute} | null;
  onOpenRoute: (route: string | MobileRoute) => Promise<void>;
  onRequestSignIn: () => void;
  viewerName: string | null;
}) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [searchGroups, setSearchGroups] = useState<GroupSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<EventAttendeePreview[]>([]);
  const [eventPhotos, setEventPhotos] = useState<EventPhotoItem[]>([]);
  const [photoPermissions, setPhotoPermissions] = useState<EventPhotoListResponse['permissions'] | null>(null);
  const [eventConversations, setEventConversations] = useState<EventConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<EventConversationDetail | null>(null);
  const [conversationDraft, setConversationDraft] = useState('');
  const [conversationReportReason, setConversationReportReason] = useState('');
  const [conversationReportMessageId, setConversationReportMessageId] = useState<string | null>(null);
  const [threadPosts, setThreadPosts] = useState<DiscussionPost[]>([]);
  const [threadDraft, setThreadDraft] = useState('');
  const [pickedPhoto, setPickedPhoto] = useState<PickedPhotoAsset | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoReportTargetId, setPhotoReportTargetId] = useState<string | null>(null);
  const [photoReportReason, setPhotoReportReason] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationSending, setConversationSending] = useState(false);
  const [conversationActionLoading, setConversationActionLoading] = useState(false);
  const [checkoutLoadingEventId, setCheckoutLoadingEventId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoModerationId, setPhotoModerationId] = useState<string | null>(null);
  const [photoReporting, setPhotoReporting] = useState(false);
  const [threadPosting, setThreadPosting] = useState(false);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [paymentStateByEvent, setPaymentStateByEvent] = useState<Record<string, MobilePaymentState>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recommendedEvents = useMemo(
    () =>
      recommendations
        ? [
            ...recommendations.recommendedForYou,
            ...recommendations.peopleLikeYouAreJoining,
            ...recommendations.gatheringsNearYou,
            ...recommendations.becauseYouJoined,
            ...recommendations.inYourLanguage,
          ].map((entry) => entry.event)
        : [],
    [recommendations],
  );

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ??
    recommendedEvents.find((event) => event.id === selectedEventId) ??
    null;

  async function trackRecommendationInteraction(
    section: RecommendationSectionKey,
    targetId: string,
    targetType: 'event' | 'group',
    type: 'click' | 'rsvp' | 'join',
  ) {
    try {
      await apiClient.recordRecommendationInteraction({
        section,
        targetId,
        targetType,
        type,
      });
    } catch {
      return;
    }
  }

  function isAuthorizationMiss(errorValue: unknown) {
    return errorValue instanceof ApiError && (errorValue.status === 403 || errorValue.status === 404);
  }

  function updatePaymentState(eventId: string, state: MobilePaymentState) {
    setPaymentStateByEvent((currentValue) => ({
      ...currentValue,
      [eventId]: state,
    }));
  }

  const loadSelectedEventContext = useCallback(async (eventId: string) => {
    setDetailLoading(true);
    setConversationDetail(null);
    setSelectedConversationId(null);

    try {
      const [attendeesResult, photosResult] = await Promise.all([
        apiClient.getEventAttendees(eventId),
        apiClient.getEventPhotos(eventId, {includeModeration: props.authenticated}),
      ]);
      setAttendees(attendeesResult.attendees);
      setEventPhotos(photosResult.photos);
      setPhotoPermissions(photosResult.permissions);
      setPhotoReportTargetId(null);
      setPhotoReportReason('');
      setPickedPhoto(null);
      setPhotoCaption('');

      if (props.authenticated) {
        const [threadResult, conversationsResult] = await Promise.all([
          apiClient.getEventThreads(eventId, props.locale),
          apiClient.getEventConversations(eventId).catch((conversationError) => {
            if (isAuthorizationMiss(conversationError)) {
              return null;
            }

            throw conversationError;
          }),
        ]);
        setThreadPosts(threadResult.discussions);
        setEventConversations(conversationsResult?.conversations ?? []);
      } else {
        setThreadPosts([]);
        setEventConversations([]);
      }
    } catch (detailError) {
      setError(getErrorMessage(detailError));
    } finally {
      setDetailLoading(false);
    }
  }, [props.authenticated, props.locale]);

  const loadEvents = useCallback(async (useSearch: boolean, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      if (useSearch && query.trim()) {
        const response = await apiClient.searchEvents(query, props.locale);
        setEvents(response.items);
        setSearchGroups(response.groups ?? []);
        setSummary(
          `Showing ${response.total} event matches and ${response.groups.length} community matches for "${query.trim()}".`,
        );
      } else {
        const response = await apiClient.getEvents(props.locale);
        setEvents(response.events);
        setSearchGroups([]);
        setSummary(`Showing ${response.events.length} upcoming community moments.`);
      }

      if (props.authenticated) {
        const nextRecommendations = await apiClient.getRecommendations(3);
        setRecommendations(nextRecommendations);
      } else {
        setRecommendations(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [props.authenticated, props.locale, query]);

  useEffect(() => {
    if (!props.isFocused) {
      return;
    }

    void loadEvents(false);
  }, [loadEvents, props.authenticated, props.isFocused, props.locale]);

  useEffect(() => {
    if (!props.isFocused || !selectedEventId) {
      return;
    }

    void loadSelectedEventContext(selectedEventId);
  }, [loadSelectedEventContext, props.authenticated, props.isFocused, props.locale, selectedEventId]);

  useEffect(() => {
    if (!props.isFocused || !props.navigationTarget) {
      return;
    }

    const {route} = props.navigationTarget;

    if (route.kind === 'event') {
      setSelectedEventId(route.eventId);
      setSummary(route.openGallery ? 'Opening memories from this event.' : 'Opening event detail.');

      if (route.paymentStatus || route.paymentId || route.checkoutSessionId) {
        updatePaymentState(
          route.eventId,
          paymentStateFromRecords({
            redirectStatus: route.paymentStatus,
          }),
        );
      }

      if (route.conversationId) {
        setSelectedConversationId(route.conversationId);
        void loadConversation(route.conversationId);
      }
    } else if (route.kind === 'gallery') {
      setSelectedEventId(route.eventId);
      setSummary('Opening memories from this event.');
    } else if (route.kind === 'conversation') {
      setSelectedConversationId(route.conversationId);
      if (route.eventId) {
        setSelectedEventId(route.eventId);
      }
      void loadConversation(route.conversationId);
    } else if (route.kind === 'payment') {
      if (route.eventId) {
        setSelectedEventId(route.eventId);
        updatePaymentState(
          route.eventId,
          paymentStateFromRecords({
            redirectStatus: route.paymentStatus,
          }),
        );
      }
      void refreshPaymentStatus(route.eventId, {
        checkoutSessionId: route.checkoutSessionId,
        paymentId: route.paymentId,
      });
    }
  }, [props.isFocused, props.navigationTarget?.id]);

  async function handleRsvp(event: EventSummary, sourceSection?: RecommendationSectionKey) {
    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from the Profile tab to RSVP for events.');
      return;
    }

    setPendingEventId(event.id);
    setError(null);

    try {
      const nextState = event.remainingCapacity > 0 ? 'going' : 'waitlist';
      const response = await apiClient.rsvpToEvent(event.id, nextState);
      setEvents((currentEvents) =>
        currentEvents.map((item) => (item.id === response.event.id ? response.event : item)),
      );
      if (sourceSection) {
        void trackRecommendationInteraction(sourceSection, event.id, 'event', 'rsvp');
      }
      setSummary(
        nextState === 'going'
          ? 'Your place is confirmed.'
          : 'You have been added to the waitlist.',
      );
    } catch (rsvpError) {
      setError(getErrorMessage(rsvpError));
    } finally {
      setPendingEventId(null);
    }
  }

  async function handlePrimaryEventAction(event: EventSummary, sourceSection?: RecommendationSectionKey) {
    if (event.isPaid && event.viewerRsvpState !== 'going') {
      await handleStartCheckout(event);
      return;
    }

    await handleRsvp(event, sourceSection);
  }

  async function handleStartCheckout(event: EventSummary) {
    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from the Profile tab before starting paid event checkout.');
      return;
    }

    if (!event.paymentSetupStatus || event.paymentSetupStatus !== 'ready') {
      setError('This event is paid, but checkout is not ready yet. Please contact the organizer.');
      return;
    }

    setCheckoutLoadingEventId(event.id);
    setError(null);

    try {
      const response = await apiClient.startEventCheckout({
        eventId: event.id,
        locale: props.locale,
      });
      const paymentState = paymentStateFromRecords({
        checkoutSession: response.checkoutSession,
        locale: props.locale,
        payment: response.payment,
      });
      updatePaymentState(event.id, paymentState);

      if (response.checkoutSession.url) {
        await Linking.openURL(response.checkoutSession.url);
        setSummary('Checkout opened. Return here and refresh payment status after the provider redirects.');
      } else {
        setSummary('Checkout was created, but this staging provider did not return a hosted payment URL.');
      }
    } catch (checkoutError) {
      setError(getErrorMessage(checkoutError));
    } finally {
      setCheckoutLoadingEventId(null);
    }
  }

  async function refreshPaymentStatus(
    eventId?: string,
    options?: {
      checkoutSessionId?: string;
      paymentId?: string;
    },
  ) {
    if (!options?.checkoutSessionId && !options?.paymentId) {
      if (eventId) {
        const existingState = paymentStateByEvent[eventId];
        options = {
          checkoutSessionId: existingState?.checkoutSession?.id,
          paymentId: existingState?.payment?.id,
        };
      }
    }

    if (!options?.checkoutSessionId && !options?.paymentId) {
      setSummary('No checkout session is available yet. Start checkout first.');
      return;
    }

    try {
      const response = await apiClient.getPaymentStatus({
        checkoutSessionId: options.checkoutSessionId,
        locale: props.locale,
        paymentId: options.paymentId,
      });
      const resolvedEventId = eventId ?? response.inspection.payment?.eventId;

      if (resolvedEventId) {
        updatePaymentState(
          resolvedEventId,
          paymentStateFromRecords({
            checkoutSession: response.inspection.checkoutSession,
            locale: props.locale,
            payment: response.inspection.payment,
          }),
        );
      }

      setSummary('Payment status refreshed from the backend.');
    } catch (paymentError) {
      setError(getErrorMessage(paymentError));
    }
  }

  async function loadConversation(conversationId: string) {
    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to open event messages.');
      return;
    }

    setConversationLoading(true);
    setError(null);

    try {
      const response = await apiClient.getConversation(conversationId);
      setConversationDetail(response.conversation);
      setSelectedConversationId(response.conversation.id);
      setSelectedEventId(response.eventId);
      setEventConversations((currentValue) => {
        const withoutCurrent = currentValue.filter((conversation) => conversation.id !== response.conversation.id);
        return [response.conversation, ...withoutCurrent];
      });
    } catch (conversationError) {
      setError(getErrorMessage(conversationError));
    } finally {
      setConversationLoading(false);
    }
  }

  async function handleStartConversation(attendee: EventAttendeePreview) {
    if (!selectedEvent) {
      return;
    }

    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to message an event participant.');
      return;
    }

    setConversationLoading(true);
    setError(null);

    try {
      const response = await apiClient.startEventConversation(selectedEvent.id, attendee.id);
      setConversationDetail(response.conversation);
      setSelectedConversationId(response.conversation.id);
      setEventConversations((currentValue) => {
        const withoutCurrent = currentValue.filter((conversation) => conversation.id !== response.conversation.id);
        return [response.conversation, ...withoutCurrent];
      });
      setSummary(
        response.created
          ? `Started an event conversation with ${attendee.fullName}.`
          : `Opened the existing event conversation with ${attendee.fullName}.`,
      );
    } catch (conversationError) {
      setError(getErrorMessage(conversationError));
    } finally {
      setConversationLoading(false);
    }
  }

  async function handleSendConversationMessage() {
    if (!conversationDetail || !conversationDraft.trim()) {
      return;
    }

    setConversationSending(true);
    setError(null);

    try {
      const response = await apiClient.sendConversationMessage(
        conversationDetail.id,
        conversationDraft.trim(),
      );
      setConversationDetail(response.conversation);
      setConversationDraft('');
      setEventConversations((currentValue) =>
        currentValue.map((conversation) =>
          conversation.id === response.conversation.id ? response.conversation : conversation,
        ),
      );
      setSummary('Message sent inside this event conversation.');
    } catch (sendError) {
      setError(getErrorMessage(sendError));
    } finally {
      setConversationSending(false);
    }
  }

  async function handleMuteConversation() {
    if (!conversationDetail) {
      return;
    }

    setConversationActionLoading(true);

    try {
      const response = await apiClient.muteConversation(conversationDetail.id);
      setConversationDetail(response.conversation);
      setSummary('This event conversation is muted for the participant.');
    } catch (muteError) {
      setError(getErrorMessage(muteError));
    } finally {
      setConversationActionLoading(false);
    }
  }

  async function handleReportConversation() {
    if (!conversationDetail || conversationReportReason.trim().length < 5) {
      return;
    }

    setConversationActionLoading(true);

    try {
      await apiClient.reportConversation(
        conversationDetail.id,
        conversationReportReason.trim(),
        conversationReportMessageId ?? undefined,
      );
      setConversationReportReason('');
      setConversationReportMessageId(null);
      await loadConversation(conversationDetail.id);
      setSummary('The event conversation has been sent for review.');
    } catch (reportError) {
      setError(getErrorMessage(reportError));
    } finally {
      setConversationActionLoading(false);
    }
  }

  async function handlePickPhoto() {
    if (!selectedEvent) {
      return;
    }

    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to upload event memories.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError('Photo library permission is needed to upload event memories.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    const validation = validatePickedEventPhoto({
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      uri: asset.uri,
    });

    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setPickedPhoto(validation.asset);
    setSummary('Photo selected. Add an optional caption before uploading.');
  }

  async function handleUploadPhoto() {
    if (!selectedEvent || !pickedPhoto) {
      return;
    }

    setPhotoUploading(true);
    setError(null);

    try {
      const response = await apiClient.uploadEventPhoto(selectedEvent.id, {
        caption: photoCaption,
        fileName: pickedPhoto.fileName ?? 'samgamam-memory.jpg',
        mimeType: pickedPhoto.mimeType ?? 'image/jpeg',
        uri: pickedPhoto.uri,
      });
      setEventPhotos((currentValue) => [response.photo, ...currentValue]);
      setPickedPhoto(null);
      setPhotoCaption('');
      setSummary(
        response.photo.status === 'active'
          ? 'Your memory is live in the event gallery.'
          : 'Your memory was uploaded and is waiting for review.',
      );
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleModeratePhoto(
    photo: EventPhotoItem,
    action: 'approve' | 'feature' | 'hide' | 'remove' | 'unfeature',
  ) {
    if (!selectedEvent) {
      return;
    }

    setPhotoModerationId(photo.id);

    try {
      if (action === 'remove') {
        const response = await apiClient.removeEventPhoto(selectedEvent.id, photo.id);
        setEventPhotos((currentValue) =>
          currentValue.map((item) => (item.id === photo.id ? response.photo : item)),
        );
      } else {
        const response = await apiClient.updateEventPhoto(selectedEvent.id, photo.id, {
          featured: action === 'feature' ? true : action === 'unfeature' ? false : undefined,
          moderationReason: action === 'hide' ? 'Hidden from mobile moderation tools.' : undefined,
          status: action === 'approve' ? 'active' : action === 'hide' ? 'hidden' : undefined,
        });
        setEventPhotos((currentValue) =>
          currentValue.map((item) => (item.id === photo.id ? response.photo : item)),
        );
      }

      setSummary('Gallery moderation change saved.');
    } catch (moderationError) {
      setError(getErrorMessage(moderationError));
    } finally {
      setPhotoModerationId(null);
    }
  }

  async function handlePhotoReport() {
    if (!selectedEvent || !photoReportTargetId || !photoReportReason.trim()) {
      return;
    }

    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to report event photos.');
      return;
    }

    setPhotoReporting(true);

    try {
      await apiClient.reportEventPhoto(selectedEvent.id, photoReportTargetId, photoReportReason.trim());
      setEventPhotos((currentValue) => currentValue.filter((photo) => photo.id !== photoReportTargetId));
      setPhotoReportReason('');
      setPhotoReportTargetId(null);
      setSummary('Thanks. The photo has been sent to the review queue.');
    } catch (reportError) {
      setError(getErrorMessage(reportError));
    } finally {
      setPhotoReporting(false);
    }
  }

  async function handleThreadPost() {
    if (!selectedEvent || !threadDraft.trim()) {
      return;
    }

    if (!props.authenticated) {
      props.onRequestSignIn();
      setError('Sign in from Profile to join event discussions.');
      return;
    }

    setThreadPosting(true);

    try {
      const response = await apiClient.createEventThreadPost(selectedEvent.id, threadDraft.trim());
      setThreadPosts((currentValue) => [response.post, ...currentValue]);
      setThreadDraft('');
      setSummary('Your note is live in the event conversation.');
    } catch (postError) {
      setError(getErrorMessage(postError));
    } finally {
      setThreadPosting(false);
    }
  }

  async function handleThreadReaction(
    postId: string,
    reaction: 'acknowledge' | 'celebrate' | 'like',
  ) {
    try {
      const response = await apiClient.reactToDiscussion(postId, reaction);
      setThreadPosts((currentValue) =>
        currentValue.map((post) => (post.id === postId ? response.post : post)),
      );
    } catch (reactionError) {
      setError(getErrorMessage(reactionError));
    }
  }

  const eventRecommendationSections: EventRecommendationSection[] = recommendations
    ? [
        {
          items: recommendations.recommendedForYou,
          key: 'recommendedForYou',
          title: 'Recommended for you',
        },
        {
          items: recommendations.eventsYouWillLikelyAttend,
          key: 'eventsYouWillLikelyAttend',
          title: 'Events you will likely attend',
        },
        {
          items: recommendations.peopleLikeYouAreJoining,
          key: 'peopleLikeYouAreJoining',
          title: 'People like you are joining',
        },
        {
          items: recommendations.becauseYouJoined,
          key: 'becauseYouJoined',
          title: 'Because you joined',
        },
      ]
    : [];

  const communityRecommendationSections: CommunityRecommendationSection[] = recommendations
    ? [
        {
          items: recommendations.communitiesYouMayFeelAtHomeIn,
          key: 'communitiesYouMayFeelAtHomeIn',
          title: 'Communities you may feel at home in',
        },
        {
          items: recommendations.communitiesYouMayJoinNext,
          key: 'communitiesYouMayJoinNext',
          title: 'Communities you may join next',
        },
        {
          items: recommendations.peopleWhoAttendedAlsoJoined,
          key: 'peopleWhoAttendedAlsoJoined',
          title: 'People who attended also joined',
        },
        {
          items: recommendations.communitiesGrowingLikeYours,
          key: 'communitiesGrowingLikeYours',
          title: 'Communities growing like yours',
        },
      ]
    : [];

  function eventActionLabel(event: EventSummary) {
    if (checkoutLoadingEventId === event.id) {
      return 'Starting checkout...';
    }

    if (!props.authenticated) {
      return event.isPaid ? 'Sign in to checkout' : 'Sign in to RSVP';
    }

    if (event.isPaid && event.viewerRsvpState !== 'going') {
      return 'Checkout';
    }

    if (event.viewerRsvpState === 'going') {
      return 'Already going';
    }

    return event.remainingCapacity > 0 ? 'RSVP now' : 'Join waitlist';
  }

  function eventActionDisabled(event: EventSummary) {
    return (
      pendingEventId === event.id ||
      checkoutLoadingEventId === event.id ||
      event.viewerRsvpState === 'going' ||
      (event.isPaid && event.paymentSetupStatus !== 'ready')
    );
  }

  function renderRecommendationCard(item: RecommendationItem, section: RecommendationSectionKey) {
    return (
      <View key={`${section}-${item.event.id}`} style={styles.recommendationCard}>
        <View style={styles.heroStats}>
          <Pill label={`Score ${item.score}`} tone="accent" />
          {item.reasons.slice(0, 2).map((reason) => (
            <Pill key={`${item.event.id}-${reason}`} label={reason} tone="success" />
          ))}
        </View>
        <EventCard
          actionDisabled={eventActionDisabled(item.event)}
          actionLabel={eventActionLabel(item.event)}
          event={item.event}
          locale={props.locale}
          onActionPress={() => {
            void handlePrimaryEventAction(item.event, section);
          }}
          onSecondaryActionPress={() => {
            setSelectedEventId(item.event.id);
            setSummary(`Opened ${item.event.title} for deeper event detail.`);
            void trackRecommendationInteraction(section, item.event.id, 'event', 'click');
          }}
          secondaryActionLabel="Open details"
        />
      </View>
    );
  }

  function renderCommunityRecommendation(
    item: GroupRecommendationItem,
    section: RecommendationSectionKey,
  ) {
    return (
      <Surface key={`${section}-${item.group.id}`} style={styles.communityCard}>
        <View style={styles.heroStats}>
          <Pill label={`Score ${item.score}`} tone="accent" />
          {item.group.languages.slice(0, 2).map((language) => (
            <Pill key={`${item.group.id}-${language}`} label={language.toUpperCase()} tone="success" />
          ))}
        </View>
        <Text style={styles.heroTitle}>{item.group.name}</Text>
        <Text style={styles.heroText}>{item.group.description}</Text>
        <Text style={styles.communityMeta}>
          {item.group.memberCount} members | {item.group.discussionCount} discussions | {item.group.inviteCount} invites
        </Text>
        <View style={styles.heroStats}>
          {item.reasons.slice(0, 2).map((reason) => (
            <Pill key={`${item.group.id}-${reason}`} label={reason} tone="default" />
          ))}
        </View>
        <Button
          compact
          label="Track join intent"
          onPress={() => {
            void trackRecommendationInteraction(section, item.group.id, 'group', 'join');
            setSummary(`Saved a learning signal for ${item.group.name}.`);
          }}
          variant="ghost"
        />
      </Surface>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          onRefresh={() => {
            void loadEvents(Boolean(query.trim()), true);
          }}
          refreshing={refreshing}
          tintColor={theme.colors.accent}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <ScreenIntro
        eyebrow="Discover"
        subtitle={`Hello ${toShortName(props.viewerName)}. Browse events, open the conversation, and follow the communities that make the moment last.`}
        title="Find a gathering, then stay with the people around it."
      />

      <Surface style={styles.heroCard}>
        <View style={styles.heroStats}>
          <Pill label={props.authenticated ? 'Signed in' : 'Guest mode'} tone="accent" />
          <Pill label={props.locale.toUpperCase()} tone="success" />
        </View>
        <Text style={styles.heroTitle}>Discovery now carries continuity with it.</Text>
        <Text style={styles.heroText}>
          Search the live event API, preview community matches, and send learning signals back into the recommendation layer.
        </Text>
      </Surface>

      <Surface style={styles.searchCard}>
        <SectionHeader
          subtitle="Search remains event-led, but community matches now appear when the intent overlaps."
          title="Search events and related communities"
        />
        <Field
          label="Search phrase"
          onChangeText={setQuery}
          placeholder="Try brunch, family, music, alumni, or language"
          returnKeyType="search"
          value={query}
        />
        <View style={styles.row}>
          <Button
            label={loading ? 'Searching...' : 'Search'}
            onPress={() => {
              void loadEvents(true);
            }}
            style={styles.flexButton}
          />
          <Button
            label="Reset"
            onPress={() => {
              setQuery('');
              setSelectedEventId(null);
              void loadEvents(false);
            }}
            style={styles.flexButton}
            variant="ghost"
          />
        </View>
      </Surface>

      {summary ? <InlineNotice message={summary} tone="success" /> : null}
      {error ? <InlineNotice message={error} tone="warning" title="Action needed" /> : null}
      {!props.authenticated ? (
        <InlineNotice
          message="You can browse everything as a guest. Sign in from Profile to RSVP, read event threads, and unlock personalized continuity surfaces."
          tone="accent"
          title="Guest mode"
        />
      ) : null}

      {props.authenticated && recommendations ? (
        <Surface style={styles.searchCard}>
          <SectionHeader
            subtitle="Belonging-aware recommendations combine your language, community history, and nearby activity."
            title="Made for your circles"
          />
          <InlineNotice
            message={`CTR ${recommendations.modelSummary.ctrWeight.toFixed(2)} | RSVP ${recommendations.modelSummary.rsvpWeight.toFixed(2)} | Behavior ${recommendations.modelSummary.behaviorWeight.toFixed(2)} | Regional ${recommendations.modelSummary.regionalWeight.toFixed(2)} | Time ${recommendations.modelSummary.timeWeight.toFixed(2)} | ${recommendations.modelSummary.fallbackActive ? 'Fallback still active' : 'Learning tuned live'}`}
            tone="accent"
            title="Recommendation model"
          />
          {recommendations.modelSummary.explainabilityNotes.length > 0 ? (
            <InlineNotice
              message={recommendations.modelSummary.explainabilityNotes.join(' ')}
              tone="accent"
              title="Why these weights stay explainable"
            />
          ) : null}
          {eventRecommendationSections.map((section) => (
            <View key={section.key} style={styles.recommendationSection}>
              <SectionHeader title={section.title} />
              {section.items.length === 0 ? (
                <EmptyState
                  message="There is nothing in this bucket right now."
                  title="No items in this section"
                />
              ) : (
                section.items.map((item) => renderRecommendationCard(item, section.key))
              )}
            </View>
          ))}
          {communityRecommendationSections.map((section) => (
            <View key={section.key} style={styles.communityList}>
              <SectionHeader title={section.title} />
              {section.items.length === 0 ? (
                <EmptyState
                  message="This community layer is still gathering signal."
                  title="No communities in this section"
                />
              ) : (
                section.items.map((item) => renderCommunityRecommendation(item, section.key))
              )}
            </View>
          ))}
        </Surface>
      ) : null}

      {searchGroups.length > 0 ? (
        <Surface style={styles.searchCard}>
          <SectionHeader
            subtitle="These community matches use the same search phrase so discovery can move naturally into retention."
            title="Community matches"
          />
          {searchGroups.map((group: GroupSummary) => (
            <Surface key={group.id} style={styles.communityCard}>
              <View style={styles.heroStats}>
                <Pill label={group.category} tone="accent" />
                <Pill label={`${group.memberCount} members`} tone="success" />
              </View>
              <Text style={styles.heroTitle}>{group.name}</Text>
              <Text style={styles.heroText}>{group.description}</Text>
              <Text style={styles.communityMeta}>
                {group.discussionCount} active discussions | {group.shareCount} shares
              </Text>
            </Surface>
          ))}
        </Surface>
      ) : null}

      <SectionHeader
        subtitle={loading ? 'Refreshing live content from the backend.' : 'Pulled from /api/events or /api/search.'}
        title="Upcoming moments"
      />

      {loading ? (
        <LoadingState
          message="Loading events, recommendations, and nearby community matches."
          title="Loading upcoming moments"
        />
      ) : null}

      {!loading && events.length === 0 ? (
        <EmptyState
          message="Try a broader search phrase or refresh after checking your API connection."
          title="No events matched this search"
        />
      ) : null}

      {events.map((event) => (
        <EventCard
          actionDisabled={eventActionDisabled(event)}
          actionLabel={eventActionLabel(event)}
          event={event}
          key={event.id}
          locale={props.locale}
          onActionPress={() => {
            void handlePrimaryEventAction(event);
          }}
          onSecondaryActionPress={() => {
            setSelectedEventId(event.id);
            setSummary(`Opened ${event.title} for deeper event detail.`);
          }}
          secondaryActionLabel="Open details"
        />
      ))}

      {selectedEvent ? (
        <Surface style={styles.detailCard}>
          <SectionHeader
            subtitle={`${selectedEvent.discussionCount ?? threadPosts.length} discussion updates | ${selectedEvent.languages.join(', ')}`}
            title={selectedEvent.title}
          />
          <Text style={styles.heroText}>{selectedEvent.description}</Text>
          <Text style={styles.communityMeta}>
            {formatDateTime(selectedEvent.startsAt, props.locale)} | {selectedEvent.location}
          </Text>
          {detailLoading ? <Text style={styles.loadingText}>Loading event detail...</Text> : null}
          <View style={styles.heroStats}>
            <Pill label={`${selectedEvent.goingCount} going`} tone="accent" />
            <Pill label={`${selectedEvent.waitlistCount} waitlist`} tone="warning" />
            <Pill label={selectedEvent.attendeeVisibility ?? 'public'} tone="success" />
            {selectedEvent.isPaid ? <Pill label="Paid event" tone="warning" /> : <Pill label="Free event" />}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Payment and RSVP</Text>
            {selectedEvent.isPaid ? (
              <>
                <InlineNotice
                  message={
                    paymentStateByEvent[selectedEvent.id]?.message ??
                    'Start checkout from mobile. Samgamam only marks payment as successful after the backend confirms provider state.'
                  }
                  tone={paymentStatusTone(paymentStateByEvent[selectedEvent.id]?.status ?? 'unknown')}
                  title={
                    paymentStateByEvent[selectedEvent.id]
                      ? `Payment: ${paymentStateByEvent[selectedEvent.id].status}`
                      : 'Payment required'
                  }
                />
                {paymentStateByEvent[selectedEvent.id]?.payment?.receiptUrl ? (
                  <Button
                    compact
                    label="Open receipt"
                    onPress={() => {
                      const receiptUrl = paymentStateByEvent[selectedEvent.id]?.payment?.receiptUrl;
                      if (receiptUrl) {
                        void Linking.openURL(
                          /^https?:\/\//i.test(receiptUrl)
                            ? receiptUrl
                            : `${apiClient.getBaseUrl()}${receiptUrl.startsWith('/') ? receiptUrl : `/${receiptUrl}`}`,
                        );
                      }
                    }}
                    variant="ghost"
                  />
                ) : null}
                <View style={styles.row}>
                  <Button
                    disabled={checkoutLoadingEventId === selectedEvent.id || selectedEvent.paymentSetupStatus !== 'ready'}
                    label={checkoutLoadingEventId === selectedEvent.id ? 'Starting...' : 'Start checkout'}
                    onPress={() => {
                      void handleStartCheckout(selectedEvent);
                    }}
                    style={styles.flexButton}
                  />
                  <Button
                    label="Refresh status"
                    onPress={() => {
                      void refreshPaymentStatus(selectedEvent.id);
                    }}
                    style={styles.flexButton}
                    variant="ghost"
                  />
                </View>
              </>
            ) : (
              <InlineNotice
                message="This event is free. RSVP state is still managed by the backend."
                tone="success"
              />
            )}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Who is going</Text>
            {attendees.length === 0 ? (
              <Text style={styles.heroText}>Names are private for this gathering right now.</Text>
            ) : (
              attendees.map((attendee) => (
                <View key={attendee.id} style={styles.attendeeRow}>
                  <View style={styles.attendeeCopy}>
                    <Text style={styles.attendeeName}>{attendee.fullName}</Text>
                    <Text style={styles.attendeeMeta}>{attendee.city}</Text>
                  </View>
                  <Button
                    compact
                    label="Message"
                    onPress={() => {
                      void handleStartConversation(attendee);
                    }}
                    variant="ghost"
                  />
                </View>
              ))
            )}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Memory gallery</Text>
            <Text style={styles.heroText}>
              Shared photos stay tied to this event and move through review before they become part of the memory wall.
            </Text>
            {photoPermissions?.canUpload ? (
              <Surface style={styles.photoUploadCard}>
                <Text style={styles.photoUploadTitle}>Share a memory</Text>
                <Text style={styles.heroText}>
                  Photos stay attached to this event. Jpg, png, and webp files up to 6 MB are accepted.
                </Text>
                {pickedPhoto ? (
                  <InlineNotice
                    message={`${pickedPhoto.fileName ?? 'Selected photo'} is ready to upload.`}
                    tone="success"
                    title="Photo selected"
                  />
                ) : null}
                <Field
                  editable={!photoUploading}
                  label="Caption"
                  onChangeText={setPhotoCaption}
                  placeholder="A small note about this moment"
                  value={photoCaption}
                />
                <View style={styles.row}>
                  <Button
                    label="Choose photo"
                    onPress={() => {
                      void handlePickPhoto();
                    }}
                    style={styles.flexButton}
                    variant="ghost"
                  />
                  <Button
                    disabled={!pickedPhoto || photoUploading}
                    label={photoUploading ? 'Uploading...' : 'Upload'}
                    onPress={() => {
                      void handleUploadPhoto();
                    }}
                    style={styles.flexButton}
                  />
                </View>
              </Surface>
            ) : (
              <InlineNotice
                message="Gallery uploads are available to event participants and staff after sign-in."
                tone="accent"
              />
            )}
            {photoPermissions?.canModerate ? (
              <InlineNotice
                message="You can approve, feature, hide, or remove photos from mobile. Report resolution still stays in the moderation queue."
                tone="warning"
                title="Organizer gallery tools"
              />
            ) : null}
            {eventPhotos.length === 0 ? (
              <Text style={styles.heroText}>No memories shared yet.</Text>
            ) : (
              <View style={styles.photoGrid}>
                {eventPhotos.map((photo) => (
                  <Surface key={photo.id} style={styles.photoCard}>
                    {resolvePhotoUri(apiClient.getBaseUrl(), photo.thumbnailUrl ?? photo.imageUrl) ? (
                      <Image
                        accessibilityLabel={photo.caption ?? 'Shared event memory'}
                        alt={photo.caption ?? 'Shared event memory'}
                        source={{uri: resolvePhotoUri(apiClient.getBaseUrl(), photo.thumbnailUrl ?? photo.imageUrl) ?? ''}}
                        style={styles.photoImage}
                      />
                    ) : null}
                    <View style={styles.heroStats}>
                      {photo.featured ? <Pill label="Featured" tone="accent" /> : null}
                      <Pill label={photo.status} tone={photo.status === 'active' ? 'success' : 'warning'} />
                      <Pill label={photo.uploaderLabel} tone="default" />
                    </View>
                    <Text style={styles.photoCaption}>{photo.caption ?? 'Shared event memory'}</Text>
                    <Text style={styles.photoMetaText}>
                      {photo.uploaderName} | {formatDateTime(photo.createdAt, props.locale)}
                    </Text>
                    {photo.viewerCanReport ? (
                      <Button
                        compact
                        label={photoReportTargetId === photo.id ? 'Reporting' : 'Report photo'}
                        onPress={() => {
                          setPhotoReportTargetId(photo.id);
                          setSummary('Tell us what needs review for this photo.');
                        }}
                        variant={photoReportTargetId === photo.id ? 'secondary' : 'ghost'}
                      />
                    ) : null}
                    {photo.viewerCanModerate ? (
                      <View style={styles.heroStats}>
                        {photo.status !== 'active' ? (
                          <Button
                            compact
                            disabled={photoModerationId === photo.id}
                            label="Approve"
                            onPress={() => {
                              void handleModeratePhoto(photo, 'approve');
                            }}
                            variant="secondary"
                          />
                        ) : null}
                        <Button
                          compact
                          disabled={photoModerationId === photo.id}
                          label={photo.featured ? 'Unfeature' : 'Feature'}
                          onPress={() => {
                            void handleModeratePhoto(photo, photo.featured ? 'unfeature' : 'feature');
                          }}
                          variant="ghost"
                        />
                        {photo.status !== 'hidden' ? (
                          <Button
                            compact
                            disabled={photoModerationId === photo.id}
                            label="Hide"
                            onPress={() => {
                              void handleModeratePhoto(photo, 'hide');
                            }}
                            variant="ghost"
                          />
                        ) : null}
                      </View>
                    ) : null}
                    {photo.viewerCanDelete ? (
                      <Button
                        compact
                        disabled={photoModerationId === photo.id}
                        label="Remove"
                        onPress={() => {
                          void handleModeratePhoto(photo, 'remove');
                        }}
                        variant="ghost"
                      />
                    ) : null}
                  </Surface>
                ))}
              </View>
            )}
            {photoReportTargetId ? (
              <Surface style={styles.photoUploadCard}>
                <Text style={styles.photoUploadTitle}>Report selected photo</Text>
                <Field
                  editable={!photoReporting}
                  label="Reason"
                  multiline
                  onChangeText={setPhotoReportReason}
                  placeholder="Tell us what should be reviewed"
                  style={styles.multilineInput}
                  textAlignVertical="top"
                  value={photoReportReason}
                />
                <Button
                  disabled={!photoReportReason.trim() || photoReporting}
                  label={photoReporting ? 'Reporting...' : 'Submit report'}
                  onPress={() => {
                    void handlePhotoReport();
                  }}
                />
              </Surface>
            ) : null}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Private event messages</Text>
            <Text style={styles.heroText}>
              Controlled messaging is event-context only. Organizers and event staff can message a participant, and that participant can reply in the same thread.
            </Text>
            {!props.authenticated ? (
              <InlineNotice
                message="Sign in to open private event messages."
                tone="warning"
              />
            ) : null}
            {conversationLoading ? (
              <LoadingState
                message="Loading the private event conversation."
                title="Opening messages"
              />
            ) : null}
            {props.authenticated && eventConversations.length === 0 && !conversationLoading ? (
              <InlineNotice
                message="No staff-visible conversations are open for this event on mobile."
                tone="accent"
              />
            ) : null}
            {eventConversations.map((conversation) => (
              <Surface
                key={conversation.id}
                style={[
                  styles.threadCard,
                  selectedConversationId === conversation.id ? styles.selectedConversationCard : undefined,
                ]}
              >
                <View style={styles.threadHeader}>
                  <Text style={styles.threadAuthor}>{conversation.participantName}</Text>
                  <View style={styles.heroStats}>
                    <Pill label={conversation.status} tone={conversation.status === 'reported' ? 'warning' : 'accent'} />
                    {conversation.unreadCount > 0 ? (
                      <Pill label={`${conversation.unreadCount} unread`} tone="success" />
                    ) : null}
                  </View>
                </View>
                <Text style={styles.heroText}>
                  {conversation.lastMessagePreview ?? 'No message sent yet.'}
                </Text>
                <Text style={styles.threadMeta}>
                  {conversation.lastMessageAt
                    ? formatDateTime(conversation.lastMessageAt, props.locale)
                    : formatDateTime(conversation.updatedAt, props.locale)}
                </Text>
                <Button
                  compact
                  label="Open thread"
                  onPress={() => {
                    void loadConversation(conversation.id);
                  }}
                  variant="ghost"
                />
              </Surface>
            ))}
            {conversationDetail ? (
              <Surface style={styles.conversationPanel}>
                <View style={styles.threadHeader}>
                  <View style={styles.conversationTitleWrap}>
                    <Text style={styles.threadAuthor}>{conversationDetail.eventTitle}</Text>
                    <Text style={styles.threadMeta}>
                      {conversationDetail.organizerName} and {conversationDetail.participantName}
                    </Text>
                  </View>
                  <View style={styles.heroStats}>
                    <Pill label={conversationDetail.status} tone={conversationDetail.status === 'reported' ? 'warning' : 'accent'} />
                    {conversationDetail.mutedByParticipant ? <Pill label="Muted" tone="warning" /> : null}
                  </View>
                </View>
                {conversationDetail.messages.length === 0 ? (
                  <EmptyState
                    message="Send a short, useful event-context message."
                    title="No private messages yet"
                  />
                ) : null}
                {conversationDetail.messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      message.senderRole === 'participant' ? styles.messageBubbleParticipant : styles.messageBubbleStaff,
                    ]}
                  >
                    <Text style={styles.messageAuthor}>
                      {message.senderName} | {message.senderRole}
                    </Text>
                    <Text style={styles.messageBody}>{message.body}</Text>
                    <View style={styles.threadHeader}>
                      <Text style={styles.threadMeta}>{formatDateTime(message.createdAt, props.locale)}</Text>
                      <Button
                        compact
                        label="Report"
                        onPress={() => {
                          setConversationReportMessageId(message.id);
                          setSummary('Add a reason to report this message for review.');
                        }}
                        variant="ghost"
                      />
                    </View>
                  </View>
                ))}
                <Field
                  editable={!conversationSending && conversationDetail.status !== 'closed' && conversationDetail.status !== 'archived'}
                  label="Reply in this event conversation"
                  multiline
                  onChangeText={setConversationDraft}
                  placeholder="Keep it specific to this event"
                  style={styles.multilineInput}
                  textAlignVertical="top"
                  value={conversationDraft}
                />
                <View style={styles.row}>
                  <Button
                    disabled={!conversationDraft.trim() || conversationSending}
                    label={conversationSending ? 'Sending...' : 'Send reply'}
                    onPress={() => {
                      void handleSendConversationMessage();
                    }}
                    style={styles.flexButton}
                  />
                  <Button
                    disabled={conversationActionLoading}
                    label="Mute"
                    onPress={() => {
                      void handleMuteConversation();
                    }}
                    style={styles.flexButton}
                    variant="ghost"
                  />
                </View>
                <Surface style={styles.photoUploadCard}>
                  <Text style={styles.photoUploadTitle}>
                    {conversationReportMessageId ? 'Report selected message' : 'Report conversation'}
                  </Text>
                  <Field
                    editable={!conversationActionLoading}
                    label="Reason"
                    multiline
                    onChangeText={setConversationReportReason}
                    placeholder="Tell moderators what needs review"
                    style={styles.multilineInput}
                    textAlignVertical="top"
                    value={conversationReportReason}
                  />
                  <View style={styles.row}>
                    <Button
                      disabled={conversationReportReason.trim().length < 5 || conversationActionLoading}
                      label={conversationActionLoading ? 'Reporting...' : 'Submit report'}
                      onPress={() => {
                        void handleReportConversation();
                      }}
                      style={styles.flexButton}
                      variant="ghost"
                    />
                    {conversationReportMessageId ? (
                      <Button
                        label="Clear message"
                        onPress={() => {
                          setConversationReportMessageId(null);
                        }}
                        style={styles.flexButton}
                        variant="secondary"
                      />
                    ) : null}
                  </View>
                </Surface>
              </Surface>
            ) : null}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Event conversation</Text>
            {!props.authenticated ? (
              <InlineNotice
                message="Sign in to continue the event conversation from your phone."
                tone="warning"
              />
            ) : null}
            {props.authenticated ? (
              <>
                <Field
                  editable={!threadPosting}
                  label="Add a note"
                  multiline
                  onChangeText={setThreadDraft}
                  placeholder="Share a logistics tip, welcome note, or follow-up thought"
                  style={styles.multilineInput}
                  textAlignVertical="top"
                  value={threadDraft}
                />
                <Button
                  disabled={!threadDraft.trim() || threadPosting}
                  label={threadPosting ? 'Posting...' : 'Post to event'}
                  onPress={() => {
                    void handleThreadPost();
                  }}
                />
              </>
            ) : null}
            {threadPosts.length === 0 && !detailLoading ? (
              <Text style={styles.heroText}>No discussion posts yet.</Text>
            ) : null}
            {threadPosts.map((post) => (
              <Surface key={post.id} style={styles.threadCard}>
                <View style={styles.threadHeader}>
                  <Text style={styles.threadAuthor}>{post.authorName}</Text>
                  <View style={styles.heroStats}>
                    <Pill label={post.kind} tone={post.kind === 'announcement' ? 'accent' : 'default'} />
                    {post.pinned ? <Pill label="Pinned" tone="success" /> : null}
                  </View>
                </View>
                {post.replyPreview ? (
                  <Text style={styles.replyPreview}>Replying to: {post.replyPreview}</Text>
                ) : null}
                <Text style={styles.heroText}>{post.body}</Text>
                <Text style={styles.threadMeta}>{formatDateTime(post.createdAt, props.locale)}</Text>
                <View style={styles.heroStats}>
                  {post.reactionSummary.map((reaction) => (
                    <Button
                      compact
                      key={`${post.id}-${reaction.type}`}
                      label={`${reactionLabels[reaction.type]}${reaction.count > 0 ? ` (${reaction.count})` : ''}`}
                      onPress={() => {
                        void handleThreadReaction(post.id, reaction.type);
                      }}
                      variant={post.viewerReaction === reaction.type ? 'secondary' : 'ghost'}
                    />
                  ))}
                </View>
              </Surface>
            ))}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Why this helps continuity</Text>
            <Text style={styles.heroText}>
              Events still bring people in, but the conversation and the community around it are what make them come back.
            </Text>
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
  heroCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 12,
  },
  heroStats: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  heroText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  searchCard: {
    gap: 14,
  },
  recommendationSection: {
    gap: 10,
  },
  recommendationCard: {
    gap: 10,
  },
  communityList: {
    gap: 10,
  },
  communityCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
  },
  communityMeta: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    columnGap: 12,
    flexDirection: 'row',
  },
  flexButton: {
    flex: 1,
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  detailCard: {
    gap: 16,
  },
  detailSection: {
    gap: 12,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  attendeeRow: {
    alignItems: 'center',
    columnGap: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  attendeeCopy: {
    flex: 1,
    gap: 2,
  },
  attendeeName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  attendeeMeta: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  photoUploadCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
  },
  photoUploadTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  photoGrid: {
    columnGap: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
    width: '48%',
  },
  photoImage: {
    borderRadius: 18,
    height: 220,
    width: '100%',
  },
  photoCaption: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  photoMetaText: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  multilineInput: {
    minHeight: 90,
  },
  threadCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 10,
  },
  selectedConversationCard: {
    borderColor: theme.colors.accent,
  },
  conversationPanel: {
    backgroundColor: theme.colors.cardAlt,
    gap: 12,
  },
  conversationTitleWrap: {
    flex: 1,
    gap: 4,
    marginRight: 12,
  },
  threadHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  threadAuthor: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 12,
  },
  threadMeta: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  replyPreview: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  messageBubble: {
    borderRadius: theme.radius.sm,
    gap: 6,
    padding: 12,
  },
  messageBubbleParticipant: {
    backgroundColor: theme.colors.successSoft,
  },
  messageBubbleStaff: {
    backgroundColor: theme.colors.accentSoft,
  },
  messageAuthor: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  messageBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
});
