# Samgamam Mobile API Contract Specification (Phase 2 Post-Hardening)

This document establishes the verified, code-level API contract between `samgamam-mobile-app` and the Samgamam backend following Phase 2 hardening.

---

## 1. Architectural Principles & Invariants

1. **Dual-Domain Versioning Strategy**:
   - `/api/v1/*`: Core resource and entity domain (sessions, profiles, public discovery, events, groups, discussions, device installation). Strictly versioned with uniform `{ data, meta }` response envelope and standardized RFC 7807-aligned error structures `{ error: { code, message, requestId, details? } }`.
   - `/api/*` (Intentional Non-v1 / Legacy Surfaces): Specialized functional domains (notifications, recommendations, organizer analytics, AI assistant/copilot, health check). These are intentionally retained because web frontend components share the exact same implementations and their data schemas are fully aligned.
2. **Session Security & Authorization Invariant**:
   - Mobile authentication uses canonical Samgamam session Bearer tokens (`Authorization: Bearer <token>`) obtained via native Auth0 session exchange (`POST /api/v1/auth/session`).
   - Session tokens are durably revocable via RFC 7009 (`POST /api/v1/auth/revoke`).
   - Session expiration (HTTP 401) triggers a bounded, single silent refresh cycle.
   - HTTP 403 authorization failures never trigger authentication refresh loops.
3. **Resilience & Timeout Contract**:
   - All mobile client requests are bounded by a default 15-second timeout (`DEFAULT_REQUEST_TIMEOUT_MS`).
   - Mutating requests (RSVP, discussion posts, device registrations, AI prompts) are strictly non-idempotently guarded: mutations disable duplicate UI submission and rely on backend/database unique constraints.
4. **Failure Preservation (No Silent Swallowing)**:
   - Backend failures are never collapsed into misleading empty states (`[]`, `null`, `false`).
   - `ApiError` distinguishes: `NETWORK_ERROR`, `TIMEOUT`, `AUTHENTICATION_ERROR` (401), `AUTHORIZATION_ERROR` (403), `VALIDATION_ERROR` (400/422), `NOT_FOUND` (404), `CONFLICT` (409), and `SERVER_ERROR` (500+).

---

## 2. Comprehensive Mobile API Inventory & Route Mapping

