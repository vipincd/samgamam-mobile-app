import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { apiClient } from "../api/client";
import {
  parseDeepLinkUrl,
  parseNotificationData,
  } from "./deep-links";
import {
  checkPushPermissionAsync,
  requestPushPermissionAsync,
  registerDevicePushTokenAsync,
  unregisterDeviceOnLogoutAsync,
  getOrCreateDeviceId,
  configureForegroundNotifications,
  addNotificationResponseListener,
  checkColdStartNotificationAsync,
} from "./notifications";
import type { EventSummary, GroupSummary, DiscussionPost, NotificationItem } from "../api/types";

describe("Deep-Link & Push Payload Parser", () => {
  it("parses custom scheme event URLs", () => {
    expect(parseDeepLinkUrl("samgamam://event/event-123")).toEqual({
      type: "event",
      id: "event-123",
    });
    expect(parseDeepLinkUrl("samgamam://events/event-456")).toEqual({
      type: "event",
      id: "event-456",
    });
  });

  it("parses custom scheme group URLs", () => {
    expect(parseDeepLinkUrl("samgamam://group/group-789")).toEqual({
      type: "group",
      id: "group-789",
    });
    expect(parseDeepLinkUrl("samgamam://groups/group-abc")).toEqual({
      type: "group",
      id: "group-abc",
    });
  });

  it("parses notifications, discover, and groups tab routes", () => {
    expect(parseDeepLinkUrl("samgamam://notifications")).toEqual({
      type: "notification",
    });
    expect(parseDeepLinkUrl("samgamam://discover")).toEqual({
      type: "discover",
    });
    expect(parseDeepLinkUrl("samgamam://groups")).toEqual({
      type: "groups",
    });
    expect(parseDeepLinkUrl("samgamam://")).toEqual({
      type: "discover",
    });
  });

  it("parses web URLs and relative paths with and without locale prefixes", () => {
    expect(parseDeepLinkUrl("/events/event-web-1")).toEqual({
      type: "event",
      id: "event-web-1",
    });
    expect(parseDeepLinkUrl("https://samgamam.com/en/events/event-web-2")).toEqual({
      type: "event",
      id: "event-web-2",
    });
    expect(parseDeepLinkUrl("https://samgamam.com/de/groups/group-web-de")).toEqual({
      type: "group",
      id: "group-web-de",
    });
    expect(parseDeepLinkUrl("/groups/group-web-1")).toEqual({
      type: "group",
      id: "group-web-1",
    });
    expect(parseDeepLinkUrl("/notifications")).toEqual({
      type: "notification",
    });
  });

  it("safely handles malformed and empty URLs without throwing", () => {
    expect(parseDeepLinkUrl(null)).toEqual({ type: "unknown" });
    expect(parseDeepLinkUrl("")).toEqual({ type: "unknown" });
    expect(parseDeepLinkUrl("   ")).toEqual({ type: "unknown" });
    expect(parseDeepLinkUrl("invalid-url-scheme")).toEqual({ type: "unknown", raw: "invalid-url-scheme" });
    expect(parseDeepLinkUrl("samgamam://unknown/path")).toEqual({ type: "unknown", raw: "samgamam://unknown/path" });
  });

  it("parses structured notification payloads with entityType and entityId", () => {
    expect(parseNotificationData({ entityType: "event", entityId: "event-push-1" })).toEqual({
      type: "event",
      id: "event-push-1",
    });
    expect(parseNotificationData({ entityType: "group", entityId: "group-push-1" })).toEqual({
      type: "group",
      id: "group-push-1",
    });
    expect(parseNotificationData({ entityType: "notification" })).toEqual({
      type: "notification",
    });
    expect(parseNotificationData({ url: "samgamam://event/ev-from-url" })).toEqual({
      type: "event",
      id: "ev-from-url",
    });
    expect(parseNotificationData({ targetUrl: "/groups/grp-from-target" })).toEqual({
      type: "group",
      id: "grp-from-target",
    });
    expect(parseNotificationData(null)).toEqual({ type: "unknown" });
    expect(parseNotificationData({})).toEqual({ type: "unknown" });
    expect(parseNotificationData({ randomField: "nothing" })).toEqual({ type: "unknown" });
    expect(parseNotificationData({ entityType: "unknownType", entityId: "123" })).toEqual({ type: "unknown" });
  });
});

