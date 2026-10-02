# Nearby-Events — Hackathon Presentation Deck (10 Slides)

**Cognizant NPN GCP Hackathon · Use Case 5: Local Event Bulletin Board**

> Content for the 8–10 slide deck. Everything listed as *built* runs in the app today; targets and
> plans are labelled as such. Numbers marked "target" have not been measured with real users.

---

### Slide 1 — Title
- **Nearby-Events**: the neighbourhood's event board, built on Google Cloud
- Use Case 5 — Local Event Bulletin Board
- **Team**: Kanish, Adhi, Suhas *(add the remaining team members and mentors)*
- **Stack**: Cloud Run · Firestore · Firebase Auth · Cloud Storage · Gemini · Google Maps Platform · React + TypeScript

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
- **Sample data**: **42 realistic events** (34 upcoming, 8 past) across **15 Coimbatore neighbourhoods**,
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
- Extras: **month calendar view**, **"Popular" badge** (55+ RSVPs), Explore **map**, **near-me** filter,
  **insights dashboard**, organiser **edit / cancel / reactivate / delete**, dark mode, **installable on phones**.

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
  overloaded; AI is never required to post.

---

### Slide 6 — Architecture & alternatives considered
- **Browser** (React SPA) → **Cloud Run** (Node/Express API, also serves the app) → **Firestore**,
  **Cloud Storage**, **Gemini**; **Firebase Auth** for sign-in; **Maps JS + Places API (New)** in the browser;
  Gemini key in **Secret Manager**; built by **Cloud Build**. *(Diagram: `docs/architecture-diagram.svg`)*
- **Alternatives we weighed**:
  | Decision | Chosen | Instead of | Why |
  |---|---|---|---|
  | Compute | Cloud Run | Single Compute Engine VM (our first plan, Flask) | Scales to zero, managed HTTPS, no server upkeep |
  | Database | Firestore | SQLite on the VM / Cloud SQL | Managed, persistent across restarts, transactions for RSVPs |
  | Hosting | Cloud Run | App Engine | One container for API + app, same image locally |
  | Maps | Google Maps Platform | Geoapify, Ola Maps, Photon | Best Indian sub-locality data; part of GCP |
- An early prototype kept events in server memory — data vanished on restart. That's why we moved to Firestore.

---

### Slide 7 — Implementation, security & monitoring
- **Security**: Firebase ID tokens verified server-side; only the organiser can edit/delete; Firestore rules
  block client writes to RSVP counts and status; Zod validation; rate limits; image type checked from file
  bytes; secrets never in the build.
- **Data quality**: Places autocomplete for addresses; neighbourhood names matched spelling-proof
  ("R.S. Puram" = "R S Puram").
- **Monitoring**: structured JSON logs in **Cloud Logging** (request IDs, AI retries/fallbacks, extraction
  outcomes); `/api/health` reports which integrations are live; **Cloud Run metrics dashboard, uptime check
  and alert** *(set up at deployment)*; budget alert on the billing account.
- **Testing**: 134 automated service checks against the Firestore emulator + scripted API regression
  (sign-in, create, RSVP, cancel, delete, AI) before every release.

---

### Slide 8 — KPIs (targets)
- **Time to post an event**: under 1 minute with Snap-a-Poster *(target)*.
- **Stale events on the board**: 0 — enforced by the query, not by hand *(by design)*.
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
| Cost overrun | GCP free trial (no auto-upgrade), budget alert, daily quota caps on Maps APIs |
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

> **Nearby-Events: every local event on one board — always current, easy to post, built on Google Cloud.**
