# Radius — Submission Report

**Cognizant NPN GCP Hackathon · Use Case 5: Local Event Bulletin Board**
**Live:** https://radius-x2gneiue7a-el.a.run.app · **Code:** github.com/kanishmanickam/Radius (private)
**Team:** Kanish, Adhi, Suhas *(add the remaining members and mentors)*

> Everything described as *built* runs on the live Google Cloud deployment today. Numbers marked
> *measured* were taken on the live site on 3 Oct 2026; numbers marked *target* have not yet been
> measured with real users.

---

## 1. Problem understanding

In Coimbatore, local events (a temple festival, a college hackathon, a yard sale, Sunday football at the
ground) are spread by **paper posters and forwarded WhatsApp messages**. That process has five failures:

1. **Buried:** a message posted in the morning is under 200 others by evening.
2. **Stale:** posters stay on walls for weeks after the event.
3. **Unstructured:** no consistent date, place or category, so nobody can ask "sports this weekend near
   Gandhipuram".
4. **Inconsistent places:** "Lane 12 RK Nagar" and "Radha Krishna Nagar" are the same area.
5. **No signal of interest:** organisers can't tell whether 5 or 50 people are coming.

**Stakeholders:** residents (find something to do nearby), organisers (clubs, colleges, residents'
welfare associations, small sellers: reach people and gauge turnout) and the community as a whole.

**Target process:** post once (or snap the existing poster) → the event appears on one board, sorted by
date and pinned on a map → people RSVP and share it → it disappears on its own when it is over.

## 2. Data & inputs

| Input | How it enters | Stored as |
|---|---|---|
| Event details: title, description, category, date, start/end time | Post form (validated in the browser **and** the server) | `events/{id}` in Cloud Firestore |
| Location: venue, address, neighbourhood, city, map pin | **Google Places autocomplete** fills them; the pin can be dragged | same document; plus a normalised `neighborhoodLower` key |
| Poster photo or forwarded WhatsApp text | **Snap-a-Poster** → Gemini reads it → pre-fills the form | nothing is stored until the organiser publishes |
| Cover image | Upload (≤ 5 MB, type checked from the file bytes) | Cloud Storage bucket |
| RSVPs, check-ins, saves, Q&A | Signed-in users | `events/{id}/rsvps`, `users/{uid}/attending`, `…/saved`, `…/comments` |
| Identity | Firebase Authentication (email/password or Google) | `users/{uid}` profile |
| Weather on event day | Open-Meteo (free, no key), looked up by the server | not stored |

**Sample data (breadth):** 43 realistic events: 35 upcoming and 8 past, across **15 Coimbatore
neighbourhoods** and **all 8 categories** (Sports, Music, Food, Yard Sale, Community, Education,
Technology, Other). Five are at **Amrita Vishwa Vidyapeetham, Ettimadai**, and one is always "live now"
for the check-in demo. Dates are generated relative to the day of seeding, so the board always looks
current. 18 demo neighbour profiles carry RSVP and points history.

## 3. Solution design

### 3.1 Brief requirements: all met

| Requirement | How it works |
|---|---|
| Grid of event cards | Responsive card grid on Explore and Home (title, date/time, location, description, category, RSVPs) |
| Post form | Create / edit form; server-side Zod validation mirrors the browser rules |
| Date sorting, next event top-left | Firestore query ordered by `startsAt` ascending |
| Expiration | The board only shows events whose `endsAt` is still ahead; **Cloud Scheduler** calls a protected endpoint every hour to mark old events `EXPIRED` (kept in a "Past" view) |
| "I'm Going" counter | One RSVP per user, counted inside a **Firestore transaction**, so the count can't drift |
| Colour-coded category badges | 8 categories, each with its own colour and icon |
| Search by neighbourhood | Spelling-proof matching ("R.S. Puram" = "R S Puram" = "RS Puram") with suggestions |
| Shareable link | `/events/{id}` opens without signing in; native share, copy link, QR flyer, Google Calendar / iCal |

### 3.2 Beyond the brief

- **Snap-a-Poster** *(idea by Adhi)*: photo of a poster or a forwarded WhatsApp message → Gemini →
  pre-filled form. Relative dates ("this Saturday 7pm") are resolved to real dates; warnings for past
  dates, missing end times and events past midnight. It **never guesses**: a place that isn't in the text
  stays empty, non-events return "couldn't find event details", and instructions hidden in pasted text are
  ignored.
