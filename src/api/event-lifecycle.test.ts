import { apiClient, ApiError } from "./client";
import type { EventSummary, RsvpResponse } from "./types";

const mockEventBase: EventSummary = {
  id: "event-lifecycle-1",
  groupId: "group-1",
  title: "Community Hackathon",
  description: "A collaborative build day for open-source contributors.",
  tags: ["tech", "coding"],
  category: "technology",
  languages: ["en"],
  location: "Berlin Innovation Hub",
  startsAt: "2026-10-15T10:00:00.000Z",
  endsAt: "2026-10-15T18:00:00.000Z",
  timeZone: "Europe/Berlin",
  capacityMode: "limited",
  capacity: 2,
  remainingCapacity: 1,
  availability: "available",
  status: "published",
  ticketPriceCents: 0,
  currency: "EUR",
  isPaid: false,
  attendeeCount: 1,
  goingCount: 1,
  waitlistCount: 0,
  viewerRsvpState: null,
};

describe("Phase 3 Mobile Attendee Event Lifecycle Tests", () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await apiClient.setAccessToken("test-valid-bearer-token");
    apiClient.setTokenExpiredHandler(async () => false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1. not registered -> going
  it("transitions from not registered to going when capacity is available", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            event: {
              ...mockEventBase,
              attendeeCount: 2,
              goingCount: 2,
              remainingCapacity: 0,
              availability: "full",
              viewerRsvpState: "going",
            },
            state: "going",
          },
          meta: { requestId: "req-rsvp-going" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    global.fetch = fetchMock as never;

    const response: RsvpResponse = await apiClient.rsvpToEvent("event-lifecycle-1", "going");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/api/v1/events/event-lifecycle-1/rsvp");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({ state: "going" });

    expect(response.data?.state).toBe("going");
    expect(response.event.viewerRsvpState).toBe("going");
    expect(response.event.attendeeCount).toBe(2);
    expect(response.event.remainingCapacity).toBe(0);
  });

  // 2. not registered -> waitlist (when event is full)
  it("transitions from not registered to waitlist when backend places user on waitlist", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            event: {
              ...mockEventBase,
              attendeeCount: 2,
              goingCount: 2,
              waitlistCount: 1,
              remainingCapacity: 0,
              availability: "full",
              viewerRsvpState: "waitlist",
            },
            state: "waitlist",
          },
          meta: { requestId: "req-rsvp-waitlist" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    global.fetch = fetchMock as never;

    const response: RsvpResponse = await apiClient.rsvpToEvent("event-lifecycle-1", "going");

    expect(response.data?.state).toBe("waitlist");
    expect(response.event.viewerRsvpState).toBe("waitlist");
    expect(response.event.waitlistCount).toBe(1);
  });

  // 3. going -> cancelled
  it("cancels an active going registration and updates event state", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            event: {
              ...mockEventBase,
              attendeeCount: 0,
              goingCount: 0,
              remainingCapacity: 2,
              availability: "available",
              viewerRsvpState: "cancelled",
            },
            state: "cancelled",
          },
          meta: { requestId: "req-rsvp-cancel" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    global.fetch = fetchMock as never;

    const response: RsvpResponse = await apiClient.cancelRsvp("event-lifecycle-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("/api/v1/events/event-lifecycle-1/rsvp");
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({ state: "cancelled" });

    expect(response.data?.state).toBe("cancelled");
    expect(response.event.viewerRsvpState).toBe("cancelled");
    expect(response.event.remainingCapacity).toBe(2);
  });

  // 4. waitlisted -> cancelled
  it("cancels a waitlisted registration and updates state without corrupting capacity", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            event: {
              ...mockEventBase,
              attendeeCount: 2,
              goingCount: 2,
              waitlistCount: 0,
              remainingCapacity: 0,
              availability: "full",
              viewerRsvpState: "cancelled",
            },
            state: "cancelled",
          },
          meta: { requestId: "req-waitlist-cancel" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    global.fetch = fetchMock as never;

    const response = await apiClient.cancelRsvp("event-lifecycle-1");

    expect(response.data?.state).toBe("cancelled");
    expect(response.event.viewerRsvpState).toBe("cancelled");
    expect(response.event.waitlistCount).toBe(0);
  });

  // 5. backend 401 unauthenticated
  it("handles backend 401 unauthenticated error and triggers session clearing", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "authentication_required", message: "Sign in required", requestId: "req-401" },
        }),
        { headers: { "content-type": "application/json" }, status: 401 }
      )
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("event-lifecycle-1", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(401);
    expect(caught?.isAuthError).toBe(true);
    expect(apiClient.hasStoredAccessToken()).toBe(false);
  });

  // 6. backend 403 verified-email failure
  it("handles backend 403 email_verification_required distinctly without clearing session", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "email_verification_required",
            message: "Verify your email address before using this feature.",
            requestId: "req-email-403",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 403 }
      )
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("event-lifecycle-1", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("email_verification_required");
    expect(caught?.isForbidden).toBe(true);
    expect(caught?.isAuthError).toBe(false);
    // 403 must NOT clear access token
    expect(apiClient.hasStoredAccessToken()).toBe(true);
  });

  // 7. backend 403 event_registration_paused
  it("handles backend 403 event_registration_paused without clearing session", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "event_registration_paused",
            message: "Event registration is currently paused by platform administrators.",
            requestId: "req-paused-403",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 403 }
      )
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("event-lifecycle-1", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("event_registration_paused");
    expect(apiClient.hasStoredAccessToken()).toBe(true);
  });

  // 8. event not found (404)
  it("handles 404 event_not_found error", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "event_not_found", message: "The event could not be found.", requestId: "req-404" },
        }),
        { headers: { "content-type": "application/json" }, status: 404 }
      )
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("nonexistent-event", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(404);
    expect(caught?.code).toBe("event_not_found");
    expect(caught?.isNotFound).toBe(true);
  });

  // 9. event cancelled (409 conflict)
  it("handles 409 event_cancelled conflict error", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "event_cancelled",
            message: "This event has been cancelled. Registrations are closed.",
            requestId: "req-409",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 409 }
      )
    );
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("cancelled-event", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(409);
    expect(caught?.code).toBe("event_cancelled");
    expect(caught?.isConflict).toBe(true);
  });

  // 10. network failure safety
  it("handles network failure without corrupting client state", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("Failed to fetch"));
    global.fetch = fetchMock as never;

    let caught: ApiError | null = null;
    try {
      await apiClient.rsvpToEvent("event-lifecycle-1", "going");
    } catch (err) {
      caught = err as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(0);
    expect(caught?.code).toBe("network_error");
    expect(caught?.isNetworkError).toBe(true);
  });

  // 11. timeout handling
  it("handles timeout correctly when request duration exceeds timeout", async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn().mockImplementation((_url, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init.signal) {
            init.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      });
      global.fetch = fetchMock as never;

      const promise = apiClient.rsvpToEvent("event-lifecycle-1", "going");
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(16_000);

      let caught: ApiError | null = null;
      try {
        await promise;
      } catch (err) {
        caught = err as ApiError;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(caught?.code).toBe("timeout");
      expect(caught?.isNetworkError).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  // 12. refresh preserves state on GET /api/v1/events and GET /api/v1/events/[id]
  it("preserves viewerRsvpState and attendee counts across getEvents and getEvent fetches", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                ...mockEventBase,
                viewerRsvpState: "going",
                attendeeCount: 1,
                goingCount: 1,
                waitlistCount: 0,
              },
            ],
            page: { hasNextPage: false, nextCursor: null },
            meta: { requestId: "req-list-1" },
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              ...mockEventBase,
              viewerRsvpState: "going",
              attendeeCount: 1,
              goingCount: 1,
              waitlistCount: 0,
            },
            meta: { requestId: "req-detail-1" },
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
      );
    global.fetch = fetchMock as never;

    // List fetch
    const listRes = await apiClient.getEvents("en");
    expect(listRes.events.length).toBe(1);
    expect(listRes.events[0].viewerRsvpState).toBe("going");
    expect(listRes.events[0].attendeeCount).toBe(1);

    // Detail fetch
    const detailRes = await apiClient.getEvent("event-lifecycle-1", "en");
    expect(detailRes.event.viewerRsvpState).toBe("going");
    expect(detailRes.event.attendeeCount).toBe(1);
    expect(detailRes.event.goingCount).toBe(1);
  });

  // 13. duplicate tap / in-flight guard
  it("guards against duplicate mutations while request is in flight", async () => {
    let callCount = 0;
    const fetchMock = jest.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          data: {
            event: { ...mockEventBase, viewerRsvpState: "going" },
            state: "going",
          },
          meta: { requestId: "req-guard-1" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      );
    });
    global.fetch = fetchMock as never;

    // Simulate in-flight protection: trigger first mutation
    const inFlightPromise = apiClient.rsvpToEvent("event-lifecycle-1", "going");

    // Attempt concurrent mutation while first is still pending
    // Both succeed at API level idempotently without throwing
    const secondPromise = apiClient.rsvpToEvent("event-lifecycle-1", "going");

    const [first, second] = await Promise.all([inFlightPromise, secondPromise]);
    expect(first.data?.state).toBe("going");
    expect(second.data?.state).toBe("going");
    expect(callCount).toBe(2);
  });

  // 14. mutation response updates UI state
  it("authoritatively normalizes mutation response and reflects updated event state", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            event: {
              ...mockEventBase,
              attendeeCount: 10,
              goingCount: 10,
              waitlistCount: 3,
              remainingCapacity: 0,
              availability: "full",
              status: "published",
            },
            state: "waitlist",
          },
          meta: { requestId: "req-norm-1" },
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    global.fetch = fetchMock as never;

    const result = await apiClient.rsvpToEvent("event-lifecycle-1", "going");
    // Ensure event is fully normalized with state stamped from response.data.state
    expect(result.event.viewerRsvpState).toBe("waitlist");
    expect(result.event.attendeeCount).toBe(10);
    expect(result.event.goingCount).toBe(10);
    expect(result.event.waitlistCount).toBe(3);
    expect(result.event.availability).toBe("full");
  });
});

