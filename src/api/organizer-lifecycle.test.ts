import { apiClient } from "./client";
import type {
  AnalyticsOverview,
  AttendanceScanResult,
  AttendeeItem,
  EventAnalytics,
  EventSummary,
  GroupMemberItem,
} from "./types";

function mockJsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Mobile Organizer Lifecycle (Phase 6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("1. fetches organizer-scoped events and analytics overview", async () => {
    const mockOverview: AnalyticsOverview = {
      eventsPublished: 2,
      totalViews: 450,
      totalRsvps: 35,
      averageConversionRate: 0.077,
      eventStats: [
        {
          eventId: "berlin-founders-brunch",
          views: 300,
          clicks: 120,
          rsvps: 25,
          conversionRate: 0.083,
          event: {
            id: "berlin-founders-brunch",
            groupId: "tech-founders-berlin",
            title: "Berlin Founders Brunch",
            description: "Monthly get-together for founders.",
            tags: ["founders", "networking"],
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
          },
        },
      ],
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse(mockOverview)
    );

    const result = await apiClient.getOrganizerEvents();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/analytics"),
      expect.anything()
    );
    expect(result.events.length).toBe(1);
    expect(result.events[0].id).toBe("berlin-founders-brunch");
    expect(result.overview.eventsPublished).toBe(2);
  });

  it("2. retrieves real attendee roster for an organizer event", async () => {
    const mockAttendees: AttendeeItem[] = [
      {
        userId: "user-alex-1",
        fullName: "Alex Chen",
        email: "alex@example.local",
        state: "going",
        checkedIn: false,
        createdAt: "2026-09-01T12:00:00.000Z",
      },
      {
        userId: "user-maya-2",
        fullName: "Maya Lin",
        email: "maya@example.local",
        state: "going",
        checkedIn: true,
        checkedInAt: "2026-09-10T10:15:00.000Z",
        createdAt: "2026-09-01T13:00:00.000Z",
      },
      {
        userId: "user-sam-3",
        fullName: "Sam Miller",
        state: "waitlist",
        checkedIn: false,
        createdAt: "2026-09-02T09:00:00.000Z",
      },
    ];

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ attendees: mockAttendees })
    );

    const result = await apiClient.getEventAttendees("berlin-founders-brunch");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch/attendees"),
      expect.anything()
    );
    expect(result.attendees.length).toBe(3);
    expect(result.attendees[0].fullName).toBe("Alex Chen");
    expect(result.attendees[1].checkedIn).toBe(true);
  });

  it("3. validates ticket QR token and performs attendance scan", async () => {
    const mockScanSuccess: AttendanceScanResult = {
      status: "success",
      attendee: {
        userId: "user-alex-1",
        fullName: "Alex Chen",
        eventTitle: "Berlin Founders Brunch",
        checkedInAt: "2026-09-19T10:00:00.000Z",
      },
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ result: mockScanSuccess })
    );

    const result = await apiClient.scanTicket("berlin-founders-brunch", "sample-signed-token-xyz");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch/attendance/scan"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "sample-signed-token-xyz" }),
      })
    );
    expect(result.status).toBe("success");
    expect(result.attendee?.fullName).toBe("Alex Chen");
  });

  it("4. handles duplicate scan safely with already_checked_in status", async () => {
    const mockDuplicateScan: AttendanceScanResult = {
      status: "already_checked_in",
      attendee: {
        userId: "user-alex-1",
        fullName: "Alex Chen",
        eventTitle: "Berlin Founders Brunch",
        checkedInAt: "2026-09-19T10:00:00.000Z",
      },
      scannedAt: "2026-09-19T10:05:00.000Z",
    };

    jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ result: mockDuplicateScan })
    );

    const result = await apiClient.scanTicket("berlin-founders-brunch", "sample-signed-token-xyz");
    expect(result.status).toBe("already_checked_in");
    expect(result.attendee?.fullName).toBe("Alex Chen");
  });

  it("5. handles invalid / malformed ticket scans", async () => {
    const mockInvalidScan = {
      error: { code: "invalid_ticket", message: "Ticket signature is invalid." },
    };

    jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse(mockInvalidScan, 422)
    );

    await expect(apiClient.scanTicket("berlin-founders-brunch", "bad-token")).rejects.toThrow();
  });

  it("6. performs manual check-in and undo check-in via PATCH attendance", async () => {
    // Manual Check-In
    const fetchMock1 = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({
        rsvp: {
          id: "rsvp-1",
          userId: "user-alex-1",
          state: "going",
          checkedIn: true,
          checkedInAt: "2026-09-19T10:10:00.000Z",
        },
      })
    );

    const checkInRes = await apiClient.markAttendance("berlin-founders-brunch", "user-alex-1", true);
    expect(fetchMock1).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch/attendance"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ userId: "user-alex-1", checkedIn: true }),
      })
    );
    expect(checkInRes.rsvp.checkedIn).toBe(true);

    // Undo Check-In
    const fetchMock2 = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({
        rsvp: {
          id: "rsvp-1",
          userId: "user-alex-1",
          state: "going",
          checkedIn: false,
        },
      })
    );

    const undoRes = await apiClient.markAttendance("berlin-founders-brunch", "user-alex-1", false);
    expect(fetchMock2).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch/attendance"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ userId: "user-alex-1", checkedIn: false }),
      })
    );
    expect(undoRes.rsvp.checkedIn).toBe(false);
  });

  it("7. retrieves scoped event analytics", async () => {
    const mockEventAnalytics: EventAnalytics = {
      eventId: "berlin-founders-brunch",
      views: 320,
      clicks: 140,
      rsvps: 25,
      shares: 18,
      conversionRate: 0.078,
      checkedInCount: 15,
      totalScans: 16,
      failedScans: 1,
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse(mockEventAnalytics)
    );

    const result = await apiClient.getEventAnalytics("berlin-founders-brunch");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/analytics?eventId=berlin-founders-brunch"),
      expect.anything()
    );
    expect(result.views).toBe(320);
    expect(result.checkedInCount).toBe(15);
  });

  it("8. updates event details with version concurrency", async () => {
    const updatedEvent: EventSummary = {
      id: "berlin-founders-brunch",
      groupId: "tech-founders-berlin",
      title: "Updated Berlin Founders Brunch",
      description: "Updated description for founders.",
      tags: ["founders"],
      category: "business",
      languages: ["en"],
      location: "New Venue Berlin",
      startsAt: "2030-05-10T10:00:00.000Z",
      ticketPriceCents: 0,
      currency: "EUR",
      isPaid: false,
      capacity: 50,
      goingCount: 25,
      waitlistCount: 0,
      status: "published",
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ event: updatedEvent, noOp: false })
    );

    const result = await apiClient.updateEvent("berlin-founders-brunch", {
      title: "Updated Berlin Founders Brunch",
      location: "New Venue Berlin",
      capacity: 50,
      version: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Updated Berlin Founders Brunch",
          location: "New Venue Berlin",
          capacity: 50,
          version: 1,
        }),
      })
    );
    expect(result.event.title).toBe("Updated Berlin Founders Brunch");
    expect(result.event.capacity).toBe(50);
  });

  it("9. cancels an event with reason and audit trail", async () => {
    const cancelledEvent: EventSummary = {
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
      waitlistCount: 0,
      status: "cancelled",
      cancellationReason: "Venue unavailable due to water damage.",
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ event: cancelledEvent, alreadyCancelled: false })
    );

    const result = await apiClient.cancelEvent("berlin-founders-brunch", {
      cancellationReason: "Venue unavailable due to water damage.",
      version: 2,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch/cancel"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          cancellationReason: "Venue unavailable due to water damage.",
          version: 2,
        }),
      })
    );
    expect(result.event.status).toBe("cancelled");
    expect(result.event.cancellationReason).toBe("Venue unavailable due to water damage.");
  });

  it("10. publishes an event announcement to thread and notifies attendees", async () => {
    const mockPost = {
      id: "post-announcement-1",
      authorId: "vipin-demo",
      authorName: "Vipin",
      body: "Important update: Please arrive 15 minutes early for badge collection.",
      pinned: true,
      createdAt: "2026-09-19T11:00:00.000Z",
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ post: mockPost }, 201)
    );

    const result = await apiClient.sendAnnouncement("berlin-founders-brunch", {
      body: "Important update: Please arrive 15 minutes early for badge collection.",
      pinned: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/berlin-founders-brunch/threads"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          body: "Important update: Please arrive 15 minutes early for badge collection.",
          pinned: true,
          kind: "announcement",
        }),
      })
    );
    expect(result.post.pinned).toBe(true);
    expect(result.post.body).toContain("Please arrive 15 minutes early");
  });

  it("11. manages community membership approvals and rejections", async () => {
    // 1. List pending requests
    const mockMembers: GroupMemberItem[] = [
      {
        userId: "applicant-101",
        role: "member",
        status: "pending",
        joinedAt: "2026-09-18T14:00:00.000Z",
      },
    ];

    const fetchMock1 = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({ data: mockMembers, meta: { requestId: "req-1" } })
    );

    const listRes = await apiClient.getGroupMembers("tech-founders-berlin", "pending");
    expect(fetchMock1).toHaveBeenCalledWith(
      expect.stringContaining("/v1/groups/tech-founders-berlin/members?status=pending"),
      expect.anything()
    );
    expect(listRes.data.length).toBe(1);
    expect(listRes.data[0].userId).toBe("applicant-101");

    // 2. Approve pending request
    const fetchMock2 = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({
        data: {
          groupId: "tech-founders-berlin",
          targetUserId: "applicant-101",
          status: "active",
          role: "member",
        },
        meta: { requestId: "req-2" },
      })
    );

    const approveRes = await apiClient.updateGroupMemberStatus(
      "tech-founders-berlin",
      "applicant-101",
      "approve"
    );
    expect(fetchMock2).toHaveBeenCalledWith(
      expect.stringContaining("/v1/groups/tech-founders-berlin/members"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetUserId: "applicant-101", action: "approve" }),
      })
    );
    expect(approveRes.data.status).toBe("active");

    // 3. Reject pending request
    const fetchMock3 = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse({
        data: {
          groupId: "tech-founders-berlin",
          targetUserId: "applicant-102",
          status: "rejected",
          role: "member",
        },
        meta: { requestId: "req-3" },
      })
    );

    const rejectRes = await apiClient.updateGroupMemberStatus(
      "tech-founders-berlin",
      "applicant-102",
      "reject"
    );
    expect(fetchMock3).toHaveBeenCalledWith(
      expect.stringContaining("/v1/groups/tech-founders-berlin/members"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetUserId: "applicant-102", action: "reject" }),
      })
    );
    expect(rejectRes.data.status).toBe("rejected");
  });

  it("12. asks Copilot with real event context and requires human review", async () => {
    const mockCopilotResponse = {
      content: "Draft Reminder: Don't forget to bring your laptops for the hack session at Berlin Mitte!",
      logId: "ai-log-9876",
      requiresHumanReview: true,
    };

    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValueOnce(
      mockJsonResponse(mockCopilotResponse)
    );

    const result = await apiClient.askCopilotForEvent(
      "suggest_description",
      "Draft a friendly reminder to bring laptops.",
      {
        title: "Berlin Founders Brunch",
        location: "Berlin Mitte",
        description: "Monthly get-together.",
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/ai/copilot"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Berlin Founders Brunch"),
      })
    );
    expect(result.content).toContain("Draft Reminder");
    expect(result.requiresHumanReview).toBe(true);
  });
});
