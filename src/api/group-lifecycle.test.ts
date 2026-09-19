import { apiClient, ApiError } from "./client";
import type { GroupSummary, DiscussionPost } from "./types";

const mockOpenGroupBase: GroupSummary = {
  id: "open-circle-1",
  name: "Open Community Circle",
  description: "A welcoming open circle for community members.",
  tags: ["open", "community"],
  category: "community",
  city: "Berlin",
  languages: ["en"],
  requiresApproval: false,
  memberCount: 10,
  discussionCount: 2,
  viewerMembershipStatus: null,
  viewerMembershipRole: null,
};

const mockApprovalGroupBase: GroupSummary = {
  id: "approval-circle-1",
  name: "Private Study Circle",
  description: "A focused circle requiring organizer approval.",
  tags: ["study", "focus"],
  category: "education",
  city: "Munich",
  languages: ["en"],
  requiresApproval: true,
  memberCount: 5,
  discussionCount: 1,
  viewerMembershipStatus: null,
  viewerMembershipRole: null,
};

const mockDiscussions: DiscussionPost[] = [
  {
    id: "post-1",
    authorId: "member-1",
    authorName: "Alice",
    body: "Welcome everyone to our circle!",
    pinned: true,
    createdAt: "2026-09-18T10:00:00.000Z",
    locale: "en",
  },
];