- **AI assist** (rough note → better title, description, tags) and **AI search** ("free music this weekend
  in Saibaba Colony" → filters).
- **Discovery:** Recommended for you (Local Relevance Score: distance, interests, timing, with the reasons
  shown), Trending (recent RSVP momentum), Popular badge, **month calendar**, **Google map** with pins,
  near-me filter, voice search (Indian English).
- **Community:** QR check-in at the venue (shows who actually came, not just who said yes), neighbour points
  and leaderboard, Q&A on each event, save for later, event-day weather.
- **Organisers:** edit, cancel, reactivate, delete; insights dashboard.
- **Phone-friendly:** installable as an app (PWA), dark mode.

### 3.3 Architecture

```
 Browser (React + TypeScript SPA) ──Firebase Auth (ID token)──┐
   │  Google Maps JS + Places API (New)                        │
   ▼  HTTPS /api/*                                             ▼
 Cloud Run  "radius"  (asia-south1, Node 20 + Express, serves API and the app, scales 0–10)
   ├── Cloud Firestore (Native, asia-south1)   events, rsvps, users, comments
   ├── Cloud Storage                           event images
   ├── Vertex AI: Gemini 3.5 Flash-Lite        (fallback 3.1 Flash-Lite → built-in rules)
   └── Secret Manager                          maintenance token (Gemini is reached through Vertex AI with the service account)
 Cloud Scheduler ──hourly──▶ POST /api/maintenance/expire
 Cloud Build ──▶ Artifact Registry ──▶ Cloud Run          (one command: scripts/deploy.ps1)
 Cloud Logging + Monitoring: dashboard, log-based metrics, uptime check + email alert, budget alert
```

### 3.4 Alternatives considered

| Decision | Chosen | Instead of | Why |
|---|---|---|---|
| Compute | **Cloud Run** | One Compute Engine VM (our first plan, Flask) | Scales to zero, managed HTTPS, no patching; one container runs the same locally and in the cloud |
| Hosting model | Cloud Run | App Engine | Same container image everywhere; finer control of instances and secrets |
| Database | **Firestore** | SQLite on the VM; Cloud SQL | Managed and persistent (an early prototype kept events in server memory and lost them on every restart); transactions for RSVPs; no server to size; free tier covers the demo |
| AI access | **Vertex AI** via the service account | Gemini API key | No key to leak or rotate; billed to the project; the free-tier key hit "429 quota" during testing |
| AI model | **Gemini 3.5 Flash-Lite** | Larger Flash models | Cheapest; tested on all four AI features with good results |
| Maps | **Google Maps Platform** (+ OpenStreetMap fallback) | Geoapify, Ola Maps, Photon | Best Indian sub-locality data and part of GCP; without a key the app still works on OpenStreetMap |
| Where AI runs | Server only | Browser calls | Keeps credentials server-side; per-user throttling |

## 4. Implementation & outcomes

- **Stack:** React 18 + TypeScript + Vite + Tailwind; Node 20 + Express + TypeScript; Firestore; Firebase
  Auth; Cloud Storage; Vertex AI; Google Maps; Docker → Cloud Build → Cloud Run.
- **Security:**
  - Firebase ID tokens are verified on the server, and only the organiser can change or delete an event.
  - Firestore rules stop browsers from writing RSVP counts, status or owner, and from reading event documents directly. That keeps the organisers' check-in codes private: we found this gap, fixed it and verified the fix on the live database.
  - Requests are checked with Zod, and the server limits how often each caller can act: 240 reads and 40 writes per minute per IP, and 12 AI calls per minute per user.
  - Uploaded images have their real file type checked from the bytes, not trusted from the file name. Security headers come from helmet.
  - The Maps key only works from our site and only for the Maps JavaScript API and Places, with daily quota caps.
- **Testing:**
  - **185 automated checks** run against the Firestore emulator: 134 service checks, 18 recommendation-scoring checks and 33 trending checks.
  - A scripted API regression covers the whole flow, and a **95-step browser test in real Chrome** covers the UI.
  - A **live smoke test on Cloud Run passed 16/16**: Google map, Places pick, photo upload to Cloud Storage, sign-up, publish, RSVP, QR check-in, Snap-a-Poster through Vertex AI, and delete.
- **Developer experience:** `npm run dev` runs the whole app locally with emulators, demo data and no cloud
  account; `.\scripts\deploy.ps1` rebuilds and redeploys in about 5 minutes.
- **Performance (measured, live, from Coimbatore, 15 requests each):**

  | Request | Median | p95 |
  |---|---|---|
  | App page `/` | 143 ms | 182 ms |
  | Board `/api/events` (24 events) | 205 ms | 239 ms |
  | Month calendar | 222 ms | 307 ms |
  | Health check (includes a Firestore round-trip) | 166 ms | 229 ms |

  Snap-a-Poster is a single Gemini call and returns in a few seconds; it times out at 12 s and retries once on the fallback model.

## 5. KPIs

| KPI | Value | How it is measured |
|---|---|---|
| Ended events visible on the board | **0** *(by design)* | Enforced by the query; Scheduler sweep hourly (`expiry_sweeps` metric) |
| Board API p95 response time | **239 ms** *(measured)*; target < 500 ms | Cloud Run latency chart on the dashboard |
| Uptime | target 99.5 % | Uptime check every 5 minutes + email alert |
| Time to post an event | target < 1 minute with Snap-a-Poster | Organiser testing |
| AI reliability | target > 95 % of poster reads succeed | `poster_extractions` vs `ai_failures` / `ai_retries` log metrics |
| Engagement | to be measured | `events_created`, `rsvps_created` per hour on the dashboard; check-ins vs RSVPs |
| Location quality | target > 90 % of events with a map pin | Places autocomplete + server geocoding |
| Cost | within the $300 trial; $25 budget alert | Billing budget at 50 / 90 / 100 % |

**Monitoring approach:** one Cloud Monitoring dashboard ("Radius - live monitoring") shows requests by
response class, p50/p95 latency, running instances, uptime, events and RSVPs per hour, Gemini health
(successes, retries on the fallback model, failures) and server errors. The app activity and AI charts come
from **log-based metrics** built on the API's structured JSON logs, so they cost nothing extra.
`/api/health` reports the state of Firestore, Storage, Gemini and the expiry job. Definitions are in
`monitoring/`.

## 6. Risks & mitigation

| Risk | Mitigation |
|---|---|
| Spam or abusive posts | Sign-in required to post; rate limits; **moderation/reporting is the next item** |
| AI misreads a poster | The organiser reviews every pre-filled field; AI-filled fields are highlighted; warnings shown; nothing is published automatically |
| Gemini overloaded or down | 12 s timeout and one retry on a fallback model; assist and search fall back to built-in rules; the manual form always works |
| Cost overrun | Free trial (cannot auto-charge), budget alert, daily caps on Maps APIs, Flash-Lite model, Cloud Run scales to zero |
| Leaked credentials | No secrets in the code or the build; AI via Vertex AI and the service account; secrets in Secret Manager; Maps key restricted to our site and to the three Maps APIs we use |
| Check-in codes read from the database | Found in our own review; Firestore rules now deny direct reads (verified live) |
| Wrong or inconsistent place names | Places autocomplete + spelling-proof neighbourhood keys |
| Outage unnoticed | Uptime check + email alert; dashboard |

## 7. Adoption & change management

- **Start where the posters already are:** colleges (Amrita's clubs), residents' welfare associations,
  sports clubs and temples. Snap-a-Poster turns the poster or WhatsApp forward they already have into a
  listing in under a minute, so organisers don't have to change habits to join.
- **Bring people back from WhatsApp:** every event has a share link and a printable QR flyer; the link opens
  without an account.
- **No app store:** installable from the browser on Android and iPhone.
- **Low barrier, then reward:** browsing needs no login; points, levels and the leaderboard reward
  organisers and people who actually turn up (QR check-in).
- **Rollout:** pilot with one campus and two neighbourhoods → collect the KPIs above → add moderation and
  reminders → widen to the city.

## 8. Roadmap & reflection

**Built now:** everything in sections 3–5, live on Google Cloud.

**Next:**
1. Moderation and reporting.
2. Reminders by email or push.
3. Recurring and multi-day events.
4. Tamil language support.
5. A rate-limit store shared across instances.
6. A search index for larger volumes.

**Reflection:**
- **Choose the database first.** A managed, persistent database mattered more than any feature. The prototype that kept events in memory lost them on every restart.
- **Location data quality pays off everywhere.** Places autocomplete and consistent neighbourhood names underpin search, the map and the calendar.
- **AI works best as a helper that pre-fills.** It earns trust by pre-filling and letting people check, not by acting on their behalf. It must never invent details.
- **Treat cost and monitoring as features.** Budget alerts, quota caps and an uptime alert were set up before the demo, not after.

**Credits:** Snap-a-Poster: idea by Adhi.
