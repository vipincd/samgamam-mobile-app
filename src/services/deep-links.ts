export type NavigationTarget =
  | { type: 'event'; id: string }
  | { type: 'group'; id: string }
  | { type: 'notification' }
  | { type: 'discover' }
  | { type: 'groups' }
  | { type: 'unknown'; raw?: string };

// Event and group IDs are UUIDs or slugs. Anything else (dot segments, encoded
// separators) is rejected before it can reach an API path.
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WEB_LINK_HOSTS = new Set(['samgamam.com', 'www.samgamam.com']);
const LOCALE_SEGMENT = /^[a-z]{2}(-[A-Z]{2})?$/;

// Parsed with explicit patterns rather than `URL`: React Native's `URL` is
// regex-based and diverges from the WHATWG parser Jest runs on (userinfo,
// dot-segment normalisation), so tests would not reflect device behaviour.
const CUSTOM_SCHEME_LINK = /^samgamam:\/\/([^?#]*)(?:\?[^#]*)?(?:#.*)?$/i;
const WEB_LINK = /^https:\/\/([^/?#]*)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i;
const PATH_LINK = /^(\/[^?#]*)(?:\?[^#]*)?(?:#.*)?$/;

function entityTarget(type: 'event' | 'group', id: string, raw?: string): NavigationTarget {
  return ENTITY_ID_PATTERN.test(id) ? { type, id } : { type: 'unknown', ...(raw ? { raw } : {}) };
}

// A link resolves only when its segments are exactly `route` or `route/id`
// (plus one optional trailing slash); extra, empty or nested segments fail closed.
function routeTarget(segments: string[], raw: string): NavigationTarget {
  if (segments.length > 1 && segments[segments.length - 1] === '') {
    segments = segments.slice(0, -1);
  }
  if (segments.length === 0 || segments.length > 2 || segments.includes('')) {
    return { type: 'unknown', raw };
  }

  const [route, param] = segments;
  if (route === 'event' || route === 'events') {
    return param === undefined ? { type: 'discover' } : entityTarget('event', param, raw);
  }
  if (route === 'group' || route === 'groups') {
    return param === undefined ? { type: 'groups' } : entityTarget('group', param, raw);
  }
  if (param !== undefined) {
    return { type: 'unknown', raw };
  }
  if (route === 'notifications' || route === 'notification') {
    return { type: 'notification' };
  }
  if (route === 'discover') {
    return { type: 'discover' };
  }
  return { type: 'unknown', raw };
}

function webPathTarget(pathname: string, raw: string): NavigationTarget {
  // pathname always starts with '/'; '//host' style paths leave an empty first segment.
  const segments = pathname.slice(1).split('/');
  // Ignore locale prefix if present (e.g. /en/events/123 -> events, 123)
  return routeTarget(LOCALE_SEGMENT.test(segments[0]) ? segments.slice(1) : segments, raw);
}

export function parseDeepLinkUrl(url: string | null | undefined): NavigationTarget {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown' };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { type: 'unknown' };
  }

  const custom = CUSTOM_SCHEME_LINK.exec(trimmed);
  if (custom) {
    return custom[1] === '' ? { type: 'discover' } : routeTarget(custom[1].split('/'), trimmed);
  }

  // Only HTTPS links on the default port of an approved host, without userinfo.
  const web = WEB_LINK.exec(trimmed);
  if (web) {
    if (!WEB_LINK_HOSTS.has(web[1].toLowerCase())) {
      return { type: 'unknown', raw: trimmed };
    }
    return webPathTarget(web[2] ?? '/', trimmed);
  }

  const path = PATH_LINK.exec(trimmed);
  if (path && !trimmed.startsWith('//')) {
    return webPathTarget(path[1], trimmed);
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
      return entityTarget('event', entityId);
    }
    if (entityType === 'group' && entityId) {
      return entityTarget('group', entityId);
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