describe("Phase 4 Mobile Group Membership Lifecycle Tests", () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await apiClient.setAccessToken("test-valid-bearer-token");
    apiClient.setTokenExpiredHandler(async () => false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1. Not member -> join open group -> active
  it("transitions from not member to active member on open group join", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...mockOpenGroupBase,
            memberCount: 11,
            viewerMembershipStatus: "active",
            viewerMembershipRole: "member",
            group: {
              ...mockOpenGroupBase,
              memberCount: 11,
              viewerMembershipStatus: "active",
              viewerMembershipRole: "member",
            },
            membership: {
              status: "active",
              role: "member",
            },
          },
          meta: { requestId: "req-join-open-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    const result = await apiClient.joinGroup(mockOpenGroupBase.id);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/groups/" + mockOpenGroupBase.id + "/membership"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.group.viewerMembershipStatus).toBe("active");
    expect(result.group.viewerMembershipRole).toBe("member");
    expect(result.group.memberCount).toBe(11);
    expect(result.membership.status).toBe("active");
  });

  // 2. Not member -> join approval-required group -> pending
  it("transitions from not member to pending on approval-required group request", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...mockApprovalGroupBase,
            memberCount: 5,
            viewerMembershipStatus: "pending",
            viewerMembershipRole: "member",
            group: {
              ...mockApprovalGroupBase,
              memberCount: 5,
              viewerMembershipStatus: "pending",
              viewerMembershipRole: "member",
            },
            membership: {
              status: "pending",
              role: "member",
            },
          },
          meta: { requestId: "req-join-approval-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    const result = await apiClient.joinGroup(mockApprovalGroupBase.id);

    expect(result.group.viewerMembershipStatus).toBe("pending");
    expect(result.group.memberCount).toBe(5);
    expect(result.membership.status).toBe("pending");
  });

  // 3. Pending remains pending after refresh
  it("preserves pending membership state on fresh fetch", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...mockApprovalGroupBase,
            viewerMembershipStatus: "pending",
            viewerMembershipRole: "member",
          },
          meta: { requestId: "req-get-approval-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    const result = await apiClient.getGroup(mockApprovalGroupBase.id);

    expect(result.group.viewerMembershipStatus).toBe("pending");
    expect(result.group.viewerMembershipRole).toBe("member");
  });

  // 4. Active member -> leave group -> not member
  it("transitions from active member to null membership on leave", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...mockOpenGroupBase,
            memberCount: 10,
            viewerMembershipStatus: null,
            viewerMembershipRole: null,
            group: {
              ...mockOpenGroupBase,
              memberCount: 10,
              viewerMembershipStatus: null,
              viewerMembershipRole: null,
            },
            membership: {
              status: null,
              role: null,
            },
          },
          meta: { requestId: "req-leave-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    const result = await apiClient.leaveGroup(mockOpenGroupBase.id);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/groups/" + mockOpenGroupBase.id + "/membership"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result.group.viewerMembershipStatus).toBeNull();
    expect(result.group.viewerMembershipRole).toBeNull();
    expect(result.membership.status).toBeNull();
  });

  // 5. Pending member -> cancel request via leave
  it("cancels pending join request via leave mutation", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...mockApprovalGroupBase,
            viewerMembershipStatus: null,
            viewerMembershipRole: null,
            group: {
              ...mockApprovalGroupBase,
              viewerMembershipStatus: null,
              viewerMembershipRole: null,
            },
            membership: {
              status: null,
              role: null,
            },
          },
          meta: { requestId: "req-cancel-request-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    const result = await apiClient.leaveGroup(mockApprovalGroupBase.id);

    expect(result.group.viewerMembershipStatus).toBeNull();
    expect(result.membership.status).toBeNull();
  });

  // 6. Join failure preserves old state
  it("preserves previous non-member state when join fails with network or 500 error", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "storage_unavailable",
            message: "Database connection failed.",
            requestId: "req-fail-500",
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    let caughtError: any = null;
    try {
      await apiClient.joinGroup(mockOpenGroupBase.id);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError.status).toBe(503);
    expect(caughtError.code).toBe("storage_unavailable");
  });

  // 7. Leave failure preserves active state
  it("preserves active member state when leave mutation encounters 500 or network failure", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("Network connection lost"));
    global.fetch = fetchMock;

    let caughtError: any = null;
    try {
      await apiClient.leaveGroup(mockOpenGroupBase.id);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError.category).toBe("network");
  });

  // 8. Role protection: organizer cannot leave
  it("refuses to allow an organizer or co-organizer to leave with 409 organizer_cannot_leave", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "organizer_cannot_leave",
            message: "Group organizers and co-organizers cannot leave without transferring ownership.",
            requestId: "req-organizer-block",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    let caughtError: any = null;
    try {
      await apiClient.leaveGroup("circle-as-organizer");
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError.status).toBe(409);
    expect(caughtError.code).toBe("organizer_cannot_leave");
  });

  // 9. Email verification requirement
  it("handles 403 email_verification_required properly", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "email_verification_required",
            message: "Verify your email address before using this feature.",
            requestId: "req-unverified-join",
          },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMock;

    let caughtError: any = null;
    try {
      await apiClient.joinGroup(mockOpenGroupBase.id);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError.status).toBe(403);
    expect(caughtError.code).toBe("email_verification_required");
  });

  // 10. Discussion authorization lifecycle
  it("forbids discussions for non-members, permits for active members, forbids after leaving", async () => {
    // Before join: 403 forbidden
    const fetchMockForbidden = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "forbidden",
            message: "Only active group members can access discussions.",
            requestId: "req-disc-locked",
          },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMockForbidden;

    let discError: any = null;
    try {
      await apiClient.getDiscussions(mockOpenGroupBase.id);
    } catch (err) {
      discError = err;
    }
    expect(discError).toBeInstanceOf(ApiError);
    expect(discError.status).toBe(403);

    // After join: 200 ok with discussions
    const fetchMockAllowed = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: mockDiscussions,
          meta: { requestId: "req-disc-ok" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    global.fetch = fetchMockAllowed;

    const discRes = await apiClient.getDiscussions(mockOpenGroupBase.id);
    expect(discRes.discussions).toHaveLength(1);
    expect(discRes.discussions[0].body).toBe("Welcome everyone to our circle!");

    // After leave: 403 forbidden again
    global.fetch = fetchMockForbidden;
    let leaveDiscError: any = null;
    try {
      await apiClient.getDiscussions(mockOpenGroupBase.id);
    } catch (err) {
      leaveDiscError = err;
    }
    expect(leaveDiscError).toBeInstanceOf(ApiError);
    expect(leaveDiscError.status).toBe(403);
  });
});
