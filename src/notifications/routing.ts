import type {NotificationItem} from '../api/types';
import {parseSamgamamRoute, type MobileRoute} from '../navigation/deepLinks';

export function resolveNotificationRoute(notification: NotificationItem): MobileRoute {
  if (notification.targetUrl) {
    const parsed = parseSamgamamRoute(notification.targetUrl);

    if (parsed) {
      return parsed;
    }
  }

  return {
    kind: 'notification',
    notificationId: notification.id,
    rawUrl: notification.targetUrl ?? `/notifications/${notification.id}`,
  };
}

export function notificationRouteLabel(notification: NotificationItem) {
  if (!notification.targetUrl) {
    return 'No destination';
  }

  const route = resolveNotificationRoute(notification);

  switch (route.kind) {
    case 'conversation':
      return 'Open conversation';
    case 'event':
      return route.openGallery ? 'Open gallery' : 'Open event';
    case 'gallery':
      return 'Open gallery';
    case 'group':
      return 'Open community';
    case 'payment':
      return 'Open payment';
    case 'profile':
      return 'Open profile';
    case 'notification':
      return 'Open notification';
    case 'unknown':
      return 'Open link';
  }
}