describe("Push Notifications & Device Registration Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore as unknown as { _clear?: () => void })._clear?.();
    Platform.OS = "ios";
  });

  it("generates and stores persistent deviceId in SecureStore", async () => {
    const deviceId1 = await getOrCreateDeviceId();
    expect(deviceId1).toBeDefined();
    expect(deviceId1.startsWith("dev-")).toBe(true);

    const deviceId2 = await getOrCreateDeviceId();
    expect(deviceId2).toBe(deviceId1);
  });

  it("checks and requests push permissions correctly across states", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "granted",
      granted: true,
    });
    const status = await checkPushPermissionAsync();
    expect(status).toBe("granted");

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "denied",
      granted: false,
    });
    expect(await checkPushPermissionAsync()).toBe("denied");

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "undetermined",
      granted: false,
    });
    expect(await checkPushPermissionAsync()).toBe("undetermined");

    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "granted",
      granted: true,
    });
    expect(await requestPushPermissionAsync()).toBe("granted");
  });

  it("registers device push token with backend when permissions are granted", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[unit-test-token-abcdef123]",
    });

    const registerSpy = jest.spyOn(apiClient, "registerDevice").mockResolvedValueOnce({
      data: {
        deviceId: "dev-mock-id-12345",
        platform: "ios",
        registeredAt: new Date().toISOString(),
        registered: true,
      },
      meta: { requestId: "req-1" },
    });

    const result = await registerDevicePushTokenAsync(apiClient, "user-unit-1", {
      appVersion: "1.2.0",
      locale: "ml",
    });
    expect(result.registered).toBe(true);
    expect(result.token).toBe("ExponentPushToken[unit-test-token-abcdef123]");
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "ios",
        pushToken: "ExponentPushToken[unit-test-token-abcdef123]",
        appVersion: "1.2.0",
        locale: "ml",
      })
    );
  });

  it("avoids redundant registration when token and user are unchanged", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[unit-test-token-abcdef123]",
    });

    const registerSpy = jest.spyOn(apiClient, "registerDevice");

    await SecureStore.setItemAsync("samgamam_last_registered_token", "ExponentPushToken[unit-test-token-abcdef123]");
    await SecureStore.setItemAsync("samgamam_last_registered_user", "user-unit-1");

    const result = await registerDevicePushTokenAsync(apiClient, "user-unit-1");
    expect(result.registered).toBe(true);
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it("rotates registration when token changes", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[new-rotated-token-999999]",
    });

    const registerSpy = jest.spyOn(apiClient, "registerDevice").mockResolvedValueOnce({
      data: {
        deviceId: "dev-mock-id-12345",
        platform: "ios",
        registeredAt: new Date().toISOString(),
        registered: true,
      },
      meta: { requestId: "req-2" },
    });

    await SecureStore.setItemAsync("samgamam_last_registered_token", "ExponentPushToken[old-token-000000]");
    await SecureStore.setItemAsync("samgamam_last_registered_user", "user-unit-1");

    const result = await registerDevicePushTokenAsync(apiClient, "user-unit-1");
    expect(result.registered).toBe(true);
    expect(result.token).toBe("ExponentPushToken[new-rotated-token-999999]");
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pushToken: "ExponentPushToken[new-rotated-token-999999]",
      })
    );
  });

  it("re-registers device when user changes on the same device", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: "ExponentPushToken[shared-device-token]",
    });

    const registerSpy = jest.spyOn(apiClient, "registerDevice").mockResolvedValueOnce({
      data: {
        deviceId: "dev-mock-id-12345",
        platform: "ios",
        registeredAt: new Date().toISOString(),
        registered: true,
      },
      meta: { requestId: "req-3" },
    });

    await SecureStore.setItemAsync("samgamam_last_registered_token", "ExponentPushToken[shared-device-token]");
    await SecureStore.setItemAsync("samgamam_last_registered_user", "user-previous");

    const result = await registerDevicePushTokenAsync(apiClient, "user-new");
    expect(result.registered).toBe(true);
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pushToken: "ExponentPushToken[shared-device-token]",
      })
    );
    expect(await SecureStore.getItemAsync("samgamam_last_registered_user")).toBe("user-new");
  });

  it("does not register fake tokens when permission is denied or unsupported", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
      granted: false,
    });

    const registerSpy = jest.spyOn(apiClient, "registerDevice");
    const result = await registerDevicePushTokenAsync(apiClient, "user-unit-1");

    expect(result.registered).toBe(false);
    expect(result.error).toBe("permission_not_granted");
    expect(registerSpy).not.toHaveBeenCalled();

    Platform.OS = "web";
    const webResult = await registerDevicePushTokenAsync(apiClient, "user-unit-1");
    expect(webResult.registered).toBe(false);
    expect(webResult.error).toBe("unsupported_platform");
  });

  it("safely unregisters device on logout without failing if API errors", async () => {
    await SecureStore.setItemAsync("samgamam_device_id", "dev-mock-id-12345");
    await SecureStore.setItemAsync("samgamam_last_registered_token", "ExponentPushToken[test]");
    await SecureStore.setItemAsync("samgamam_last_registered_user", "user-unit-1");

    const unregisterSpy = jest.spyOn(apiClient, "unregisterDevice").mockRejectedValueOnce(new Error("Network error"));
    const result = await unregisterDeviceOnLogoutAsync(apiClient);

    expect(result.unregistered).toBe(false);
    expect(result.error).toBe("Network error");
    expect(unregisterSpy).toHaveBeenCalledWith("dev-mock-id-12345");
    expect(await SecureStore.getItemAsync("samgamam_last_registered_token")).toBeNull();
    expect(await SecureStore.getItemAsync("samgamam_last_registered_user")).toBeNull();
  });

  it("configures foreground notification presentation options", () => {
    expect(() => configureForegroundNotifications()).not.toThrow();
    expect(Notifications.setNotificationHandler).toHaveBeenCalled();
  });

  it("attaches notification response listener and returns unsubscribe function", () => {
    const mockNavigate = jest.fn();
    const sub = addNotificationResponseListener(mockNavigate);
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("checks cold-start notification response safely", async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValueOnce({
      notification: {
        request: {
          content: {
            data: { entityType: "event", entityId: "cold-start-event-1" },
          },
        },
      },
    });

    const target = await checkColdStartNotificationAsync();
    expect(target).toEqual({
      type: "event",
      id: "cold-start-event-1",
    });
  });
});

