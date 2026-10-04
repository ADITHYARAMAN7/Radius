# Radius — Hackathon Presentation Deck (10 Slides)

**Cognizant NPN GCP Hackathon · Use Case 5: Local Event Bulletin Board**

> Content for the 8–10 slide deck. Everything listed as *built* runs in the app today; targets and
> plans are labelled as such. Numbers marked "target" have not been measured with real users.

---

### Slide 1 — Title
- **Radius**: the neighbourhood's event board, built on Google Cloud
- Use Case 5 — Local Event Bulletin Board
- **Team**: Kanish, Adhi, Suhas *(add the remaining team members and mentors)*
- **Stack**: Cloud Run · Firestore · Firebase Auth · Cloud Storage · Vertex AI (Gemini) · Google Maps Platform · React + TypeScript
- **Live**: https://radius-x2gneiue7a-el.a.run.app

---

### Slide 2 — Problem & current process
- Local events in Coimbatore spread through **paper posters and forwarded WhatsApp messages**.
- What goes wrong today:
  1. **Buried**: a yard sale message disappears under 200 chat messages by evening.
  2. **Stale**: posters stay up for weeks after the event — no one removes them.
  3. **Unstructured**: no consistent date, place or category — you can't search "sports this weekend near Gandhipuram".
  4. **Inconsistent places**: "Lane 12 RK Nagar" vs "Radha Krishna Nagar" for the same area.
  5. **No signal of interest**: organisers can't tell how many people are coming.
- **Stakeholders**: residents, organisers (clubs, colleges, RWAs, small sellers), the community at large.

---

### Slide 3 — Data & inputs
- **Event**: title, description, category (8 colour-coded categories), date, start/end time, venue, address,
  neighbourhood, city, optional map coordinates and image.
- **Inputs**: the post form · **a poster photo or a forwarded WhatsApp message (Snap-a-Poster)** ·
  Google Places for the address · RSVPs from signed-in users.
- **Sample data**: **43 realistic events** (35 upcoming, 8 past) across **15 Coimbatore neighbourhoods**,
  every category, including **5 events at Amrita Vishwa Vidyapeetham, Ettimadai** — dates generated relative
  to today so the board is always current.
- Stored in **Cloud Firestore** (`events`, `events/{id}/rsvps`, `users`, `users/{uid}/attending`).

---

### Slide 4 — Solution: the board (all brief requirements)
- **Card grid** of upcoming events; **next event top-left** (ordered by start time).
- **Post form** with validation on the client *and* the server.
- **Automatic expiry**: an event leaves the board the moment it ends; a protected endpoint for **Cloud Scheduler**
  marks old events `EXPIRED`, kept in a "Past" view.
- **"I'm Going"** RSVP counter — one per signed-in user, cancellable, counted in a Firestore transaction.
- **Colour-coded category badges** · **neighbourhood search** with suggestions · **shareable link** per event
  (`/events/{id}`), native share, QR flyer, Google Calendar / iCal export.
- Discovery: **Recommended for you** (Local Relevance Score with reasons), **Trending** (Event Pulse — recent
  momentum), **"Popular" badge** (55+ RSVPs), **month calendar view**, Explore **map** (Google, or OpenStreetMap
  with no key), **near-me** filter, **voice search**.
- Community: **QR check-in** ("said yes" vs "showed up"), **neighbour points, levels & leaderboard**,
  **Q&A** on each event, **save for later**, **event-day weather**.
- Organisers: **edit / cancel / reactivate / delete**, map pin from the address + draggable pin,
  **insights dashboard**; dark mode; **installable on phones**.

---

### Slide 5 — AI & automation (Gemini)
- **Snap-a-Poster** — *idea by Adhi*: photo of a poster or a forwarded WhatsApp message → Gemini reads it →
  the post form is **pre-filled for the organiser to check**. Nothing is posted automatically.
  - "this Saturday 7pm" is resolved to a real date in the user's timezone.
  - Warns about past dates, missing end times and events running past midnight.
  - **Never guesses**: a neighbourhood or city that isn't in the message is left empty; non-events return
    "Couldn't find event details"; instructions hidden in the pasted text are ignored.
- **AI assist**: rough note → clearer title, description, category, tags (user picks what to keep).
- **AI search**: "sports this weekend in Gandhipuram" → filters applied on the board.
- **Resilience**: every Gemini call has a timeout and **one retry on a fallback model** when the main one is
  overloaded; assist and search then fall back to a **built-in rule-based assistant**, so they work even
  with no key. AI is never required to post.
- **Not ML, honestly labelled**: "Recommended for you" and "Trending" are transparent, configurable scores
  (distance, interests, timing, freshness, engagement / recent growth) with the reasons shown to the user.

---

