export type NavigationTarget =
  | { type: 'event'; id: string }
  | { type: 'group'; id: string }
  | { type: 'notification' }
  | { type: 'discover' }
  | { type: 'groups' }
  | { type: 'unknown'; raw?: string };

export function parseDeepLinkUrl(url: string | null | undefined): NavigationTarget {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown' };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { type: 'unknown' };
  }

  // Handle samgamam:// custom scheme
  if (trimmed.startsWith('samgamam://')) {
    const withoutScheme = trimmed.replace(/^samgamam:\/\//, '');
    const parts = withoutScheme.split('?')[0].split('#')[0].split('/').filter(Boolean);

    if (parts.length === 0) {
      return { type: 'discover' };
    }

    const [route, param] = parts;
    if (route === 'event' || route === 'events') {
      return param ? { type: 'event', id: param } : { type: 'discover' };
    }
    if (route === 'group' || route === 'groups') {
      return param ? { type: 'group', id: param } : { type: 'groups' };
    }
    if (route === 'notifications' || route === 'notification') {
      return { type: 'notification' };
    }
    if (route === 'discover') {
      return { type: 'discover' };
    }
    return { type: 'unknown', raw: trimmed };
  }

  // Handle path-like or HTTP/HTTPS URLs
  try {
    let pathname = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      pathname = parsed.pathname;
    }

    const segments = pathname.split('/').filter(Boolean);
    // Ignore locale prefix if present (e.g. /en/events/123 -> events, 123)
    let startIndex = 0;
    if (segments.length > 0 && /^[a-z]{2}(-[A-Z]{2})?$/.test(segments[0])) {
      startIndex = 1;
    }

    const route = segments[startIndex];
    const param = segments[startIndex + 1];

    if (route === 'events' || route === 'event') {
      return param ? { type: 'event', id: param } : { type: 'discover' };
    }
    if (route === 'groups' || route === 'group') {
      return param ? { type: 'group', id: param } : { type: 'groups' };
    }
    if (route === 'notifications' || route === 'notification') {
      return { type: 'notification' };
    }
  } catch {
    // Malformed URL falls through to unknown
  }

  return { type: 'unknown', raw: trimmed };
}

export function parseNotificationData(data: unknown): NavigationTarget {
  if (!data || typeof data !== 'object') {
    return { type: 'unknown' };
  }

  const payload = data as Record<string, unknown>;

  // Check explicit structured entityType & entityId
  if (typeof payload.entityType === 'string') {
    const entityType = payload.entityType.toLowerCase();
    const entityId = typeof payload.entityId === 'string' ? payload.entityId.trim() : null;

    if (entityType === 'event' && entityId) {
      return { type: 'event', id: entityId };
    }
    if (entityType === 'group' && entityId) {
      return { type: 'group', id: entityId };
    }
    if (entityType === 'notification') {
      return { type: 'notification' };
    }
  }

  // Fallback to url field
  if (typeof payload.url === 'string' && payload.url.trim().length > 0) {
    return parseDeepLinkUrl(payload.url);
  }

  if (typeof payload.targetUrl === 'string' && payload.targetUrl.trim().length > 0) {
    return parseDeepLinkUrl(payload.targetUrl);
  }

  return { type: 'unknown' };
}
