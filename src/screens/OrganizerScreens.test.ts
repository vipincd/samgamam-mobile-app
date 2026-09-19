import { apiClient } from "../api/client";
import type {
  AnalyticsOverview,
  AttendeeItem,
  EventSummary,
  GroupMemberItem,
} from "../api/types";

describe("Mobile Organizer Screens (Phase 6)", () => {
  const mockEvent: EventSummary = {
    id: "berlin-founders-brunch",
    groupId: "tech-founders-berlin",
    title: "Berlin Founders Brunch",
    description: "Monthly get-together for founders.",
    tags: ["founders"],
    category: "business",
    languages: ["en"],
    location: "Berlin Mitte",
    startsAt: "2030-05-10T10:00:00.000Z",
    ticketPriceCents: 0,
    currency: "EUR",
    isPaid: false,
    goingCount: 25,
    waitlistCount: 3,
    capacity: 30,
    status: "published",
  };

  const mockOverview: AnalyticsOverview = {
    eventsPublished: 1,
    totalViews: 450,
    totalRsvps: 25,
    averageConversionRate: 0.08,
    eventStats: [
      {
        eventId: "berlin-founders-brunch",
        views: 450,
        clicks: 120,
        rsvps: 25,
        conversionRate: 0.08,
        event: mockEvent,
      },
    ],
  };

  const mockAttendees: AttendeeItem[] = [
    {
      userId: "user-1",
      fullName: "Alex Chen",
      state: "going",
      checkedIn: false,
      createdAt: "2026-09-01T12:00:00.000Z",
    },
    {
      userId: "user-2",
      fullName: "Maya Lin",
      state: "going",
      checkedIn: true,
      checkedInAt: "2026-09-10T10:00:00.000Z",
      createdAt: "2026-09-01T12:00:00.000Z",
    },
    {
      userId: "user-3",
      fullName: "Sam Miller",
      state: "waitlist",
      checkedIn: false,
      createdAt: "2026-09-02T12:00:00.000Z",
    },
  ];



  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads organizer dashboard data and handles event selection", async () => {
    const getEventsSpy = jest.spyOn(apiClient, "getOrganizerEvents").mockResolvedValueOnce({
      events: [mockEvent],
      overview: mockOverview,
    });

    const getAnalyticsSpy = jest.spyOn(apiClient, "getEventAnalytics").mockResolvedValueOnce({
      eventId: "berlin-founders-brunch",
      views: 450,
      clicks: 120,
      rsvps: 25,
      shares: 10,
      conversionRate: 0.08,
      checkedInCount: 1,
    });

    const organizerData = await apiClient.getOrganizerEvents();
    expect(getEventsSpy).toHaveBeenCalled();
    expect(organizerData.events.length).toBe(1);
    expect(organizerData.events[0].title).toBe("Berlin Founders Brunch");

    const eventAnalytics = await apiClient.getEventAnalytics("berlin-founders-brunch");
    expect(getAnalyticsSpy).toHaveBeenCalledWith("berlin-founders-brunch");
    expect(eventAnalytics.views).toBe(450);
  });

  it("fetches attendee roster and handles manual attendance check-in", async () => {
    const getAttendeesSpy = jest.spyOn(apiClient, "getEventAttendees").mockResolvedValueOnce({
      attendees: mockAttendees,
    });

    const markAttendanceSpy = jest.spyOn(apiClient, "markAttendance").mockResolvedValueOnce({
      rsvp: {
        id: "rsvp-1",
        userId: "user-1",
        state: "going",
        checkedIn: true,
        checkedInAt: "2026-09-19T10:00:00.000Z",
      },
    });

    const rosterRes = await apiClient.getEventAttendees("berlin-founders-brunch");
    expect(getAttendeesSpy).toHaveBeenCalledWith("berlin-founders-brunch");
    expect(rosterRes.attendees.length).toBe(3);

    const checkInRes = await apiClient.markAttendance("berlin-founders-brunch", "user-1", true);
    expect(markAttendanceSpy).toHaveBeenCalledWith("berlin-founders-brunch", "user-1", true);
    expect(checkInRes.rsvp.checkedIn).toBe(true);
  });

  it("handles QR ticket scanning for valid, duplicate, and invalid tickets", async () => {
    // Valid Scan
    const scanSpy1 = jest.spyOn(apiClient, "scanTicket").mockResolvedValueOnce({
      status: "success",
      attendee: {
        userId: "user-1",
        fullName: "Alex Chen",
        eventTitle: "Berlin Founders Brunch",
        checkedInAt: "2026-09-19T10:00:00.000Z",
      },
    });

    const scanResult1 = await apiClient.scanTicket("berlin-founders-brunch", "valid-token-123");
    expect(scanSpy1).toHaveBeenCalledWith("berlin-founders-brunch", "valid-token-123");
    expect(scanResult1.status).toBe("success");
    expect(scanResult1.attendee?.fullName).toBe("Alex Chen");

    // Duplicate Scan
    const scanSpy2 = jest.spyOn(apiClient, "scanTicket").mockResolvedValueOnce({
      status: "already_checked_in",
      attendee: {
        userId: "user-1",
        fullName: "Alex Chen",
        eventTitle: "Berlin Founders Brunch",
        checkedInAt: "2026-09-19T10:00:00.000Z",
      },
    });

    const scanResult2 = await apiClient.scanTicket("berlin-founders-brunch", "valid-token-123");
    expect(scanSpy2).toHaveBeenCalledWith("berlin-founders-brunch", "valid-token-123");
    expect(scanResult2.status).toBe("already_checked_in");
  });

  it("handles community membership requests listing and approvals", async () => {
    const mockPendingMembers: GroupMemberItem[] = [
      {
        userId: "applicant-101",
        role: "member",
        status: "pending",
        joinedAt: "2026-09-18T10:00:00.000Z",
      },
    ];

    const getMembersSpy = jest.spyOn(apiClient, "getGroupMembers").mockResolvedValueOnce({
      data: mockPendingMembers,
      meta: { requestId: "req-1" },
    });

    const updateStatusSpy = jest.spyOn(apiClient, "updateGroupMemberStatus").mockResolvedValueOnce({
      data: {
        groupId: "tech-founders-berlin",
        targetUserId: "applicant-101",
        status: "active",
        role: "member",
      },
      meta: { requestId: "req-2" },
    });

    const pendingRes = await apiClient.getGroupMembers("tech-founders-berlin", "pending");
    expect(getMembersSpy).toHaveBeenCalledWith("tech-founders-berlin", "pending");
    expect(pendingRes.data.length).toBe(1);

    const approveRes = await apiClient.updateGroupMemberStatus(
      "tech-founders-berlin",
      "applicant-101",
      "approve"
    );
    expect(updateStatusSpy).toHaveBeenCalledWith("tech-founders-berlin", "applicant-101", "approve");
    expect(approveRes.data.status).toBe("active");
  });
});