| # | Mobile Caller Function | Screen / Surface | Method | Endpoint | Versioned? | Auth Requirement | Backend Route Handler | DB / Persistence Layer | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `apiClient.healthCheck()` | Profile (`loadDashboard`) | `GET` | `/api/healthz` | Legacy (Intentional) | PUBLIC | `src/app/api/healthz/route.ts` | In-memory service probe | PASS |
| 2 | `apiClient.getSession()` | App startup / session reconcile | `GET` | `/api/v1/me` | CURRENT V1 | AUTHENTICATED | `src/app/api/v1/me/route.ts` | PostgreSQL (`users`) & session cache | PASS |
| 3 | `apiClient.getViewerProfile(locale?)` | Profile / Auth state | `GET` | `/api/v1/me` | CURRENT V1 | AUTHENTICATED | `src/app/api/v1/me/route.ts` | PostgreSQL (`users`) & session cache | PASS |
| 4 | `apiClient.establishAuth0Session(token, idToken?)` | SessionManager (`signIn`) | `POST` | `/api/v1/auth/session` | CURRENT V1 | AUTHENTICATED (Auth0 Bearer) | `src/app/api/v1/auth/session/route.ts` | PostgreSQL (`users`, `user_sessions`, `social_accounts`) | PASS |
| 5 | `apiClient.logout()` | Profile (`handleLogout`) | `POST` | `/api/v1/auth/revoke` | CURRENT V1 (Primary) | AUTHENTICATED | `src/app/api/v1/auth/revoke/route.ts` | PostgreSQL (`user_sessions.revoked_at`) & in-memory cache | PASS |
| 6 | `apiClient.logout()` (fallback) | Profile (`handleLogout`) | `POST` | `/api/auth/logout` | Legacy (Fallback) | AUTHENTICATED | `src/app/api/auth/logout/route.ts` | Session cache invalidate | PASS |
| 7 | `apiClient.getEvents(options)` | Discover (`loadEvents`, pagination) | `GET` | `/api/v1/events` | CURRENT V1 | PUBLIC (Optional Actor) | `src/app/api/v1/events/route.ts` | PostgreSQL (`events`, `group_memberships`) & mock fallback | PASS |
| 8 | `apiClient.searchEvents(query, locale?)` | Discover (Search query) | `GET` | `/api/v1/events` | CURRENT V1 | PUBLIC (Optional Actor) | `src/app/api/v1/events/route.ts` | PostgreSQL (`events`) full-text & mock fallback | PASS |
| 9 | `apiClient.getEvent(eventId, locale?)` | Discover (Modal detail) | `GET` | `/api/v1/events/[eventId]` | CURRENT V1 | PUBLIC (Optional Actor) | `src/app/api/v1/events/[eventId]/route.ts` | PostgreSQL (`events`) & mock fallback | PASS |
| 10 | `apiClient.rsvpToEvent(eventId, state)` | Discover (RSVP button) | `POST` | `/api/v1/events/[eventId]/rsvp` | CURRENT V1 | AUTHENTICATED + VERIFIED EMAIL | `src/app/api/v1/events/[eventId]/rsvp/route.ts` -> `handleRsvpPost` | PostgreSQL (`event_rsvps` atomic trans + waitlist reconcile) | PASS |
| 11 | `apiClient.getGroups(options)` | Groups (`loadGroups`, pagination) | `GET` | `/api/v1/groups` | CURRENT V1 | PUBLIC (Optional Actor) | `src/app/api/v1/groups/route.ts` | PostgreSQL (`groups`, `group_memberships`) & mock fallback | PASS |
| 12 | `apiClient.getGroup(groupId, locale?)` | Groups (Circle detail) | `GET` | `/api/v1/groups/[groupId]` | CURRENT V1 | AUTHENTICATED | `src/app/api/v1/groups/[groupId]/route.ts` | PostgreSQL (`groups`, `group_memberships`) & mock fallback | PASS |
| 13 | `apiClient.getDiscussions(groupId, locale?)` | Groups (Discussion feed) | `GET` | `/api/v1/groups/[groupId]/discussions` | CURRENT V1 | MEMBER ONLY / ADMIN | `src/app/api/v1/groups/[groupId]/discussions/route.ts` (GET) | PostgreSQL (`group_discussion_posts`) & mock fallback | PASS |
| 14 | `apiClient.createDiscussion(groupId, body, pinned?)` | Groups (`handlePostDiscussion`) | `POST` | `/api/v1/groups/[groupId]/discussions` | CURRENT V1 (Hardened in Phase 2) | MEMBER ONLY / ADMIN | `src/app/api/v1/groups/[groupId]/discussions/route.ts` (POST) | PostgreSQL (`group_discussion_posts`) & mock fallback | PASS |
| 15 | `apiClient.registerDevice(payload)` | Background / App startup | `POST` | `/api/v1/devices/register` | CURRENT V1 | AUTHENTICATED | `src/app/api/v1/devices/register/route.ts` (POST) | PostgreSQL (`mobile_device_installations` advisory lock) | PASS |
| 16 | `apiClient.unregisterDevice(deviceId)` | Background / Sign out | `DELETE` | `/api/v1/devices/register` | CURRENT V1 | AUTHENTICATED | `src/app/api/v1/devices/register/route.ts` (DELETE) | PostgreSQL (`mobile_device_installations.disabled_at`) | PASS |
| 17 | `apiClient.getNotifications()` | Profile (`loadDashboard`) | `GET` | `/api/notifications` | Legacy (Intentional) | AUTHENTICATED | `src/app/api/notifications/route.ts` | In-memory notification store & queue | PASS |
| 18 | `apiClient.markNotificationRead(id)` | Profile (`markNotificationRead`) | `POST` | `/api/notifications/[notificationId]/read` | Legacy (Intentional) | AUTHENTICATED | `src/app/api/notifications/[notificationId]/read/route.ts` | In-memory notification store | PASS |
| 19 | `apiClient.getRecommendations(limit?)` | Discover & Profile | `GET` | `/api/recommendations` | Legacy (Intentional) | AUTHENTICATED + VERIFIED EMAIL | `src/app/api/recommendations/route.ts` | In-memory recommendation engine | PASS |
| 20 | `apiClient.getAnalytics()` | Profile (Organizer dashboard) | `GET` | `/api/analytics` | Legacy (Intentional) | ORGANIZER ONLY / ADMIN | `src/app/api/analytics/route.ts` | Analytics aggregation engine | PASS |
| 21 | `apiClient.searchHelp(query)` | Help (`handleSearchHelp`) | `POST` | `/api/ai/help` | Legacy (Intentional) | AUTHENTICATED + VERIFIED EMAIL | `src/app/api/ai/help/route.ts` | Knowledge retrieval (RAG) service | PASS |
| 22 | `apiClient.askCopilot(action, prompt)` | Help (`handleCopilot`) | `POST` | `/api/ai/copilot` | Legacy (Intentional) | ORGANIZER ONLY / ADMIN | `src/app/api/ai/copilot/route.ts` | AI Copilot draft service | PASS |
| 23 | Direct fetch | `AuthTestScreen` | `GET` | `/api/v1/auth/poc` | CURRENT V1 | PUBLIC / DEV POC | `src/app/api/v1/auth/poc/route.ts` | Auth configuration test endpoint | PASS |

