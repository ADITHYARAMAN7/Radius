# Architecture — Radius

> Written for engineers and judges who want to know how this is put together and why
> each decision went the way it did.

---

## 1. The shape of it

One Cloud Run service. It serves the React SPA **and** the JSON API from the same
container, on the same origin.

```
                               ┌──────────────┐
                               │   Browser    │
                               │ React + Vite │
                               └──────┬───────┘
                                      │
                  ┌───────────────────┼────────────────────┐
                  │                   │                    │
         Firebase Auth SDK      HTTPS (same origin)   Maps JS API
         (sign-in only)          /  and  /api/*       (map tiles)
                  │                   │                    │
                  ▼                   ▼                    ▼
        ┌──────────────────┐  ┌───────────────────┐  ┌──────────────┐
        │ Firebase Auth    │  │    CLOUD RUN      │  │ Google Maps  │
        │ Identity Platform│  │  Node 20, Express │  │   Platform   │
        └────────┬─────────┘  │                   │  └──────────────┘
                 │            │  ┌─────────────┐  │
                 │            │  │ static SPA  │  │
     ID token ───┼───────────▶│  ├─────────────┤  │
                 │            │  │ /api routes │  │
                 │            │  └─────────────┘  │
                 │            └─────┬───┬───┬─────┘
                 │                  │   │   │
        verifyIdToken()             │   │   │
     (firebase-admin, server) ◀─────┘   │   │
                                        │   │
          ┌─────────────────────────────┘   └──────────────────┐
          │                      │                             │
          ▼                      ▼                             ▼
   ┌─────────────┐      ┌─────────────────┐          ┌──────────────────┐
   │  FIRESTORE  │      │  CLOUD STORAGE  │          │ GEMINI / VERTEX  │
   │             │      │                 │          │                  │
   │ users       │      │ event images    │          │ listing assist   │
   │ events      │      │ events/{uid}/…  │          │ search intent    │
   │  └ rsvps    │      └─────────────────┘          └──────────────────┘
   │ users/…/    │
   │   attending │              ┌────────────────┐
   └─────────────┘              │ CLOUD LOGGING  │◀── structured JSON on stdout
          ▲                     └────────────────┘
          │
   ┌──────┴────────┐
   │ CLOUD         │  POST /api/maintenance/expire   (hourly, shared-secret header)
   │ SCHEDULER     │
   └───────────────┘
```

### Why one service rather than two

A split deployment (static hosting + separate API) is the more conventional answer, and
it was the first thing considered. One service won for three concrete reasons:

1. **A shared event link has to open fast and cold.** Same-origin means no preflight, no
   second DNS lookup, no second TLS handshake on the critical path.
2. **No CORS surface.** Cross-origin credentials are where auth bugs live. Here the token
   never crosses an origin boundary.
3. **One deploy, one URL, one set of logs.** During a hackathon that is worth more than
   the theoretical scaling independence of two services.

The cost is that the frontend and backend scale together. At this size that is irrelevant,
and splitting later is a build-config change, not a rewrite — the client already supports
a separate API origin through `VITE_API_BASE_URL`.

---

## 2. Request flow

### Reading the board (anonymous or signed in)

```
GET /api/events?category=Sports&date=weekend&search=football
   │
   ├─ optionalAuth ─── token present? verify it, attach the user. Missing or bad
   │                   token is simply treated as anonymous, never an error.
   │
   ├─ eventQuerySchema.parse(req.query) ─── rejects unknown categories, bad
   │                                        pagination, unknown sorts with a 400
   │
   ├─ listEvents()
   │    ├─ Firestore: status == ACTIVE
   │    │             + ONE equality filter (category | neighborhood | city)
   │    │             + startsAt range for the date window
   │    │             + orderBy startsAt, limit 400
   │    │
   │    └─ in memory: drop anything already finished
   │                  apply the equality filters that were not pushed down
   │                  score relevance for the text query
   │                  sort, then slice the requested page
   │
   └─ decorateForViewer() ─ one batched getAll() for "am I going to these?"
```

### Saying "I'm Going"

