# Nearby-Events — Local Event Bulletin Board
Cognizant NPN GCP Hackathon · Use Case 5

This file is the shared brief for everyone on the team and for Claude Code. Read it fully before doing anything.
Last updated: Oct 2, 2026 (after reviewing both teammates' code).

---

## 1. The hackathon (non-negotiable rules)
- Build window Oct 2–5, 2026. **In-person evaluation Oct 6, 2026** by a Cognizant panel, with a live demo.
- Team of max 6, one use case (ours is Use Case 5), one college mentor + one Cognizant mentor.
  "Participation in mentor connects" is itself scored — attend them.
- The solution **must be tied to Google Cloud Platform**.
- Submit by email before the deadline the mentors give, as **PPT and/or video** (do both to be safe).
- Deliverable format: 8–10 slides (or a 4–6 page report) covering: problem understanding, data & inputs,
  solution design, implementation & outcomes, KPIs, risks & mitigation, adoption/change management, reflection.
- "Best solution" checklist: architecture diagram + clean code, working demoable UI, short video walkthrough,
  roadmap (built now vs next), presentation covering problem, demo, impact and limits.
- Judges score: use-case & process-flow understanding, **architecture + alternatives considered**,
  **breadth of sample data**, architecture considerations, performance, UX, integration options, reusability,
  ease of implementation, real-time decision capability, **monitoring approach**, presentation quality,
  mentor participation.
- Original brief: `docs/hackathon_brief.pdf` (add it to the repo if missing). Use Case 5 only.

### Use Case 5 requirements from the brief
Must have:
1. Grid of event cards (title, date/time, location, description).
2. Post form (name, date/time, location, description).
3. Date sorting — next upcoming event top-left.
4. Expiration — events older than today hidden/removed automatically.

Listed features:
- "I'm Going" RSVP counter · color-coded category badges (Sports, Music, Food, Yard Sale…)
- Search by neighborhood · shareable link per event.

---

## 2. What we're actually building on (decided Oct 2)
Two teammates built separate versions. **Decision: Kanish's version (`main` branch) is the base.**
Adhi's Flask version is a prototype; we only port ideas from it (see §6).

### Stack (main)
- `frontend/` — React 18 + TypeScript + Vite + Tailwind. Firebase Auth (login) in the browser.
- `backend/` — Node 20 + Express + TypeScript. Zod validation, helmet, rate limiting, structured logger.
- Database: **Cloud Firestore** (`events`, `events/{id}/rsvps`, `users`, `users/{uid}/attending`).
- Images: Cloud Storage. AI: Gemini (`@google/genai`, default model `gemini-2.5-flash`, or Vertex AI).
- Maps: Google Maps JS API via `@googlemaps/js-api-loader` (Explore map + event detail map).
- Deploy: one Docker image (`docker/Dockerfile`) built by `cloudbuild.yaml` → **Cloud Run** (`asia-south1`).
  Gemini key goes in **Secret Manager**, injected at runtime. `VITE_*` values are public build args.
- Expiry: list query filters by `endsAt >= now` and `status == ACTIVE`; plus `POST /api/maintenance/expire`
  (protected by `MAINTENANCE_TOKEN`) for Cloud Scheduler to flip old events to `EXPIRED`.
- Security: `firestore.rules` (public read, owner-only writes, rsvpCount/status/creatorId not client-writable).

### Useful commands (from repo root)
- `npm run install:all` — install backend + frontend
- `npm run dev` — run API (:8080) + web (:5173) together; Vite proxies `/api` to :8080.
- `npm run seed` / `npm run seed:clear` — demo data from `scripts/seed-events.ts`
  (36 events: 29 upcoming + 7 expired, 15 Coimbatore neighborhoods)
- `npm run typecheck`, `npm run build`
- `npm run verify --prefix backend` — backend checks script
- Full deployment guide: `docs/gcp-deployment.md`

### Status as of Oct 2 review
- Backend typecheck and frontend production build both pass with zero errors.
- All 4 must-haves and all 4 listed features are implemented.
- Extras present: login, edit/cancel/reactivate/delete (owner only), Explore map, near-me filter,
  AI assist + AI search, insights dashboard, iCal/Google Calendar export, QR code, share menu, dark mode,
  My Events / My RSVPs / Profile pages.
- Docs present in `docs/`: architecture (+ SVG diagram), GCP architecture, deployment guide, hackathon report,
  10-slide outline, demo script, roadmap, security.

---

## 3. Priority to-do list (do in this order)
1. **Deploy to Cloud Run NOW** (Oct 2–3), following `docs/gcp-deployment.md`. It needs a Firebase project,
   service account, Firestore DB + rules + indexes, Storage bucket, Maps key, Secret Manager, Cloud Build.
   A working public URL is worth more than any new feature. Seed the deployed DB.
2. **Fix the location input (biggest UX/data problem).** Today the form has free-text Neighbourhood + City and
   asks users to paste latitude/longitude copied from Google Maps. That brings back inconsistent localities
   ("Lane 12 RK Nagar" vs "Radha Krishna Nagar"). Add **Google Places Autocomplete** to the address field
   (the Maps JS loader already exists in `EventMap.tsx` — reuse it, load the `places` library).
   On selection, auto-fill: address, neighborhood (prefer `sublocality_level_1` → `sublocality` → `locality`),
   city (`locality`), latitude, longitude. Keep fields editable as a fallback; hide raw lat/lng inputs.
   If no Maps key is configured, the form must still work with manual entry.
3. **Port "Snap-a-Poster" from Adhi's version**: upload a poster photo or paste a forwarded WhatsApp message →
   Gemini extracts title/date/time/location/category/description → pre-fills the create form for review.
   Fit it into the existing AI assist route/flow; reuse the existing Gemini client and rate limiting.
   Credit Adhi in the slides.
4. **Month calendar view** (only if 1–3 are done): month grid with event counts per day → click a day →
   list of that day's events. Board/grid stays the default view (the brief requires the card grid).
5. **Monitoring for the slides**: screenshots of Cloud Logging (structured logs already exist), a Cloud Run
   dashboard, an uptime check + alert. Set up the Cloud Scheduler job for `/api/maintenance/expire`.
6. **Presentation & video**: update `docs/presentation-slides.md` to the final reality, build the 8–10 slide
   deck, record a 2–3 min demo video, rehearse. Everyone must be able to explain the architecture.

---

## 4. Cost safety — must stay true
- GCP project stays on the **free trial ($300 credit)**; nobody clicks "Upgrade / Activate full account",
  so real money can't be charged.
- Set a **budget alert** on the billing account.
- Maps: set a hard **daily quota cap** on Places API and Maps JavaScript API in the console (~500/day for Places).
  Restrict the Maps key by HTTP referrer (localhost + the Cloud Run URL) and by API.
  Autocomplete must use session tokens (the official widget does this). Never call Maps APIs in loops or polling.
- Google Maps Platform free caps since March 2025 are per-SKU (e.g. 10,000/month for Essentials SKUs);
  hackathon usage is far below them, but the quota cap is the real safety net.
- Gemini key only in `.env` locally and Secret Manager in prod — never committed, never a build arg.
- `.env`, `.env.*` (except `.env.example`) and `service-account.json` must never be committed.
- Cloud Build uses `E2_HIGHCPU_8` — costs a little per build from the credit; fine, but don't loop rebuilds.

---

## 5. Decisions made (and why) — don't reopen without a good reason
- **Base = Kanish's main** because it compiles cleanly, uses a real persistent database, has proper auth and
  security, and is more GCP-native.
- Our original plan was Flask + SQLite on a single Compute Engine VM. We moved to Cloud Run + Firestore for
  autoscaling, a managed database and real-time potential. → Use this on the **"alternatives considered"** slide
  (also: Cloud SQL vs Firestore, App Engine vs Cloud Run, VM vs serverless).
- Maps provider = Google (counts as GCP integration, best Indian sub-locality data). Alternatives evaluated for
  the slide: Geoapify (3,000 free credits/day, OSM-based, weaker Indian sub-localities), Ola Maps
  (India-focused, pricing changed Sept 2026), Photon (free, no SLA). Nominatim's usage policy forbids
  autocomplete — never use it for that.
- Login gates posting and RSVP only; browsing and shared links stay public.

---

## 6. Adhi's version — why it isn't the base (keep for reference)
Single `app.py` Flask app + plain HTML/JS PWA. Nice UI and good ideas, but:
- Events stored in an **in-memory Python dict** (Firestore was in requirements but unused). Data is wiped on
  every restart/Cloud Run cold start, and with 2 gunicorn workers each worker has its own copy, so posted events
  appear/disappear between refreshes.
- `is_past()` compares a naive datetime (from the form's `YYYY-MM-DDTHH:MM`) with an aware UTC datetime →
  `TypeError` silently caught → past events are **never** hidden.
- `DELETE /api/events/<id>` has no auth — anyone can delete any event.
- Uses Gemini model name `gemini-3.8-flash` (unverified); main uses `gemini-2.5-flash`.
- Worth porting: **Snap-a-Poster** (§3 item 3). "Ask the Board" overlaps with main's existing AI search.

---

## 7. How to work with me (the user)
- I'm a student and not strong in backend yet. Explain what you're doing in plain language, briefly.
  When something involves GCP setup, give me exact console clicks or commands step by step.
- One feature at a time: plan briefly → implement → run `npm run typecheck` and `npm run build` → tell me how to
  test it in the browser → commit with a clear message. No big unrelated refactors — this codebase works; respect
  its existing patterns (services/routes/middleware split, Zod validation, logger, UI components in `components/ui`).
- Before adding anything not in §3, check it against the priorities and the remaining days.
- If something in this file looks wrong or outdated compared to the code, tell me instead of silently ignoring it.
- At the end of every session, update the Progress log below.

---

## 8. Team
- Kanish (kanishmanickam) — built main version, repo owner.
- Adhi — built the Flask prototype; should now work on main (e.g. Snap-a-Poster port).
- Me (Suhas) — coordinating, reviewing, building features with Claude Code in Antigravity.

## 9. Progress log
- Oct 2: Brief analysed, plan agreed. Both versions reviewed; main chosen as base. CLAUDE.md rewritten for the
  real stack. Next: deploy main to Cloud Run, then Places Autocomplete in the event form.