describe("Phase 5B Mobile Deep-Link Routing & Backend Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes event notification payload to current backend event truth", async () => {
    const mockEventSummary: EventSummary = {
      id: "event-waitlist-promoted-1",
      groupId: "group-1",
      title: "Kalaripayattu Workshop",
      description: "Martial arts gathering",
      status: "published",
      startsAt: "2026-10-10T18:00:00.000Z",
      endsAt: "2026-10-10T20:00:00.000Z",
      timeZone: "Europe/Berlin",
      location: "Berlin Dojo",
      capacity: 20,
      capacityMode: "limited",
      ticketPriceCents: 0,
      currency: "EUR",
      isPaid: false,
      tags: ["culture", "workshop"],
      viewerRsvpState: "going",
      languages: ["en"],
      category: "culture",
    };

    const getEventSpy = jest.spyOn(apiClient, "getEvent").mockResolvedValueOnce({
      data: mockEventSummary,
      event: mockEventSummary,
      meta: { requestId: "req-event-1" },
    });

    const payload = {
      entityType: "event",
      entityId: "event-waitlist-promoted-1",
      title: "You are off the waitlist!",
      body: "A spot has opened up for Kalaripayattu Workshop.",
    };

    const target = parseNotificationData(payload);
    expect(target).toEqual({ type: "event", id: "event-waitlist-promoted-1" });

    if (target.type === "event") {
      const fetched = await apiClient.getEvent(target.id, "en");
      expect(getEventSpy).toHaveBeenCalledWith("event-waitlist-promoted-1", "en");
      expect(fetched.event.viewerRsvpState).toBe("going");
      expect(fetched.event.title).toBe("Kalaripayattu Workshop");
    }
  });

  it("routes group notification payload and checks active member discussions", async () => {
    const mockGroup: GroupSummary = {
      id: "group-munich-malayalees",
      name: "Munich Malayalees",
      description: "Community in Munich",
      city: "Munich",
      memberCount: 45,
      discussionCount: 12,
      languages: ["ml", "en"],
      category: "community",
      tags: ["culture"],
      requiresApproval: false,
      viewerMembershipStatus: "active",
      viewerMembershipRole: "member",
    };

    const mockDiscussions: DiscussionPost[] = [
      {
        id: "post-1",
        authorId: "user-1",
        authorName: "Anand",
        body: "Let us coordinate cooking duties.",
        pinned: false,
        createdAt: "2026-09-18T10:00:00.000Z",
      },
    ];

    const getGroupSpy = jest.spyOn(apiClient, "getGroup").mockResolvedValueOnce({
      data: mockGroup,
      group: mockGroup,
      meta: { requestId: "req-grp-1" },
    });
    const getDiscussionsSpy = jest.spyOn(apiClient, "getDiscussions").mockResolvedValueOnce({
      data: mockDiscussions,
      discussions: mockDiscussions,
      meta: { requestId: "req-disc-1" },
    });

    const pushPayload = {
      entityType: "group",
      entityId: "group-munich-malayalees",
    };

    const target = parseNotificationData(pushPayload);
    expect(target).toEqual({ type: "group", id: "group-munich-malayalees" });

    if (target.type === "group") {
      const groupData = await apiClient.getGroup(target.id, "en");
      expect(getGroupSpy).toHaveBeenCalledWith("group-munich-malayalees", "en");
      expect(groupData.group.viewerMembershipStatus).toBe("active");

      const discussionsData = await apiClient.getDiscussions(target.id, "en");
      expect(getDiscussionsSpy).toHaveBeenCalledWith("group-munich-malayalees", "en");
      expect(discussionsData.discussions.length).toBe(1);
      expect(discussionsData.discussions[0].body).toBe("Let us coordinate cooking duties.");
    }
  });

  it("handles forbidden discussion access when viewer is not an active member", async () => {
    const forbiddenError = Object.assign(new Error("Forbidden: Member-only discussion"), {
      status: 403,
      code: "forbidden",
    });

    jest.spyOn(apiClient, "getDiscussions").mockRejectedValueOnce(forbiddenError);

    await expect(apiClient.getDiscussions("group-private-1", "en")).rejects.toThrow("Forbidden");
  });

  it("handles mark-read notification flow without blocking navigation", async () => {
    const mockNotificationItem: NotificationItem = {
      id: "notif-123",
      type: "waitlist_promoted",
      status: "read",
      title: "Spot open",
      body: "You are going!",
      targetUrl: "/events/event-waitlist-promoted-1",
      createdAt: "2026-09-18T10:00:00.000Z",
    };

    const markReadSpy = jest.spyOn(apiClient, "markNotificationRead").mockResolvedValueOnce({
      notification: mockNotificationItem,
    });

    const target = parseDeepLinkUrl("/events/event-waitlist-promoted-1");
    expect(target).toEqual({ type: "event", id: "event-waitlist-promoted-1" });

    const markReadPromise = apiClient.markNotificationRead("notif-123");
    expect(target.type).toBe("event");
    const result = await markReadPromise;
    expect(markReadSpy).toHaveBeenCalledWith("notif-123");
    expect(result.notification.status).toBe("read");
  });

  it("handles deleted or missing entity notifications safely without crash", async () => {
    const notFoundError = Object.assign(new Error("Event not found"), {
      status: 404,
      code: "not_found",
    });

    jest.spyOn(apiClient, "getEvent").mockRejectedValueOnce(notFoundError);

    await expect(apiClient.getEvent("deleted-event-id")).rejects.toThrow("Event not found");
  });
});
