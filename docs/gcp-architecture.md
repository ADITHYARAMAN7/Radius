# Google Cloud architecture — Nearby-objects

> Written for judges and reviewing engineers: what each Google Cloud service does here,
> why it was chosen over the alternatives, and how it fails.
>
> Deployment commands live in [gcp-deployment.md](gcp-deployment.md). Application-level
> design (data model, search pipeline, request flows) lives in
> [architecture.md](architecture.md).

---

## The stack at a glance

```
                          ┌──────────────────────────┐
                          │        FRONTEND          │
                          │  React 18 · TypeScript   │
                          │  Vite · Tailwind         │
                          └───────────┬──────────────┘
                                      │  HTTPS
                                      ▼
                          ┌──────────────────────────┐
                          │        CLOUD RUN         │
                          │  Node 20 · Express       │
                          │  serves SPA + /api/*     │
                          │  scales 0 → 10           │
                          └───────────┬──────────────┘
                                      │
      ┌───────────────┬───────────────┼───────────────┬────────────────┐
      ▼               ▼               ▼               ▼                ▼
┌───────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────┐
│ FIRESTORE │  │   CLOUD     │  │ GEMINI / │  │  FIREBASE    │  │   CLOUD    │
│           │  │   STORAGE   │  │ VERTEX AI│  │     AUTH     │  │  LOGGING   │
│ users     │  │             │  │          │  │              │  │            │
│ events    │  │ event       │  │ listing  │  │ verify ID    │  │ structured │
│  └ rsvps  │  │ images      │  │ assist   │  │ tokens       │  │ JSON +     │
│ attending │  │             │  │ search   │  │              │  │ trace ids  │
└───────────┘  └─────────────┘  │ intent   │  └──────────────┘  └────────────┘
                                └──────────┘
      ▲                                                  ▲
      │                                                  │
┌─────┴──────────┐                              ┌────────┴─────────┐
│ CLOUD SCHEDULER│                              │  SECRET MANAGER  │
│ hourly expiry  │                              │  gemini-api-key  │
│ sweep          │                              │ maintenance-token│
└────────────────┘                              └──────────────────┘

                 ┌───────────────────────────────┐
  Browser ──────▶│    GOOGLE MAPS PLATFORM       │
  (direct)       │    Maps JavaScript API        │
                 └───────────────────────────────┘
```

**One Cloud Run service serves both the SPA and the API.** The browser talks to exactly
two origins: the Cloud Run service, and Google's own CDNs for Maps and Firebase Auth.

---

## 1. Cloud Run — the application host

**What it does:** runs the container that serves the React build *and* the JSON API on one
origin, scaling from zero to ten instances.

**Why Cloud Run rather than App Engine or GKE:** this is a stateless HTTP container that
must cost nothing when idle and need no cluster to babysit. App Engine Standard would
constrain the Node runtime; GKE would mean running a control plane for one service.

**Why one service rather than static hosting plus a separate API:**

- A shared event link must open fast from cold — same-origin removes a preflight, a second
  DNS lookup and a second TLS handshake from the critical path.
- No cross-origin credential handling, which is where auth bugs tend to live.
- One deploy, one URL, one log stream.

The cost is that frontend and backend scale together. At this size that is irrelevant, and
splitting later is a build-config change rather than a rewrite — the client already
supports a separate API origin through `VITE_API_BASE_URL`.

**Implementation:** [`docker/Dockerfile`](../docker/Dockerfile),
[`backend/src/index.ts`](../backend/src/index.ts)

| Cloud Run requirement | How it is met |
|---|---|
| Listen on `$PORT` | `env.port` reads `PORT`, defaults to 8080 |
| Fast cold start | Multi-stage build, dev dependencies pruned, ~170 MB final image |
| Graceful shutdown | `SIGTERM` handler closes the server before exit, so in-flight requests finish during a deploy |
| Correct PID 1 | `dumb-init` as entrypoint, so signals actually reach Node |
| Health endpoint | `GET /api/health`, also the Docker `HEALTHCHECK` |
| Non-root | Runs as the `node` user |
| Stateless | No disk writes; uploads stream straight to Cloud Storage |
| Trust the proxy | `trust proxy` set, so client IPs and protocol are read from Cloud Run's headers |

