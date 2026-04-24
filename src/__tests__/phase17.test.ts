import {validatePickedEventPhoto} from '../gallery/uploadState';
import {parseSamgamamRoute, routeNeedsAuthentication, routeToTab} from '../navigation/deepLinks';
import {resolveNotificationRoute} from '../notifications/routing';
import {paymentStateFromRecords} from '../payments/state';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

{
  const route = parseSamgamamRoute('/en/events/munich-potluck?conversation=event-conversation-1');
  assert(route?.kind === 'event', 'event link should parse');
  assertEqual(route.eventId, 'munich-potluck', 'event id should be preserved');
  assertEqual(route.conversationId, 'event-conversation-1', 'conversation id should be preserved');
  assertEqual(routeToTab(route), 'discover', 'event links should open discover');
  assert(routeNeedsAuthentication(route), 'conversation event links should require auth');
}

{
  const route = parseSamgamamRoute('samgamam://groups/munich-family-circle');
  assert(route?.kind === 'group', 'group deep link should parse');
  assertEqual(route.groupId, 'munich-family-circle', 'group id should be preserved');
  assertEqual(routeToTab(route), 'groups', 'group links should open groups');
}

{
  const route = resolveNotificationRoute({
    body: 'A reply arrived.',
    createdAt: new Date(0).toISOString(),
    id: 'notif-1',
    status: 'queued',
    targetUrl: '/events/hamburg-summer/gallery',
    title: 'Gallery update',
    type: 'event_photo_uploaded',
  });
  assert(route.kind === 'gallery', 'gallery notification should route to gallery');
  assertEqual(route.eventId, 'hamburg-summer', 'gallery route event id should be preserved');
}

{
  const validation = validatePickedEventPhoto({
    fileName: 'memory.png',
    fileSize: 1024,
    mimeType: 'image/png',
    uri: 'file:///memory.png',
  });
  assert(validation.ok, 'valid png should pass validation');
}

{
  const validation = validatePickedEventPhoto({
    fileName: 'memory.gif',
    fileSize: 1024,
    mimeType: 'image/gif',
    uri: 'file:///memory.gif',
  });
  assert(!validation.ok, 'gif should fail validation');
}

{
  const state = paymentStateFromRecords({
    checkoutSession: null,
    payment: {
      amountCents: 2500,
      checkoutSessionId: 'cs_1',
      createdAt: new Date(0).toISOString(),
      currency: 'EUR',
      eventId: 'berlin-brunch',
      id: 'payment-1',
      organizerId: 'vipin-demo',
      provider: 'stripe',
      status: 'succeeded',
    },
  });
  assertEqual(state.status, 'succeeded', 'succeeded payment should stay succeeded');
  assert(state.message.includes('Payment confirmed'), 'success copy should be backend-confirmed');
}