```
POST /api/events/{id}/rsvp   Authorization: Bearer <Firebase ID token>
   │
   ├─ requireAuth ─── verifyIdToken(). The uid comes from the verified token and
   │                  nowhere else, so a client cannot RSVP as someone else.
   │
   └─ Firestore transaction, three documents that must agree:
        events/{id}.rsvpCount        ← increment(1)
        events/{id}/rsvps/{uid}      ← created; the uid IS the document id
        users/{uid}/attending/{id}   ← mirror for "Events I'm attending"
```

Using the uid as the RSVP document id is what makes a duplicate RSVP **structurally
impossible** rather than merely guarded against. A second press writes the same path, the
transaction reads it as already present, and the count is returned unchanged. The
`/api/events/{id}/rsvp` endpoint is therefore idempotent in both directions.

---

## 3. Data model

```
users/{uid}
  uid, displayName, email, photoURL, bio, neighborhood, city, createdAt, updatedAt

  └── attending/{eventId}          ← denormalised mirror
        eventId, title, category, startsAt, imageUrl, createdAt

events/{eventId}
  title, description, summary, category, tags[]
  date 'YYYY-MM-DD', startTime 'HH:mm', endTime 'HH:mm'
  startsAt: Timestamp, endsAt: Timestamp        ← ordering and expiry run on these
  location, address, latitude, longitude, neighborhood, city
  neighborhoodLower, cityLower                  ← case-insensitive equality filters
  searchKeywords[]                              ← cheap keyword matching
  imageUrl, imagePath
  creatorId, creatorName, creatorPhotoURL
  rsvpCount                                     ← only ever changed in a transaction
  status: ACTIVE | EXPIRED | CANCELLED
  createdAt, updatedAt                          ← serverTimestamp()

  └── rsvps/{uid}
        uid, displayName, photoURL, createdAt
```

### Three deliberate denormalisations

| What | Why it exists |
|---|---|
| `users/{uid}/attending/{eventId}` | Makes "Events I'm attending" a single ordered query. Without it, that page needs a collection-group scan over every RSVP in the system, then N document reads. It is written inside the same transaction as the RSVP, so it cannot drift. |
| `rsvpCount` on the event | The count appears on every card in the grid. Counting the subcollection per card would be one read per card per render. |
| `neighborhoodLower` / `cityLower` | Firestore equality is case-sensitive. "gandhipuram" and "Gandhipuram" must find the same events. |

The cost of denormalisation is the risk of drift. That is why every write that touches two
of these goes through a transaction, and why deleting an event cascades to both the RSVP
subcollection and every attendee's mirror.

---

## 4. The search design, and its honest limits

**Firestore has no full-text search.** It also allows only one range filter per query, and
needs a composite index for each equality-plus-range combination. Search, four filters and
a sort cannot be one query. Anyone claiming otherwise has not tried it.

So the pipeline narrows in Firestore and finishes in memory:

```
Firestore  ──▶  status + ONE equality filter + date range + orderBy + limit 400
   │
   ▼
memory     ──▶  remaining equality filters
                distance filter
                weighted relevance scoring across 9 fields
                sort, paginate
```

Only one equality filter is pushed down (category, else neighbourhood, else city). That is
what keeps the composite index set to seven entries instead of a combinatorial explosion —
the remaining filters are cheap across a bounded result set.

**`FETCH_CAP = 400`** bounds reads per request regardless of collection size. It is the
honest limit of this design: beyond a few hundred concurrent upcoming events in one
filter combination, results past the cap are not considered.

**The migration path**, when it is needed: mirror events into Algolia or Typesense on
write (via an `onWrite` Cloud Function), query that for search and filtering, and keep
Firestore as the source of truth. That is roughly a day of work and does not disturb the
data model. It is deliberately not built here, because for a board of this size it would
add a service to run, pay for and explain, for no user-visible gain.

---

## 5. Automatic expiration

The requirement is that expired events disappear from the active board. This is handled at
two levels, on purpose.

**Level 1 — the query (authoritative).** Every active-board query filters
`endsAt >= now` in memory after the Firestore range. A finished event cannot appear, even
one second after it ends, and even if nothing has run to update it.

