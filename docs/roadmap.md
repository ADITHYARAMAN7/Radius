# Roadmap — Nearby-Events

> Written for judges and for whoever picks this up next. Split into what genuinely works
> today and what would have to happen before real neighbours could use it.

---

## BUILT NOW

Everything in this section is implemented, wired to real Google Cloud services, and
covered by automated tests unless noted.

### Core requirements

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Users can create local events | ✅ | Full form with validation on both sides |
| 2 | Title, date, time, location, description | ✅ | Plus category, tags, summary, address, neighbourhood, city, coordinates, image |
| 3 | Sorted by upcoming date/time | ✅ | Firestore `orderBy startsAt`, verified by test |
| 4 | Expired events leave the active board | ✅ | Query-level filter **and** a scheduled sweep — see below |
| 5 | "I'm Going" | ✅ | Transactional, optimistic in the UI |
| 6 | RSVP count visible | ✅ | On every card, the detail page and My Events |
| 7 | Eight categories | ✅ | Each with its own colour and icon |
| 8 | Search by neighbourhood / city | ✅ | Plus title, description, category and location |
| 9 | Shareable unique URL | ✅ | `/events/{id}`, public, deep-link safe |
| 10 | Responsive web interface | ✅ | Phone, tablet and desktop layouts; bottom nav on mobile |

### Enhanced features

| Feature | Status | Notes |
|---|---|---|
| A — Map view | ✅ | Maps JS API, category-coloured pins, marker preview, list/map toggle sharing one data source |
| B — Smart search + filters | ✅ | Today / Tomorrow / This weekend / This week / Upcoming, plus category, neighbourhood, city, distance and three sorts |
| C — Event image | ✅ | Uploaded through the API to Cloud Storage; never with client-side credentials |
| D — AI event assistant | ✅ | Gemini with a structured `responseSchema`; the user picks which fields to accept |
| E — "Improve with AI" | ✅ | Rough note → title, description, category, tags |
| F — RSVP / cancel, no duplicates | ✅ | Duplicates structurally impossible: the RSVP document id *is* the uid |
| Distance filter | ✅ | Browser geolocation + radius, great-circle filtering, shareable in the URL |
| Nearby events section | ✅ | Location-aware home section, per-card distance, radius control, remembered for a day, degrades on denial |
| G — Share | ✅ | Native share sheet, WhatsApp, X, Facebook, email, copy link, add to calendar |
| H — My Events | ✅ | Created and attending, each split upcoming / past |
| I — Event management | ✅ | Edit, cancel (soft, **reversible**), delete (cascading) |
| J — Automatic expiration | ✅ | `ACTIVE` / `EXPIRED` / `CANCELLED`; records kept, never hard-deleted by expiry |
| K — Accessibility | ✅ | Landmarks, skip link, focus-visible, `aria-live`, labelled controls, chart text alternatives, reduced-motion |
| L — Loading / empty / error states | ✅ | On every page, including a distinct offline state and an error boundary |

### Added in the final build days (Oct 2)

| Feature | Status | Notes |
|---|---|---|
| **Snap-a-Poster** — *idea by Adhi* | ✅ | Poster photo (JPG/PNG/WebP/HEIC ≤ 5 MB) or pasted WhatsApp text → Gemini structured output → pre-fills the create form. Relative dates resolved in the user's timezone; past-date, missing-end-time and past-midnight warnings; never invents a place or a date; asks before overwriting typed fields; nothing is auto-posted. Prompt-injection text is ignored (tested). |
| **Month calendar view** | ✅ | Explore → Calendar. Unpaginated `/api/events/calendar` range endpoint (≤ 6 weeks), days grouped in the viewer's timezone, past days greyed, shareable `?view=calendar&day=` URL |
| **Places Autocomplete** | ✅ code / ⏳ live test | Places API (New) `PlaceAutocompleteElement`, India-only, biased to Coimbatore; fills address, neighbourhood, city and map pin. Falls back to manual fields without a Maps key |
| **Spelling-proof neighbourhoods** | ✅ | "R.S. Puram" = "R S Puram" = "RS Puram" for filtering; filter box suggests neighbourhoods that have upcoming events |
| **"Popular" badge** | ✅ | 55+ RSVPs (≈ top fifth of the demo data) on cards and the detail page |
| **Installable PWA** | ✅ | Web app manifest + icons; no service worker on purpose (no stale versions after a deploy) |
| **Gemini resilience** | ✅ | Every AI call has a 12 s timeout and one retry on a fallback model when the main model is overloaded |
| **Local dev without a GCP project** | ✅ | `npm run dev:local`: Firestore + Auth emulators, seeded demo data, API and web in one command |

### Beyond the brief

- **Natural-language search** — a sentence becomes structured filters via Gemini, while
  retrieval stays entirely in Firestore so the model cannot invent an event.
- **Insights dashboard** — live aggregate figures and charts.
- **Dark mode** — full token-based theme, following the OS until the user chooses.
- **Vertex AI mode** — `AI_PROVIDER=vertex` runs the assistant through the Cloud Run
  service account with no API key stored anywhere.
- **Health endpoint** — `/api/health` reports which integrations are actually configured.
- **Trace-correlated structured logging** — log lines link to the Cloud Trace for the
  request.
- **Graceful degradation** — the app runs with Gemini, Cloud Storage or Firebase Auth
  each missing, and says so rather than failing.
- **Automated verification** — `npm run verify --prefix backend` runs 134 service-level checks
  against the Firestore emulator (create/edit/ownership, RSVP transaction, expiry, calendar range,
  neighbourhood matching, Snap-a-Poster date and warning rules). The full API flow, including
  sign-in through the Auth emulator, was regression-tested by script before submission.