**Failure behaviour:** a revision that cannot reach Firestore still starts and serves the
SPA; `/api/health` returns `503` with `firestore: unreachable` rather than crash-looping,
so you get a diagnosis instead of a restart loop.

---

## 2. Cloud Firestore — the database

**What it does:** stores users, events, RSVPs and the attendance mirror.

**Why Firestore rather than Cloud SQL:** the write that matters most — joining an event —
touches three documents that must agree (`rsvpCount`, the RSVP document, the user's
mirror). Firestore gives that a real transaction with no connection pool, no instance to
size, and no scale-to-zero problem. A relational schema would be a better fit for complex
reporting, which this product does not have.

**Collections**

```
users/{uid}                        profile
  └── attending/{eventId}          mirror powering "Events I'm attending"
events/{eventId}                   the board
  └── rsvps/{uid}                  attendees — document id IS the uid
```

Using the uid as the RSVP document id makes a duplicate RSVP **structurally impossible**
rather than merely guarded against.

**Implementation:** [`backend/src/services/eventService.ts`](../backend/src/services/eventService.ts),
[`rsvpService.ts`](../backend/src/services/rsvpService.ts)
**Configuration:** [`firestore.rules`](../firestore.rules), [`firestore.indexes.json`](../firestore.indexes.json)

**Security rules exist even though all writes go through the API.** The Cloud Run service
account bypasses them, so today they enforce nothing. They are there because the Firebase
**web** config ships to every browser by design — rules are what stop that key being used
to write to Firestore directly. Second lock, not the first.