**Level 2 — the sweep (bookkeeping).** `POST /api/maintenance/expire` flips finished
`ACTIVE` events to `EXPIRED` in a batch. Cloud Scheduler calls it hourly with a shared
secret in `X-Maintenance-Token`, compared in constant time.

Doing both means **a missed sweep degrades bookkeeping, never correctness**. If Cloud
Scheduler is not configured at all, the board still behaves exactly right — which is why
this deployment works without it.

Events are never physically deleted by expiry. `EXPIRED` and `CANCELLED` records remain,
so organisers keep their history and RSVP counts.

---

## 6. Security

### Trust boundary

**Identity comes from the verified ID token and nowhere else.** `creatorId` and the RSVP
uid are read from `verifyIdToken()`, never from the request body. A crafted request cannot
claim another user — there is no field to put the lie in.

### Layers

| Layer | What it stops |
|---|---|
| Firebase Auth | Unauthenticated access to any write endpoint |
| `requireAuth` | A missing, expired or forged token (401) |
| Ownership checks in the service layer | Editing or deleting someone else's event (403) |
| Zod schemas | Malformed input, on every route, before it reaches Firestore |
| Firestore transactions | RSVP counters drifting under concurrency |
| Firestore rules | Direct client SDK access, if a web config key is ever extracted |
| Helmet + scoped CSP | XSS and clickjacking |
| Secret Manager | Gemini key exposure |

### Why Firestore rules exist even though all writes go through the API

The Cloud Run service account bypasses rules entirely, so today they enforce nothing. They
are there because the Firebase **web** config ships to every browser — it is public by
design. Rules are what stop that key being used to write to Firestore directly, and they
are what will enforce correctness if any part of the client ever talks to Firestore
straight. They are the second lock, not the first.

### What is deliberately not solved

- **Rate limiting is per-instance.** Reads (240/min), writes (40/min) and AI calls
  (12/min) use in-memory counters, correct for a single Cloud Run instance. With several
  instances the effective ceiling multiplies by the instance count, so this guards against
  a stuck client rather than a distributed attacker. A hard global limit needs a shared
  store (Redis / Firestore counters). Noted in the roadmap rather than half-built.
- **No moderation or abuse handling.** Anyone signed in can post anything. A real
  deployment needs reporting and review.

---

## 7. AI integration

Gemini is used in two places. Both are **additive** — every feature works with the model
switched off, and `/api/ai/status` tells the client whether to offer the buttons at all.

### Listing assistance — `POST /api/ai/assist`

A rough note becomes a structured listing. Returns JSON matching a `responseSchema`, so
there is no prompt-response parsing to go wrong. The user then picks **which suggested
fields to accept** rather than getting an all-or-nothing rewrite.

The system instruction forbids inventing dates, prices, addresses or organiser names — the
failure mode that matters for an events board is a model confidently fabricating a time.

### Natural-language search — `POST /api/ai/search`

"free outdoor things to do with kids this weekend in Gandhipuram" becomes
`{keywords, category, dateFilter, neighborhood, city}` — the exact filters the Explore page
already applies.

This is the deliberate design choice: **Gemini does the language, Firestore does the
retrieval.** The model never sees event data and never decides what to return, so it
cannot hallucinate an event that does not exist. If the call fails, it degrades to a plain
keyword search rather than failing the search.

### Two providers, one client

`AI_PROVIDER=api` uses a Gemini API key (fastest to set up).
`AI_PROVIDER=vertex` uses Vertex AI through the Cloud Run service account — no key stored
anywhere, billing and audit inside the same GCP project. The second is what you want in
production.

---

## 8. Observability

Cloud Run ingests structured JSON from stdout into Cloud Logging. Emitting the documented
field names is the officially supported integration and needs no dependency:

```json
{
  "severity": "INFO",
  "message": "RSVP created",
  "eventId": "aCCRq...",
  "uid": "...",
  "logging.googleapis.com/trace": "projects/<id>/traces/<trace-id>"
}
```