### Slide 6 — Architecture & alternatives considered
- **Browser** (React SPA) → **Cloud Run** (Node/Express API, also serves the app) → **Firestore**,
  **Cloud Storage**, **Vertex AI (Gemini 3.5 Flash-Lite)**; **Firebase Auth** for sign-in; **Maps JS + Places API (New)**
  in the browser; **Cloud Scheduler** runs the hourly expiry; secrets in **Secret Manager** (AI uses the service
  account, no key); built by **Cloud Build** into **Artifact Registry**. *(Diagram: `docs/architecture-diagram.svg`)*
- **Alternatives we weighed**:
  | Decision | Chosen | Instead of | Why |
  |---|---|---|---|
  | Compute | Cloud Run | Single Compute Engine VM (our first plan, Flask) | Scales to zero, managed HTTPS, no server upkeep |
  | Database | Firestore | SQLite on the VM / Cloud SQL | Managed, persistent across restarts, transactions for RSVPs |
  | Hosting | Cloud Run | App Engine | One container for API + app, same image locally |
  | AI access | Vertex AI, Gemini 3.5 Flash-Lite | Gemini API key, bigger models | No key to leak; billed to the project; cheapest model, tested on all 4 AI features |
  | Maps | Google Maps Platform (+ OpenStreetMap fallback) | Geoapify, Ola Maps, Photon | Best Indian sub-locality data; part of GCP. With no key the app still shows a map (Leaflet/OSM) and finds pins via Nominatim, within its usage policy |
- An early prototype kept events in server memory — data vanished on restart. That's why we moved to Firestore.

---

### Slide 7 — Implementation, security & monitoring
- **Security**: Firebase ID tokens verified server-side; only the organiser can edit/delete; Firestore rules
  block client writes to RSVP counts and status, and direct reads of events (keeps check-in codes private — a
  gap we found and closed ourselves); Maps key locked to our site + daily quota caps; Zod validation; rate limits; image type checked from file
  bytes; secrets never in the build.
- **Data quality**: Places autocomplete for addresses; neighbourhood names matched spelling-proof
  ("R.S. Puram" = "R S Puram").
- **Monitoring (live)**: one **Cloud Monitoring dashboard** — requests by status, p50/p95 latency, instances,
  uptime, events + RSVPs per hour, Gemini successes / retries / failures, server errors; **7 log-based metrics**
  from our structured JSON logs; **uptime check** on `/api/health` every 5 min with an **email alert**;
  budget alert. *(Screenshot the dashboard for this slide.)*
- **Testing**: 185 automated checks against the Firestore emulator (134 service, 18 recommendation scoring,
  33 trending) + a scripted API regression (sign-in, create, RSVP, cancel, delete, check-in, Q&A, AI)
  before every release; **live smoke test on Cloud Run 16/16**. **Zero-config local mode** lets any teammate
  run the whole app with one command; `scripts/deploy.ps1` redeploys in ~5 minutes.

---

### Slide 8 — KPIs (targets)
- **Time to post an event**: under 1 minute with Snap-a-Poster *(target)*.
- **Stale events on the board**: 0 — enforced by the query, not by hand *(by design)*.
- **Board API response time**: **p95 239 ms, median 205 ms** *(measured on the live site)*; target < 500 ms.
- **Uptime**: target 99.5 %, watched by the uptime check.
- **Events with a map pin**: > 90 % once Places autocomplete is used *(target)*.
- **Engagement**: RSVPs per event; share-link opens; weekly active organisers *(to be measured)*.
- **AI reliability**: % of Snap-a-Poster reads that succeed, and fallback-model rate (from logs).

---

### Slide 9 — Risks, mitigation & adoption
| Risk | Mitigation |
|---|---|
| Spam or inappropriate posts | Sign-in required to post; rate limits; **moderation/reporting is the next item** |
| AI misreads a poster | Organiser reviews every field; warnings shown; nothing auto-posted |
| Gemini overloaded | Timeout + fallback model; manual form always works |
| Cost overrun | GCP free trial (no auto-upgrade), $25 budget alert, daily quota caps on Maps APIs, cheapest Gemini model, scale to zero |
| Wrong locality names | Places autocomplete + spelling-proof matching |
- **Adoption & change management**: seed the board through colleges, RWAs and clubs; Snap-a-Poster lets them
  move existing posters/WhatsApp messages onto the board in seconds; installable on phones without an app store;
  share links and QR flyers bring people back from WhatsApp to the board.

---

### Slide 10 — Roadmap & reflection
- **Built now**: everything on slides 4–7.
- **Next**: moderation & reporting · reminders (email/push) · recurring and multi-day events · Tamil language ·
  shared rate-limit store · search index for scale.
- **Reflection**:
  - Choosing a persistent, managed database early mattered more than any feature.
  - Location data quality (Places + consistent names) underpins search, the map and the calendar.
  - AI is most useful when it **pre-fills and lets people check**, not when it acts on their behalf.
- **Credits**: Snap-a-Poster — idea by Adhi.

---

> **Radius: every local event on one board — always current, easy to post, built on Google Cloud.**