**Honest limit:** Firestore has no full-text index, and allows one range filter per query.
Search therefore narrows in Firestore (status + date range + the most selective equality
filter) and finishes in memory under a hard 400-document read cap. Past a few hundred
concurrent events this needs a dedicated search index. See
[architecture.md §4](architecture.md#4-the-search-design-and-its-honest-limits).

---

## 3. Cloud Storage — event images

**What it does:** holds uploaded event images at `events/{uid}/{timestamp}-{random}-{name}`.

**Why uploads go through Cloud Run instead of straight from the browser:**

- No storage credential ever reaches a client.
- MIME type and the 5 MB cap are enforced somewhere the user cannot bypass.
- The object path is derived from the **verified uid**, so one user cannot write into
  another's folder by crafting a filename.

**Implementation:** [`backend/src/services/storageService.ts`](../backend/src/services/storageService.ts)

Objects are written with `Cache-Control: public, max-age=31536000, immutable` — safe
because every path carries a timestamp and a random segment, so a URL never changes
meaning.

**Lifecycle:** replacing or deleting an event image deletes the old object. That cleanup is
best-effort and deliberately never fails the user's request: the database is already
consistent, and an orphaned object is a billing nuisance at worst.

**Failure behaviour:** with `GCS_BUCKET` unset the upload control renders disabled and says
so, and the API returns `503` with an actionable message. Events work fine without a photo.

> **Private bucket variant:** this deployment serves images publicly, which suits a public
> board. For a private bucket, swap the public URL in `storageService.ts` for
> `blob.getSignedUrl(...)` and drop the `allUsers` binding.

---

## 4. Firebase Authentication — identity

**What it does:** email/password and Google sign-in in the browser; ID token verification
on the server.

**Why Firebase Auth rather than rolling our own:** password storage, reset flows, OAuth and
token rotation are solved problems with real consequences for getting them wrong.

**The trust boundary, stated plainly:**

> **Identity comes from the verified ID token and nowhere else.** `creatorId` and the RSVP
> uid are read from `verifyIdToken()`, never from the request body. A crafted request has
> no field in which to put the lie.

**Implementation:** [`backend/src/middleware/auth.ts`](../backend/src/middleware/auth.ts) ·
[`frontend/src/lib/firebase.ts`](../frontend/src/lib/firebase.ts)

- `requireAuth` — rejects a missing, expired or forged token with `401`
- `optionalAuth` — attaches the caller when present, never blocks; used by public reads so
  a card can render in the right RSVP state on first paint

**Local development:** the Firebase Auth emulator is supported on both halves
(`VITE_FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`), so the entire signed-in
app is testable with no Google Cloud project at all.

---

## 5. Gemini / Vertex AI — the assistant

**What it does, in two places:**

| Feature | Endpoint | What the model is responsible for |
|---|---|---|
| "Improve with AI" | `POST /api/ai/assist` | Rewrites a rough note into a title, description, category and tags |
| Natural-language search | `POST /api/ai/search` | Turns a sentence into structured filters |

**The design decision that matters:** for search, **Gemini does the language and Firestore
does the retrieval.** The model converts "free tech workshops this weekend" into
`{keywords, category, dateFilter, neighborhood, city}` — the same filters the Explore page
already applies. It never sees event data and never chooses what comes back, so it cannot
invent an event that does not exist.

Both call sites use `responseSchema` structured output, so there is no prompt-response
parsing to go wrong. The system instruction forbids inventing a date, price, address or
organiser name — on an events board, a confidently fabricated time is the failure that
actually matters.

**Two provider modes, one client** ([`aiService.ts`](../backend/src/services/aiService.ts)):

| `AI_PROVIDER` | Auth | When to use |
|---|---|---|
| `api` | `GEMINI_API_KEY` from Secret Manager | Fastest to set up |
| `vertex` | The Cloud Run service account | **Production** — no key stored anywhere, billing and audit inside the same project |

**Failure behaviour:** every AI feature is additive. `GET /api/ai/status` tells the client
whether to render the buttons at all; an assist failure returns "you can keep writing and
publish without it"; a search parse failure degrades to a plain keyword search. Nothing
blocks on the model.

**Abuse control:** 12 calls per user per minute, in addition to the global API limits.

---

## 6. Google Maps Platform — location

**What it does:** renders the map view with category-coloured pins, and provides
"Open in Google Maps" links from event detail.

**Why the Maps JavaScript API is loaded in the browser rather than proxied:** map tiles are
a client concern, and proxying them through Cloud Run would add latency and cost for no
benefit. This is the one service the frontend talks to directly.

**Implementation:** [`frontend/src/components/events/EventMap.tsx`](../frontend/src/components/events/EventMap.tsx)

Markers are managed imperatively against the plain Maps JS API rather than through a React
wrapper, which keeps marker churn out of the React render path. The list and map views
share one data source, so switching never refetches.

**The key is public and must be restricted.** It ships in the bundle because it has to.
Protection is an **HTTP referrer restriction** plus an **API restriction** to the Maps
JavaScript API only — set both before the URL goes anywhere.

**Failure behaviour:** with no key the map view shows an explanation of exactly what is
missing, and the list view is entirely unaffected.

---

## 7. Cloud Logging — observability

**What it does:** collects structured application logs with trace correlation.

**Why no logging library:** Cloud Run ingests structured JSON from stdout into Cloud
Logging automatically. Emitting the documented field names is the officially supported
integration and needs no dependency at all.

**Implementation:** [`backend/src/config/logger.ts`](../backend/src/config/logger.ts)

```json
{
  "severity": "INFO",
  "message": "RSVP created",
  "eventId": "aCCRq1vou...",
  "uid": "...",
  "logging.googleapis.com/trace": "projects/<id>/traces/<trace-id>"
}
```

The trace id is lifted from `X-Cloud-Trace-Context`, which makes a single log line
clickable through to the whole request trace. In development the same logger prints a
readable single line instead, so local output stays human.

Health checks are excluded from request logging — they fire constantly and would bury
everything else. Rate-limit rejections log once per window rather than per request, so a
hot client cannot also flood logging.

---

## 8. Supporting services

### Secret Manager

`gemini-api-key` and `maintenance-token`, injected at **runtime** via `--set-secrets`.
Neither is ever a build argument: build args appear in build logs and image history.

### Cloud Scheduler

Calls `POST /api/maintenance/expire` hourly with a shared secret in `X-Maintenance-Token`,
compared in constant time.

**Expiry is handled at two levels on purpose.** Every active-board query filters on
`endsAt`, so a finished event cannot appear even one second after it ends. The sweep is
bookkeeping on top. **A missed sweep costs accuracy in the admin view, never correctness
for users** — which is why this deployment works correctly even with Scheduler not
configured at all.

### Artifact Registry

Stores container images at `REGION-docker.pkg.dev/PROJECT/nearby-objects`. Replaces the
deprecated Container Registry.

### Cloud Build

[`cloudbuild.yaml`](../cloudbuild.yaml) builds, pushes and deploys.

> **This file is load-bearing, not convenience.** `gcloud builds submit --tag` cannot build
> this project: it expects a Dockerfile at the source root, and it cannot pass
> `--build-arg`. Vite inlines `VITE_*` at **build** time, so without build args the deployed
> bundle would ship with an empty Firebase config and no Maps key — sign-in and the map
> would fail in production while the build reported success.

---

## Configuration reference

### Runtime (Cloud Run environment)

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | set by Cloud Run | Listen port |
| `NODE_ENV` | yes | `production` enables JSON logging and the CSP |
| `GCP_PROJECT_ID` | yes | Firestore, Vertex AI, log trace paths |
| `SERVE_STATIC` | yes | `true` serves the SPA from the API |
| `GCS_BUCKET` | for images | Bucket name, no `gs://` |
| `AI_PROVIDER` | no | `api` or `vertex` |
| `GEMINI_API_KEY` | if `api` | **From Secret Manager** |
| `VERTEX_LOCATION` | if `vertex` | Defaults `us-central1` |
| `MAINTENANCE_TOKEN` | for Scheduler | **From Secret Manager** |
| `CORS_ORIGINS` | no | Same-origin is always allowed |
| `GOOGLE_APPLICATION_CREDENTIALS` | **no** | **Leave unset on Cloud Run** — the attached service account is used automatically |

### Build time (inlined into the bundle, public by design)

`VITE_API_BASE_URL` (empty for same-origin), `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_GOOGLE_MAPS_API_KEY`

### Local-only

`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`,
`VITE_FIREBASE_AUTH_EMULATOR_HOST` — all must be unset in any real deployment.

---

## IAM: least privilege

The runtime service account `nearby-objects-run@PROJECT.iam.gserviceaccount.com` holds
only what the application actually uses. The default Compute service account is
deliberately **not** used — it is far broader than required.

| Role | Needed for |
|---|---|
| `roles/datastore.user` | Firestore reads and writes |
| `roles/storage.objectAdmin` | Upload and delete event images |
| `roles/secretmanager.secretAccessor` | Read the two secrets |
| `roles/logging.logWriter` | Write to Cloud Logging |
| `roles/firebaseauth.admin` | Verify ID tokens |
| `roles/aiplatform.user` | Vertex AI, only when `AI_PROVIDER=vertex` |

Provisioned by [`scripts/gcp-setup.sh`](../scripts/gcp-setup.sh), which is idempotent.

---

## Graceful degradation

Every optional integration can be absent without taking the product down. This is checked,
not assumed — `GET /api/health` reports what is actually configured.

| Missing | What happens |
|---|---|
| Gemini | AI buttons do not render; everything else works |
| Cloud Storage | Upload control explains it is off; events publish without a photo |
| Maps key | Map view explains what is missing; list view unaffected |
| Cloud Scheduler | Board stays correct; only `EXPIRED` bookkeeping lags |
| Firebase Auth | Browsing, search, filters and map still work; sign-in explains it is unconfigured |
| **Firestore** | **Hard dependency.** `/api/health` returns 503 and says so |

---

## Cost at demo scale

Everything sits inside or near the always-free tier.

| Service | Free tier | This app |
|---|---|---|
| Cloud Run | 2M requests, 360k GB-s/month | One small instance |
| Firestore | 50k reads, 20k writes, 1 GiB/day | ≤400 reads per Explore request |
| Cloud Storage | 5 GB standard | Images capped at 5 MB |
| Gemini | Free tier on the Developer API | Two call sites, rate limited |
| Maps JS API | $200/month credit | Map view only |
| Cloud Scheduler | 3 jobs free | One hourly job |
| Cloud Logging | 50 GiB/month | Structured, health checks excluded |

> **Before a live demo:** `--min-instances=1`. Cloud Run scales to zero and a cold start in
> front of judges is avoidable. Set it back to `0` afterwards.