### Google Cloud services actually used

| Service | Used for | Honestly integrated? |
|---|---|---|
| **Cloud Run** | Hosts the API and serves the SPA | Yes — Dockerfile and deploy commands included |
| **Firestore** | users, events, RSVPs | Yes — real transactions, real composite indexes |
| **Cloud Storage** | Event images | Yes — server-side upload, signed-path layout, orphan cleanup |
| **Gemini / Vertex AI** | Snap-a-Poster, listing assistance, search intent | Yes — both provider modes implemented |
| **Maps Platform** | Map view, location links, Places autocomplete | Yes (Places verified live once the production key exists) |
| **Cloud Logging** | Structured JSON with trace correlation | Yes |
| **Cloud Scheduler** | Hourly expiry sweep | Yes — endpoint and setup commands included |
| **Secret Manager** | Gemini key in production | Yes — deploy command uses `--set-secrets` |

---

## KNOWN LIMITATIONS

Stated plainly, because pretending otherwise would be worse.

**Search does not scale past a few hundred concurrent events.**
Firestore has no full-text index, so the query narrows in Firestore and scores relevance
in memory under a hard 400-document read cap. Beyond that, results past the cap are not
considered. The cap exists so reads stay bounded; the fix is a real search index.

**Rate limiting is per-instance.**
Reads (240/min), writes (40/min) and AI calls (12/min) are limited by in-memory counters,
correct for one Cloud Run instance. With several instances the effective ceiling
multiplies by the instance count; a hard global limit needs a shared store.

**No moderation.**
Anyone signed in can post anything. This is the single biggest blocker to real use.

**Places autocomplete needs a Maps key.**
Without one (e.g. local development) the form falls back to typed neighbourhood/city and
optional coordinates, so those events may not appear on the map.

**Gemini capacity is outside our control.**
The newest model is sometimes overloaded; we retry once on a fallback model, and if both fail
the user gets a clear "fill the form manually" message. AI is never required to post.

**Events are single-day.**
An event's end time must be after its start on the same date, so overnight events (10 pm–2 am)
cannot be represented yet; Snap-a-Poster warns when a poster describes one.

**No email delivery.**
No confirmations and no reminders.

**Insights aggregates the whole collection per request.**
Exact and fine at this size; would need maintained counters at scale.

**The browser UI is not covered by automated tests.**
API behaviour (including sign-in via the Firebase Auth emulator) is scripted, but screens
are checked by hand before each demo.

---

## FUTURE

Ordered by what would actually matter next, not by what is most fun to build.

### Next — required before real users

| Item | Why it is first | Rough effort |
|---|---|---|
| **Moderation and reporting** | A public board without a report button is not deployable. Report → queue → hide, plus a simple admin view | 2 days |
| **Event reminders by email** | The most requested feature of any events product, and the thing that turns an RSVP into attendance. Cloud Scheduler + an email provider | 1 day |
| **Shared-store rate limiting** | Correctness under more than one instance | Half a day |

### Then — scale and retention

| Item | Notes |
|---|---|
| **Dedicated search index** | Algolia or Typesense mirrored on write via an `onWrite` Cloud Function. Lifts the 400-document cap, adds typo tolerance and proper ranking. No data model change. |
| **Push notifications** | FCM for "an event you are going to starts in an hour" and "something new nearby in a category you follow" |
| **Recurring events** | A weekly game should be posted once, not every week. The seed data is full of events that obviously want this. |
| **Geohash queries** | Real "within 5 km of me" at the database level instead of in memory |
| **Organiser verification** | A badge for groups that have run events before, to make the board trustworthy as it grows |
| **Maintained counter documents** | Incremental aggregates for the insights view |
| **Image optimisation pipeline** | Resize and WebP on upload via a Cloud Function |

### Later — the interesting part

| Item | Notes |
|---|---|
| **Personalised recommendations** | "Because you went to three clean-ups" — embeddings over event text with Vertex AI Matching Engine, ranked against RSVP history |
| **Real-time event chat** | Firestore listeners; the data model already supports it |
| **Multilingual support** | Tamil first, given where this is aimed. Gemini can translate listings on write, and the UI needs i18n. |
| **Waitlists and capacity** | Many of the seeded events genuinely cap attendance; the field is not modelled yet |
| **Organiser analytics** | Per-event views, RSVP conversion, attendance follow-up |
| **Calendar sync** | Two-way Google Calendar rather than one-shot add-to-calendar |
| **Offline mode** | The app is already installable; a carefully versioned service worker would make saved events readable without signal |
| **Multi-day / overnight events** | End date separate from start date; the calendar would then span days |
| **Snap-a-Poster → image** | In production, the scanned poster can already become the event image; next is auto-cropping and multiple posters at once |

---

## What would be done differently with more time

Honest engineering notes rather than feature wishes.

1. **Places Autocomplete from the start.** Hand-entered coordinates were the wrong
   trade-off even for a prototype — it degraded the map, the distance filter and the
   neighbourhood filter all at once. It was added on the final build day; starting with it
   would have saved re-normalising neighbourhood names afterwards.

2. **A real search index earlier.** The in-memory relevance pass is correct and well
   bounded, but it shaped the query design around a limitation that an index removes.

3. **Automated accessibility checks in CI.** Accessibility was built in structurally and
   verified in a headless browser, but a human verifying is not the same as axe-core
   failing a build.

4. **Contract tests between client and server types.** The two `types.ts` files are kept
   in step by hand. A generated schema would make a drift impossible rather than unlikely.