The trace id is lifted from `X-Cloud-Trace-Context`, which makes a single log line
clickable through to the whole request trace. In development the same logger prints a
readable single line instead.

`GET /api/health` reports which integrations are actually configured, turning "the AI
button does nothing" into a one-request diagnosis.

---

## 9. Frontend structure

```
src/
  lib/          api client, firebase, types, formatting   ← no React
  context/      AuthContext
  hooks/        useEvents, useRsvp, useTheme, useDebounced
  components/
    ui/         Button, Field, Primitives, Toast          ← no domain knowledge
    common/     States, ErrorBoundary, ProtectedRoute
    events/     EventCard, EventFilters, EventMap, EventForm, ShareMenu
    layout/     Navbar, Layout
  pages/        one per route
```

Three decisions worth naming:

**Filters live in the URL.** `/explore?category=Sports&date=weekend` is shareable and
survives reload and the back button. Filter state in `useState` would not be.

**Every fetch is raced-safe.** `useEvents` tracks a request sequence number and aborts on
change, so a slow earlier response cannot overwrite a newer one — the classic bug when
someone types quickly.

**RSVP is optimistic with exact rollback.** The count moves immediately and is restored to
the precise pre-click values on failure. It is the most visible number on the page; it
should never feel laggy, and it should never lie.

---

## 10. Accessibility

Not a checklist item bolted on at the end — the structural choices are in the components:

- **One link per card.** The card is clickable via a stretched-link overlay that carries
  the accessible name, so the tab order gets one stop per card, not three.
- **`:focus-visible` globally**, so keyboard focus is always visible without ringing every
  mouse click.
- Semantic landmarks (`header`, `main`, `nav`, `footer`), a skip link as the first tab
  stop, `aria-live` on result counts and toasts, `role="alert"` on errors, labelled form
  controls with `aria-describedby` wiring errors to inputs, and focus moved to the first
  invalid field on submit.
- Charts carry a plain-text summary in `aria-label` plus an `sr-only` paragraph, so the
  data is available without seeing the bars.
- Category state is never conveyed by colour alone — every badge carries an icon and text.
- `prefers-reduced-motion` is respected.

Verified in a headless browser across all routes: landmarks present, zero images missing
`alt`, zero unlabelled buttons.

---

## 11. Testing

| Suite | What it covers | Result |
|---|---|---|
| `backend/src/scripts/verify.ts` | Service layer against the Firestore emulator: create, edit, ownership, RSVP transaction, duplicate prevention, counter integrity, cancel/restore, distance filter, cascade delete, expiry, insights | **88 passing** |
| API suite (HTTP, emulator-backed) | Feed ordering, search, filters, sorting, pagination, detail, 401 on every write without a token, maintenance secret, query validation, distance filter, rate limiting | **85 passing** |
| Browser smoke (headless Chrome) | Every route mounts, landmarks, skip link, alt text, button labels, console errors | **6 routes passing** |

Run the service suite:

```bash
firebase emulators:start --only firestore          # terminal 1
cd backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 npm run verify
```

**Not covered:** end-to-end sign-in, because verifying a real Firebase ID token needs
Google's public keys and a live project. The auth *guard* is tested (every protected route
returns 401 without a valid token, and a forged bearer token is rejected); the sign-in
*flow* needs manual checking against a real Firebase project.

---

## 12. Cost

Everything here sits inside, or close to, the GCP always-free tier at demo scale.

| Service | Free tier | What this app does |
|---|---|---|
| Cloud Run | 2M requests, 360k GB-s / month | One small instance |
| Firestore | 50k reads, 20k writes, 1 GiB / day | ~400 reads per Explore request worst case |
| Cloud Storage | 5 GB standard | Event images, capped at 5 MB each |
| Gemini | Free tier on the Developer API | Two call sites, rate limited per user |
| Maps JS API | $200/month credit | Map view only |
| Cloud Scheduler | 3 jobs free | One hourly job |

The one thing to watch: **set `--min-instances=1` before demoing.** Cloud Run scales to
zero and a cold start in front of judges is an avoidable own goal. Set it back to 0
afterwards.