---

## 3. Endpoint Specifications

### 3.1 GET `/api/healthz`
- **Method**: `GET`
- **Path**: `/api/healthz`
- **Auth**: PUBLIC
- **Response**:
  ```json
  {
    "status": "healthy",
    "service": "samgamam-core",
    "timestamp": "2026-09-18T20:00:00.000Z"
  }
  ```
- **Errors**: 500 (`internal_error`)

### 3.2 GET `/api/v1/me`
- **Method**: `GET`
- **Path**: `/api/v1/me?locale={locale}`
- **Auth**: AUTHENTICATED (Bearer token)
- **Response**:
  ```json
  {
    "data": {
      "viewer": {
        "id": "vipin-demo",
        "email": "vipin@example.local",
        "fullName": "Vipin Organizer",
        "roles": ["organizer", "member"],
        "emailVerified": true
      },
      "locale": "en"
    },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Errors**: 401 (`authentication_required`), 403 (`account_suspended`), 400 (`validation_failed`), 429 (`rate_limited`)

### 3.3 POST `/api/v1/auth/session`
- **Method**: `POST`
- **Path**: `/api/v1/auth/session`
- **Auth**: AUTHENTICATED (Auth0 Access Token in `Authorization: Bearer <auth0_token>`)
- **Request Body**:
  ```json
  { "idToken": "<optional_id_token_jwt>" }
  ```
- **Response**:
  ```json
  {
    "data": {
      "accessToken": "<durable_samgamam_session_token>",
      "viewer": {
        "id": "uuid",
        "email": "user@example.com",
        "fullName": "User Name",
        "roles": ["user"],
        "emailVerified": true
      },
      "locale": "en"
    },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Errors**: 401 (`unauthorized`), 403 (`account_suspended`, `email_unverified`, `account_conflict`), 400 (`invalid_request`)

### 3.4 POST `/api/v1/auth/revoke`
- **Method**: `POST`
- **Path**: `/api/v1/auth/revoke`
- **Auth**: AUTHENTICATED
- **Request Body**:
  ```json
  {
    "token": "<samgamam_session_token>",
    "token_type_hint": "access_token"
  }
  ```
- **Response**:
  ```json
  {
    "data": { "revoked": true },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Errors**: 400 (`validation_failed`), 429 (`rate_limited`)

### 3.5 GET `/api/v1/events`
- **Method**: `GET`
- **Path**: `/api/v1/events?limit={limit}&cursor={cursor}&locale={locale}&q={query}&category={category}&dateFrom={date}&language={lang}&location={loc}`
- **Auth**: PUBLIC
- **Pagination**: Keyset cursor (`encodeEventCursor` v2). Deterministic ordering: `startsAt ASC, id ASC`.
- **Response**:
  ```json
  {
    "data": [
      {
        "id": "event-1",
        "groupId": "group-1",
        "title": "Title",
        "description": "Desc",
        "tags": ["culture"],
        "category": "social",
        "languages": ["en"],
        "location": "Berlin",
        "coordinates": { "latitude": 52.5, "longitude": 13.4 },
        "startsAt": "2026-10-01T18:00:00.000Z",
        "endsAt": "2026-10-01T21:00:00.000Z",
        "timeZone": "Europe/Berlin",
        "capacityMode": "limited",
        "capacity": 50,
        "remainingCapacity": 12,
        "availability": "available",
        "status": "published",
        "isPaid": false,
        "ticketPriceCents": 0,
        "currency": "EUR",
        "canonicalUrl": "https://..."
      }
    ],
    "page": {
      "hasNextPage": true,
      "nextCursor": "<base64url_cursor>"
    },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Errors**: 400 (`validation_failed`, `invalid_cursor`), 429 (`rate_limited`), 403 (`origin_not_allowed`)

### 3.6 POST `/api/v1/events/[eventId]/rsvp`
- **Method**: `POST`
- **Path**: `/api/v1/events/[eventId]/rsvp`
- **Auth**: AUTHENTICATED + VERIFIED EMAIL
- **Request Body**:
  ```json
  { "state": "going" | "waitlist" | "cancelled" }
  ```
- **Response**:
  ```json
  {
    "data": {
      "event": { /* public event summary */ },
      "state": "going"
    },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Capacity & Transition Logic**:
  - Atomic PostgreSQL transaction locks event row `FOR UPDATE`.
  - Unlimited capacity -> automatically `'going'`.
  - Limited capacity -> if `goingCount >= capacity` or `waitlistCount > 0`, state automatically becomes `'waitlist'`.
  - Cancelled -> state becomes `'cancelled'`; if was `'going'`, triggers atomic waitlist FIFO reconciliation promoting earliest waitlisted attendee.
  - Idempotent on repeated submission (`ON CONFLICT (event_id, user_id) DO UPDATE SET state = EXCLUDED.state`).
- **Errors**: 401 (`authentication_required`), 403 (`email_verification_required`, `event_registration_paused`), 404 (`event_not_found`), 409 (`event_cancelled`, `capacity_exceeded`), 400 (`event_past`, `validation_failed`)

### 3.7 GET `/api/v1/groups`
- **Method**: `GET`
- **Path**: `/api/v1/groups?limit={limit}&cursor={cursor}&locale={locale}&q={query}&category={category}`
- **Auth**: PUBLIC (Optional Actor determines viewer membership fields)
- **Pagination**: Keyset cursor (`encodeGroupCursor` v1). Deterministic ordering: `name ASC, id ASC`.
- **Response**:
  ```json
  {
    "data": [
      {
        "id": "group-1",
        "name": "Circle Name",
        "description": "Circle description",
        "category": "culture",
        "city": "Berlin",
        "tags": ["social"],
        "languages": ["en"],
        "requiresApproval": false,
        "memberCount": 24,
        "discussionCount": 5,
        "viewerMembershipStatus": "active",
        "viewerMembershipRole": "member"
      }
    ],
    "page": { "hasNextPage": false, "nextCursor": null },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Errors**: 400 (`validation_failed`, `invalid_cursor`), 403 (`account_suspended`, `origin_not_allowed`), 429 (`rate_limited`)

### 3.8 POST `/api/v1/groups/[groupId]/discussions`
- **Method**: `POST`
- **Path**: `/api/v1/groups/[groupId]/discussions`
- **Auth**: MEMBER ONLY / ADMIN + VERIFIED EMAIL
- **Request Body**:
  ```json
  {
    "body": "Discussion text (1-1000 chars)",
    "pinned": false,
    "kind": "discussion",
    "replyToId": "optional-parent-id"
  }
  ```
- **Response** (HTTP 201):
  ```json
  {
    "data": {
      "id": "post-uuid",
      "authorId": "user-uuid",
      "authorName": "Author Name",
      "body": "Discussion text",
      "pinned": false,
      "locale": "en",
      "createdAt": "2026-09-18T20:00:00.000Z"
    },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Authorization & Security**:
  - Requires active group membership (`gm.status = 'active'`) or admin role.
  - Pinning requires organizer privileges (`canPinDiscussion`).
  - Stored directly into PostgreSQL `group_discussion_posts` when database pool is active.
- **Errors**: 401 (`authentication_required`), 403 (`forbidden`, `email_verification_required`), 404 (`group_not_found`), 400 (`validation_failed`), 429 (`rate_limited`)

### 3.9 POST & DELETE `/api/v1/devices/register`
- **Method**: `POST`
- **Path**: `/api/v1/devices/register`
- **Auth**: AUTHENTICATED
- **Request Body**:
  ```json
  {
    "deviceId": "device-uuid-string",
    "platform": "ios" | "android",
    "pushToken": "ExponentPushToken[...]",
    "appVersion": "1.0.0",
    "locale": "en"
  }
  ```
- **Response** (HTTP 201):
  ```json
  {
    "data": {
      "deviceId": "device-uuid-string",
      "platform": "ios",
      "registeredAt": "2026-09-18T20:00:00.000Z"
    },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Method**: `DELETE`
- **Path**: `/api/v1/devices/register?deviceId={deviceId}`
- **Auth**: AUTHENTICATED (actors can only unregister their own devices)
- **Response**:
  ```json
  {
    "data": { "deviceId": "device-uuid-string", "unregistered": true },
    "meta": { "requestId": "req-123" }
  }
  ```
- **Errors**: 400 (`validation_failed`), 401 (`authentication_required`), 404 (`device_not_found`), 503 (`storage_unavailable`)

---

## 4. Group Membership Mutations Gap Analysis

Repository-wide inspection confirmed that direct public member mutation endpoints (`join`, `leave`, `request membership`) are currently **not implemented** in either `/api/v1` or legacy `/api`.
- Membership state is inspectable via `GET /api/v1/groups` (`viewerMembershipStatus`: `'active'` | `'pending'` | `null`, `viewerMembershipRole`: `'member'` | `'organizer'` | `'moderator'` | `null`).
- Group invitations can be accepted via `PATCH /api/invites` (`action: "accept"`).
- Direct join/leave mutations are scheduled for the dedicated Group Membership Implementation Phase.
