# Security Review — Radius

> **Review date:** October 2026  
> **Scope:** Full stack — Express/Node backend, React/Vite frontend, Firestore, Cloud Storage  
> **Reviewer:** Automated + manual audit

---

## Table of Contents

1. [Authentication Model](#1-authentication-model)
2. [Authorization Model](#2-authorization-model)
3. [Firestore Security Rules](#3-firestore-security-rules)
4. [File Upload Security](#4-file-upload-security)
5. [Secrets Management](#5-secrets-management)
6. [Transport & Headers](#6-transport--headers)
7. [CORS](#7-cors)
8. [Rate Limiting](#8-rate-limiting)
9. [Input Validation](#9-input-validation)
10. [XSS Prevention](#10-xss-prevention)
11. [CSRF Considerations](#11-csrf-considerations)
12. [Duplicate RSVP Prevention](#12-duplicate-rsvp-prevention)
13. [Unauthorized Event Edit / Delete](#13-unauthorized-event-edit--delete)
14. [Threat Catalogue & Mitigations](#14-threat-catalogue--mitigations)
15. [Vulnerabilities Found and Fixed](#15-vulnerabilities-found-and-fixed)
16. [Residual Risks & Roadmap](#16-residual-risks--roadmap)

---

## 1. Authentication Model

### Mechanism

Authentication is delegated entirely to **Firebase Authentication** (Google Identity Platform).

| Flow | How it works |
|------|-------------|
| Email / password | Firebase Auth SDK on the client; password hashed by Google |
| Google OAuth | `signInWithPopup` → Google's consent screen → Firebase issues a token |
| Token type | Short-lived (1 h) **Firebase ID token** — a signed JWT |

### Token Verification

Every authenticated API call carries the token in the standard `Authorization: Bearer <token>` header. The backend verifies it with **Firebase Admin SDK** (`getAuth().verifyIdToken(token)`), which validates:

- JWT signature against Google's public keys
- Token expiry (`exp`)
- Token issuer (`iss` must be `https://securetoken.google.com/<project>`)
- Audience (`aud` must match the Firebase project ID)

**Key invariant:** The caller's `uid` is always read from the *verified token*, never from the request body or query string. This is enforced in [`auth.ts`](../backend/src/middleware/auth.ts) and repeated explicitly in comments throughout the service layer.

### Optional Auth

Public routes (event list, event detail) use `optionalAuth` — if a token is present it is verified and attached, but its absence does not block the request. An invalid token on a public route is treated as anonymous (logged at WARN level).

### Session Bootstrap

On first sign-in the client calls `POST /api/me/session`, which creates the Firestore user profile document if it does not exist. Subsequent calls read that profile to get the editable display name and bio.

---

## 2. Authorization Model

### Principle: Server-side ownership, verified token identity

Authorization decisions are made in the service layer, not the route layer alone, and always use the identity from the **verified Firebase ID token** — never from request parameters the caller controls.

| Resource | Rule |
|----------|------|
| Create event | Any authenticated user |
| Update / cancel / reactivate event | `event.creatorId === req.user.uid` (checked in `loadOwnedEvent`) |
| Delete event | Same as above |
| RSVP to event | Any authenticated user; document ID = `uid` prevents duplicates |
| Cancel RSVP | Only the RSVP owner (`uid` == document key) |
| Update profile | Only the profile owner (`uid` == document key) |
| Read events | Public (no auth required) |
| Read attendees | Public |
| Read own attending list | `uid` == path segment, enforced by Firestore rule |
| Maintenance endpoint | Shared secret in `X-Maintenance-Token` header, compared in constant time |

### `loadOwnedEvent` guard

```typescript
// eventService.ts
if (data.creatorId !== user.uid) {
  throw AppError.forbidden('Only the organiser of this event can change it.');
}
```

This check is the single source of truth for event ownership. It runs before any write — update, cancel, reactivate, delete — and throws a 403 if the caller is not the creator.

---

## 3. Firestore Security Rules

> File: [`firestore.rules`](../firestore.rules)

### Architecture note

All application writes go through the Cloud Run API, which uses a **service account** and therefore bypasses these rules entirely. The rules exist as a **second line of defence** against:

- Direct Firebase SDK access using the public web config key
- A future feature that writes directly from the client
- An accidental misconfiguration of the API

### Rules Summary

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| `users/{uid}` | Public | Owner only; `uid` field must match doc key | Owner only; `uid` immutable | Denied |
| `users/{uid}/attending/{eventId}` | Owner only | Denied (API only) | Denied (API only) | Denied (API only) |
| `events/{eventId}` | **Denied** — the board is served through the API, which hides `checkInCode` from everyone but the organiser | Authenticated; `creatorId` = caller; `rsvpCount = 0`; `status = 'ACTIVE'`; title/desc/category validated | Owner only; `creatorId`, `rsvpCount`, **and `status`** locked | Owner only |
| `events/{eventId}/rsvps/{uid}` | Public | `uid` = caller; document data `uid` field must match | Denied | Owner only |
| Everything else | Denied | Denied | Denied | Denied |

### Hardening Applied in This Review

The `update` rule for `events/{eventId}` previously allowed the organiser to write any `status` value directly via the Firebase client SDK. This was fixed to lock the `status` field:

```javascript
// Before
allow update: if isSignedIn()
              && resource.data.creatorId == request.auth.uid
              && request.resource.data.creatorId == resource.data.creatorId
              && request.resource.data.rsvpCount == resource.data.rsvpCount;

// After — status changes must go through the API service
allow update: if isSignedIn()
              && resource.data.creatorId == request.auth.uid
              && request.resource.data.creatorId == resource.data.creatorId
              && request.resource.data.rsvpCount == resource.data.rsvpCount
              && request.resource.data.status == resource.data.status;
```

This means lifecycle transitions (ACTIVE → CANCELLED → ACTIVE → EXPIRED) can only happen via the API, which enforces the state machine.

---

## 4. File Upload Security

> Files: [`storageService.ts`](../backend/src/services/storageService.ts), [`uploads.ts`](../backend/src/routes/uploads.ts)

### Layered Validation

```
Client → multer (size cap) → MIME whitelist → magic-byte detection → GCS upload
```

| Layer | What it prevents |
|-------|-----------------|
| `requireAuth` on the route | Anonymous uploads |
| multer `fileSize: 5 MB`, `files: 1` | Large payloads before they reach application code |
| MIME type whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) | MIME mismatch caught early |
| Magic-byte inspection (`detectImageType`) | Bypasses the client-controlled `Content-Type` header entirely — the declared type is discarded and only the detected type is stored |
| Server-derived object path `events/${uid}/...` | One user cannot write into another user's GCS folder |
| `isOwnedImagePath` check on `imagePath` round-trip | Prevents a crafted `imagePath` from deleting another user's object |

### Object Path Ownership Check

```typescript
export function isOwnedImagePath(objectPath: string, uid: string): boolean {
  if (!objectPath) return false;
  if (objectPath.includes('..') || objectPath.includes('//') || objectPath.startsWith('/')) return false;
  return objectPath.startsWith(`events/${uid}/`);
}
```

This function is called in both `createEvent` and `updateEvent` before storing `imagePath`, and again in `deleteEvent` before deleting. A stored path from a pre-guard version that does not match the current owner prefix is silently discarded.

### GCS Content Headers

Files are saved with:

- `contentType`: the **sniffed** type, never the client's declared type
- `contentDisposition: 'inline'`
- `cacheControl: 'public, max-age=31536000, immutable'`

> **Note:** GCS public-access buckets do not support per-object CORS policy configuration from this side. If stricter COEP/CORP headers are needed, migrate to signed URLs with a private bucket.

---

## 5. Secrets Management

### Backend Secrets

| Secret | Storage | Notes |
|--------|---------|-------|
| Service account key | Local file, path in `GOOGLE_APPLICATION_CREDENTIALS` | Never committed (`.gitignore` covers `service-account*.json`) |
| `GEMINI_API_KEY` | Environment variable | Only read server-side; never sent to the client |
| `MAINTENANCE_TOKEN` | Environment variable | Endpoint disabled when empty; **generate with `openssl rand -hex 32`** |
| Firestore / Firebase Admin | Via service account / ADC | No key material in the codebase |

### Frontend Secrets

Firebase Web Config values (`VITE_FIREBASE_API_KEY`, etc.) are **public by design**. Google designed these to be embeddable in client code — security is enforced by Firestore rules and the API, not by keeping these values secret. See [Firebase docs](https://firebase.google.com/docs/projects/api-keys).

The Google Maps API key (`VITE_GOOGLE_MAPS_API_KEY`) **must** be restricted by HTTP referrer in the Cloud Console before deploying to production. An unrestricted Maps key can be used by any site.

### What Must Never Be in Source Control

```gitignore
# Already in .gitignore:
.env
.env.local
.env.*.local
service-account*.json
gcp-key*.json
credentials.json
```

### Generating a Maintenance Token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

Set the output as `MAINTENANCE_TOKEN` in the backend environment. The endpoint returns 503 when the variable is empty.

---

## 6. Transport & Headers

### Helmet Configuration

```typescript
helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { ... },
    reportOnly: !env.isProduction,   // report-only in dev; enforced in prod
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
})
```

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | Enforced in prod, report-only in dev | XSS mitigation |
| `X-Content-Type-Options` | `nosniff` (Helmet default) | Prevents MIME sniffing |
| `X-Frame-Options` | `SAMEORIGIN` (Helmet default) | Clickjacking protection |
| `X-Powered-By` | Removed | Hides Express version |
| `Referrer-Policy` | `no-referrer` (Helmet default) | Referrer leakage |
| `Strict-Transport-Security` | Set by Cloud Run; Helmet default in prod | Forces HTTPS |

### CSP Directives

```
default-src 'self'
script-src  'self' https://maps.googleapis.com https://apis.google.com
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com
font-src    'self' https://fonts.gstatic.com data:
img-src     'self' data: blob: https:
connect-src 'self' https://*.googleapis.com https://*.google.com
frame-src   'self' https://*.firebaseapp.com https://*.google.com
```

No `'unsafe-inline'` on `script-src`. The Vite build emits only hashed, src-based `<script type="module">` tags — verified against `dist/index.html`.

### Trust Proxy

`app.set('trust proxy', true)` is now only enabled in production. In development there is no reverse proxy, so a local attacker could spoof `X-Forwarded-For` to rotate through arbitrary IP addresses and bypass the IP-keyed rate limiter.

---

## 7. CORS

CORS is applied only to `/api/*` paths (not static assets). The allowed origin set is:

1. The value of `CORS_ORIGINS` (comma-separated, set in the environment)
2. The request's own `Host` header origin (same-origin requests always succeed)
3. Requests with no `Origin` header (server-to-server, `curl`, Cloud Scheduler)

If the origin is not allowed the CORS headers are simply **omitted** — the browser enforces the block. A wildcard (`*`) is supported only if `CORS_ORIGINS=*` is explicitly set; the default for production should be the exact Cloud Run URL.

`credentials: true` is set, which allows the browser to send cookies (though this app uses `Authorization` headers, not cookies).

---

## 8. Rate Limiting

Two layers of in-memory rate limiting are applied:

| Limiter | Scope | Window | Max | Notes |
|---------|-------|--------|-----|-------|
| `readLimiter` | All `/api` | 60 s | 240 | Excludes `/health` |
| `writeLimiter` | Non-GET `/api` | 60 s | 40 | Applied after readLimiter |
| AI throttle | Per-uid, `/api/ai/*` | 60 s | 12 | Protects Gemini quota |

The key is `req.user.uid` when authenticated, falling back to `req.ip` for anonymous reads. With `trust proxy` gated to production only, `req.ip` in dev is the genuine local address rather than a spoofable header.

> **Known limitation:** All limiters are in-process. With multiple Cloud Run instances the effective ceiling multiplies by instance count. A shared store (Firestore counters or Redis) is needed for hard quotas in a high-scale deployment.

---

## 9. Input Validation

All API inputs are validated server-side with **Zod** before reaching service logic. Client-side validation exists for UX feedback only and provides no security guarantee.

| Schema | Where used | Key constraints |
|--------|-----------|-----------------|
| `eventInputSchema` | `POST /api/events` | title 5–120 chars; desc 20–5000 chars; category enum; date/time regex; lat/lon range; `imageUrl` https-only |
| `eventUpdateSchema` | `PATCH /api/events/:id` | All fields optional but still validated when present |
| `eventQuerySchema` | `GET /api/events` | Search strings passed to in-memory scorer, never to a DB query; page/pageSize bounded |
| `profileUpdateSchema` | `PATCH /api/me` | Display name 2–80 chars; bio 0–500 chars; `photoURL` https-only |
| `aiAssistSchema` | `POST /api/ai/assist` | title ≤ 200, description ≤ 2000 |
| `rsvpStatusSchema` | `POST/DELETE /api/events/:id/rsvp` | status enum |

### URL Validation

Image URLs (`imageUrl`, `photoURL`) are validated with a custom `httpsUrl()` Zod refinement that rejects:

- Non-https schemes (`http:`, `javascript:`, `data:`, `file:`)
- Protocol-relative URLs (`//evil.example`)
- Hostless or malformed URLs

This prevents stored XSS via crafted `src` attributes and mixed-content warnings.

---

## 10. XSS Prevention

### React's default escaping

All user-supplied text is rendered via React's JSX, which HTML-escapes string values by default. No `dangerouslySetInnerHTML` is used anywhere in the codebase.

### Event description rendering

The description is split on newlines and each paragraph rendered as a `<p>{paragraph}</p>` — plain text, no HTML parsing.

### CSP as backstop

Even if a future change accidentally renders unsanitised HTML, the CSP's `script-src 'self'` with no `'unsafe-inline'` would prevent injected `<script>` tags from executing.

### URL scheme validation

The backend validates `imageUrl` to `https:` only. Even if a malicious URL somehow reached the client, the CSP `img-src https:` would block non-https images from loading.

---

## 11. CSRF Considerations

This application uses **token-based authentication** (Bearer token in the `Authorization` header), not session cookies. CSRF attacks require the browser to automatically attach credentials to cross-origin requests, which cookies enable but custom `Authorization` headers do not.

Because no cross-origin request can include `Authorization: Bearer <token>` without JavaScript explicitly reading and sending the token (which the Same-Origin Policy prevents for a third-party site), **CSRF is not a relevant attack vector** for this application.

The `SameSite` cookie attribute and CSRF tokens are not required.

---

## 12. Duplicate RSVP Prevention

Duplicate RSVPs are **structurally impossible**, not just guarded against:

- The RSVP document ID is the attendee's `uid` (`events/{id}/rsvps/{uid}`)
- A second `joinEvent` call runs inside a Firestore transaction that reads the existing RSVP document first
- If the document already exists the transaction returns the current state without incrementing `rsvpCount`

The Firestore rule `allow create: if isSelf(uid) && request.resource.data.uid == uid` prevents any client from writing an RSVP with a mismatched UID, and `allow update: if false` prevents re-using the slot.

---

## 13. Unauthorized Event Edit / Delete

All mutation routes (`PATCH`, `POST /cancel`, `POST /reactivate`, `DELETE`) call `loadOwnedEvent(id, user)` before any write:

```typescript
async function loadOwnedEvent(id: string, user: AuthUser) {
  const snapshot = await getDb().collection(EVENTS).doc(id).get();
  if (!snapshot.exists) throw AppError.notFound(...);
  const data = snapshot.data();

  if (data.creatorId !== user.uid) {
    throw AppError.forbidden('Only the organiser of this event can change it.');
  }
  return { ref, data };
}
```

The `user.uid` here comes from the verified Firebase ID token — it is not a query parameter or body field the caller controls. Attempting to edit another user's event returns HTTP 403.

---

## 14. Threat Catalogue & Mitigations

### T1 — Account hijacking via credential stuffing

**Scenario:** Attacker tries a list of email/password pairs against Firebase Auth.  
**Mitigation:** Firebase Auth enforces its own rate limiting and account lockout. The API never handles raw passwords — authentication is fully delegated to Google's identity infrastructure.  
**Residual risk:** Low.

---

### T2 — Token replay / theft

**Scenario:** Attacker intercepts or steals a Firebase ID token and uses it to act as the victim.  
**Mitigation:** Tokens expire after 1 hour. TLS/HTTPS is enforced in production (Cloud Run). Auth is header-based, not cookie-based.  
**Residual risk:** Low. Firebase Auth supports revoking tokens via the Admin SDK if immediate invalidation is needed.

---

### T3 — IDOR — editing another user's event

**Scenario:** Attacker crafts `PATCH /api/events/<victim-event-id>` with a valid token for their own account.  
**Mitigation:** `loadOwnedEvent` compares `data.creatorId` (from Firestore) to `user.uid` (from the verified token). Returns 403.  
**Residual risk:** None.

---

### T4 — IDOR — deleting another user's uploaded image

**Scenario:** Attacker sets `imagePath` in a create/update request to a path belonging to another user, then deletes their own event, triggering deletion of the victim's image.  
**Mitigation:** `safeImagePath()` and `isOwnedImagePath()` validate that `imagePath` starts with `events/{caller-uid}/`. A path that does not match is discarded with a WARN log.  
**Residual risk:** None.

---

### T5 — Stored XSS via event content

**Scenario:** Attacker creates an event with a `<script>` or `javascript:` URI in the title, description, or image URL.  
**Mitigation:** React escapes all string values in JSX. `imageUrl` is validated to `https:` scheme only. CSP `script-src 'self'` blocks inline scripts.  
**Residual risk:** Negligible. Three independent layers would all need to fail simultaneously.

---

### T6 — Malicious file upload (polyglot / web shell)

**Scenario:** Attacker uploads a file with a valid JPEG header prepended to PHP/JS/HTML content.  
**Mitigation:** Magic-byte detection reads the actual bytes, not the client-declared MIME type. The detected type — not the client's claim — is stored as `contentType` in GCS. GCS serves, not executes, files.  
**Residual risk:** Low.

---

### T7 — Oversized request body (memory exhaustion)

**Scenario:** Attacker sends a 10 MB JSON body to every write endpoint, exhausting the Cloud Run instance's heap.  
**Mitigation:** Global `express.json` limit is 64 KB. The AI router gets 128 KB. Multer caps file uploads at 5 MB per file, 1 file per request.  
**Residual risk:** Low.

---

### T8 — IP spoofing to bypass rate limiting

**Scenario:** Attacker spoofs `X-Forwarded-For` to rotate through fake IPs and avoid the IP-keyed rate limiter.  
**Mitigation:** `trust proxy` is now only enabled in production where Cloud Run sets the real client IP. In development `req.ip` is the actual local address.  
**Residual risk:** None in production.

---

### T9 — AI quota drain

**Scenario:** Unauthenticated bot hammers `/api/ai/search` to drain Gemini API quota.  
**Mitigation:** `/api/ai/search` now requires `requireAuth`. Every AI endpoint has a per-uid throttle of 12 calls/minute on top of the global write limiter (40 writes/minute per identity).  
**Residual risk:** Low. Shared-store quota enforcement is a roadmap item for multi-instance deployments.

---

### T10 — Open redirect after login

**Scenario:** Attacker crafts `/login?next=https://evil.example` and sends it to a victim; after login the victim is redirected to the attacker's site.  
**Mitigation:** `safeRedirectPath()` rejects anything that does not start with a single `/`, anything starting with `//`, and anything containing a backslash. Only same-app paths are accepted.  
**Residual risk:** None.

---

### T11 — Maintenance endpoint abuse

**Scenario:** Attacker calls `POST /api/maintenance/expire` to flip event statuses in bulk.  
**Mitigation:** The endpoint is disabled (503) when `MAINTENANCE_TOKEN` is empty. When set, the provided token is compared in constant time via `crypto.timingSafeEqual`.  
**Residual risk:** Low. The token must be kept secret and rotated periodically.

---

### T12 — Information disclosure via /api/health

**Scenario:** Attacker probes `/api/health` to enumerate the stack (GCP project ID, AI provider, environment).  
**Mitigation:** In production, `projectId`, `environment`, and AI provider details are omitted. Only boolean integration availability is reported.  
**Residual risk:** Low.

---

### T13 — Direct Firestore SDK write to bypass API business logic

**Scenario:** Attacker extracts the Firebase web config from the SPA bundle, uses the Firebase JS SDK directly to write to Firestore.  
**Mitigation:** Firestore rules independently enforce ownership, counter immutability, status immutability, and RSVP uniqueness. The service account bypasses rules; a client-SDK call does not.  
**Residual risk:** Low. Rules cannot express every constraint, but those invariants are only meaningful within the API context anyway.

---

## 15. Vulnerabilities Found and Fixed

| # | Severity | File(s) | Finding | Fix Applied |
|---|----------|---------|---------|-------------|
| V1 | **Medium** | `backend/.env`, `.env.example` | `MAINTENANCE_TOKEN=change-me-to-a-long-random-string` — known-weak default token on disk | Token cleared in `.env`; `.env.example` now shows how to generate a real token; endpoint stays disabled when empty |
| V2 | **Medium** | `routes/meta.ts` | `/api/health` exposed GCP project ID, environment name, and AI provider in production | Production response now redacts project ID, environment, and AI provider details |
| V3 | **Medium** | `routes/ai.ts`, `lib/api.ts` | `/api/ai/search` had no authentication — any unauthenticated bot could call Gemini at the project's expense | Added `requireAuth` middleware; frontend now sends `auth: true` |
| V4 | **Medium** | `index.ts` | `trust proxy: true` was unconditional — in development a client could spoof `X-Forwarded-For` to bypass the IP-keyed rate limiter | `trust proxy` now only enabled when `NODE_ENV=production` |
| V5 | **Low** | `index.ts` | CSP was disabled in development (`contentSecurityPolicy: false`) — XSS policy gap between dev and prod | CSP always active; `reportOnly: true` in development, enforced in production |
| V6 | **Low** | `index.ts` | Global `express.json` limit was 1 MB — unnecessarily generous for routes that need ≤ 4 KB | Global limit reduced to 64 KB; AI router gets a separate 128 KB limit |
| V7 | **Low** | `middleware/requestContext.ts` | Health check path skip used `/api/health` but `req.path` inside a mounted router has the mount prefix stripped, so the condition never matched | Path guard corrected to `/health` with `req.originalUrl` as fallback |
| V8 | **Low** | `firestore.rules` | The event `update` rule did not lock the `status` field — a client using the Firebase SDK directly could flip a CANCELLED event back to ACTIVE | `request.resource.data.status == resource.data.status` added to the update condition |
| V9 | **Medium** | `firestore.rules` | Event documents were publicly readable and hold `checkInCode`, so anyone with the public web config could read every check-in code through the Firestore REST API (confirmed on the live project) and check in without attending | `/events` now `allow read: if false` — nothing in the frontend reads Firestore directly; verified PERMISSION_DENIED on the live database |

---

## 16. Residual Risks & Roadmap

### Accepted Risks

| Risk | Rationale |
|------|-----------|
| In-memory rate limiting | Sufficient for single-instance or low-scale deployment. Redis/Firestore-backed quota is a roadmap item. |
| GCS public-access bucket | Acceptable for community event photos. Migrate to signed URLs + private bucket if PII is added. |
| AI provider API key in backend env | Required for `AI_PROVIDER=api`. Vertex AI (`AI_PROVIDER=vertex`) is the production-recommended path — no key file, billed to the same GCP project, audited via Cloud IAM. |
| Firebase web config publicly visible | By design — Firebase's security model. Firestore rules and the API are the security boundary. |

### Recommended Next Steps

1. **Restrict the Maps API key** by HTTP referrer in the Cloud Console before any public deployment.
2. **Switch to `AI_PROVIDER=vertex`** in production to eliminate the Gemini API key from the environment.
3. **Deploy updated Firestore rules** after each change: `firebase deploy --only firestore:rules`.
4. **Add authorization integration tests:** attempt `PATCH`/`DELETE` on events with a different user's token and assert HTTP 403.
5. **Shared-store rate limiting** (Firestore atomic counters or Memorystore for Redis) for multi-instance deployments.
6. **Content moderation** pipeline for uploaded images if the platform grows — Cloud Vision SafeSearch API integrates naturally with the GCP stack.
7. **Token revocation:** if a user reports account compromise, call `admin.auth().revokeRefreshTokens(uid)` to invalidate all sessions immediately.
