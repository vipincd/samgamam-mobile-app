export type MobileRoute =
  | {
      kind: 'conversation';
      conversationId: string;
      eventId?: string;
      rawUrl: string;
    }
  | {
      checkoutSessionId?: string;
      eventId: string;
      kind: 'event';
      openGallery?: boolean;
      paymentId?: string;
      paymentStatus?: string;
      conversationId?: string;
      rawUrl: string;
    }
  | {
      eventId: string;
      kind: 'gallery';
      rawUrl: string;
    }
  | {
      groupId: string;
      kind: 'group';
      rawUrl: string;
    }
  | {
      kind: 'notification';
      notificationId?: string;
      rawUrl: string;
    }
  | {
      checkoutSessionId?: string;
      eventId?: string;
      kind: 'payment';
      paymentId?: string;
      paymentStatus?: string;
      rawUrl: string;
    }
  | {
      kind: 'profile';
      rawUrl: string;
      reason?: string;
    }
  | {
      kind: 'unknown';
      message: string;
      rawUrl: string;
    };

const supportedLocales = new Set(['de', 'en', 'hi']);

function parseUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.startsWith('/')) {
      return new URL(trimmed, 'samgamam://app');
    }

    return new URL(trimmed);
  } catch {
    return null;
  }
}

function normalizePathParts(url: URL) {
  const hostParts =
    url.protocol === 'samgamam:' && url.hostname && url.hostname !== 'app'
      ? [url.hostname]
      : [];
  const pathParts = url.pathname.split('/').filter(Boolean);
  const parts = [...hostParts, ...pathParts];

  return supportedLocales.has(parts[0] ?? '') ? parts.slice(1) : parts;
}

function readPaymentStatus(url: URL) {
  return (
    url.searchParams.get('payment_status') ??
    url.searchParams.get('billing_status') ??
    url.searchParams.get('status') ??
    undefined
  );
}

function readCheckoutSessionId(url: URL) {
  return (
    url.searchParams.get('checkoutSessionId') ??
    url.searchParams.get('checkout_session_id') ??
    url.searchParams.get('session_id') ??
    undefined
  );
}

export function routeNeedsAuthentication(route: MobileRoute) {
  return (
    route.kind === 'conversation' ||
    route.kind === 'payment' ||
    (route.kind === 'event' && Boolean(route.conversationId || route.paymentId || route.checkoutSessionId))
  );
}

export function routeToTab(route: MobileRoute): 'discover' | 'groups' | 'profile' {
  if (route.kind === 'group') {
    return 'groups';
  }

  if (route.kind === 'profile' || route.kind === 'notification') {
    return 'profile';
  }

  return 'discover';
}

export function parseSamgamamRoute(value: string | null | undefined): MobileRoute | null {
  if (!value) {
    return null;
  }

  const url = parseUrl(value);
  const rawUrl = value.trim();

  if (!url) {
    return {
      kind: 'unknown',
      message: 'This link could not be opened in Samgamam Mobile.',
      rawUrl,
    };
  }

  const parts = normalizePathParts(url);
  const [section, id, nested] = parts;

  if ((section === 'events' || section === 'event') && id) {
    if (nested === 'gallery' || url.hash === '#gallery') {
      return {
        eventId: id,
        kind: 'gallery',
        rawUrl,
      };
    }

    return {
      checkoutSessionId: readCheckoutSessionId(url),
      conversationId: url.searchParams.get('conversation') ?? undefined,
      eventId: id,
      kind: 'event',
      openGallery: url.searchParams.get('gallery') === 'true',
      paymentId: url.searchParams.get('paymentId') ?? undefined,
      paymentStatus: readPaymentStatus(url),
      rawUrl,
    };
  }

  if ((section === 'groups' || section === 'group' || section === 'communities') && id) {
    return {
      groupId: id,
      kind: 'group',
      rawUrl,
    };
  }

  if ((section === 'conversations' || section === 'conversation') && id) {
    return {
      conversationId: id,
      eventId: url.searchParams.get('eventId') ?? undefined,
      kind: 'conversation',
      rawUrl,
    };
  }

  if ((section === 'payments' || section === 'payment' || section === 'checkout') && (id || url.search)) {
    return {
      checkoutSessionId: readCheckoutSessionId(url) ?? id,
      eventId: url.searchParams.get('eventId') ?? undefined,
      kind: 'payment',
      paymentId: url.searchParams.get('paymentId') ?? undefined,
      paymentStatus: readPaymentStatus(url),
      rawUrl,
    };
  }

  if ((section === 'notifications' || section === 'notification') && id) {
    return {
      kind: 'notification',
      notificationId: id,
      rawUrl,
    };
  }

  if (section === 'dashboard' || section === 'login' || section === 'profile' || section === 'launch') {
    return {
      kind: 'profile',
      rawUrl,
      reason: readPaymentStatus(url),
    };
  }

  return {
    kind: 'unknown',
    message: 'That Samgamam link is not available in the mobile app yet.',
    rawUrl,
  };
}

export function describeRoute(route: MobileRoute) {
  switch (route.kind) {
    case 'conversation':
      return 'this private event conversation';
    case 'event':
      return route.openGallery ? 'this event gallery' : 'this event';
    case 'gallery':
      return 'this event gallery';
    case 'group':
      return 'this community';
    case 'payment':
      return 'this payment status';
    case 'notification':
      return 'this notification';
    case 'profile':
      return 'your profile';
    case 'unknown':
      return 'this link';
  }
}
