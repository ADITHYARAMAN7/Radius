# Radius — Local Event Bulletin Board
Cognizant NPN GCP Hackathon · Use Case 5

This file is the shared brief for everyone on the team and for Claude Code. Read it fully before doing anything.
Last updated: Oct 2, 2026 (plan changed: local-first build today, deployment moved to tonight/tomorrow).

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
- Original brief: `docs/hackathon_brief.pdf` — kept locally only, **never committed** (it is marked
  Cognizant-confidential and contains the other teams' use cases). Use Case 5 only.

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

### Branches — what we take from where
- `main` = the shared, working version. On Oct 3 Suhas merged PR #2 (`suhas-dev → main`), so `main` now has
  everything from both branches. Still: never commit to `main` directly — work on a branch (`suhas-dev`),
  pull `main` into it first, then open a PR.
- `thahseen` = identical to main (same commit) — ignore it.
- `adhi` = separate Flask app. **Do not merge it or copy its code.** We only RE-IMPLEMENT one idea from it
  (Snap-a-Poster) properly inside main's architecture. Do NOT bring over: in-memory storage, device-id RSVP
  without login, unauthenticated delete, its date handling, its fake "mock" AI fallback (it invents a date two
  days out), "Ask the Board" and "Community Pulse" (main already has AI search and the Insights page), or any
  feature its README claims but its code doesn't implement (Smart Trust Layer, Plan My Trip, Live Board).

### Stack (main)
- `frontend/` — React 18 + TypeScript + Vite + Tailwind. Firebase Auth (login) in the browser.
- `backend/` — Node 20 + Express + TypeScript. Zod validation, helmet, rate limiting, structured logger.
- Database: **Cloud Firestore** (`events`, `events/{id}/rsvps`, `users`, `users/{uid}/attending`).
- Images: Cloud Storage. AI: Gemini (`@google/genai`, default model `gemini-3.5-flash-lite` (cheapest; tested on all 4 AI features), fallback `gemini-3.1-flash-lite`, or Vertex AI).
  Note: Google no longer offers `gemini-2.5-flash` to new API keys (404) — that was main's old default.
- Maps: Google Maps JS API via `@googlemaps/js-api-loader` (Explore map + event detail map).
- Deploy: one Docker image (`docker/Dockerfile`) built by `cloudbuild.yaml` → **Cloud Run** (`asia-south1`).
  Gemini key goes in **Secret Manager**, injected at runtime. `VITE_*` values are public build args.
- Expiry: list query filters by `endsAt >= now` and `status == ACTIVE`; plus `POST /api/maintenance/expire`
  (protected by `MAINTENANCE_TOKEN`) for Cloud Scheduler to flip old events to `EXPIRED`.
- Security: `firestore.rules` (public read, owner-only writes, rsvpCount/status/creatorId not client-writable).

### Useful commands (from repo root)
- `npm run install:all` — install root + backend + frontend (uses `cd`, so it never edits package.json)
- `npm run dev` — **local mode (from main, zero config)**: with no project/credentials/emulator host in
  `backend/.env`, it starts the Firestore + Auth emulators (project `demo-radius`, data kept in
  `.emulator-data/`), seeds the demo board, runs API (:8080) + web (:5173). Photos go to local disk; AI uses
  Gemini if `GEMINI_API_KEY` is set, otherwise the built-in rule-based assistant. "Continue with the demo
  account" on the sign-in page. Needs Java 21. `npm run dev:local` is an alias.
- `npm run dev:cloud` — API + web against a real Google Cloud project (no emulators).
- `npm run seed` / `npm run seed:clear` — demo data from `scripts/seed-events.ts`
  (43 events: 35 upcoming incl. one always "live now" with check-in code `NEARBY`, + 8 expired;
  15 Coimbatore neighbourhoods incl. 5 Amrita/Ettimadai events)
- `npm run typecheck`, `npm run build`
- `npm run verify --prefix backend` (134 checks), plus `npx tsx src/scripts/verify-intelligence.ts` (18) and
  `npx tsx src/scripts/verify-pulse.ts` (33) from `backend/`
- Full deployment guide: `docs/gcp-deployment.md`

### Status (end of Oct 2, branch `suhas-dev` = main merged in, PR #2 open to `main`)
- Typecheck + production build clean. verify 134/134, verify-intelligence 18/18, verify-pulse 33/33 against
  the emulators; scripted API regression (board, expiry, filters, CRUD + ownership, RSVP, share, calendar,
  insights, AI, plus main's recommended/trending/leaderboard/weather/Q&A/save/check-in/geocode).
- All 4 must-haves and all 4 listed features work. Original extras: login, edit/cancel/reactivate/delete,
  Explore map, near-me filter, AI assist + AI search, insights, iCal/Google Calendar export, QR flyer, share
  menu, dark mode, My Events / My RSVPs / Profile.
- From main (Kanish, Thahseen): Recommended for you (Local Relevance Score), Trending (Event Pulse), QR
  check-in, neighbour points + leaderboard (/community), Q&A, save for later, event-day weather (Open-Meteo),
  map pins from the address (Nominatim, server-side) + draggable pin, Leaflet/OSM map without a Google key,
  voice search, zero-config local mode with a rule-based AI fallback.
- From suhas-dev: Snap-a-Poster (idea by Adhi; Gemini only), Places autocomplete (with a Maps key) feeding
  the draggable pin, spelling-proof neighbourhood filter + suggestions, Popular badge, Amrita/Ettimadai seed
  events, month calendar view, installable PWA, Gemini fallback model, deploy fixes ($BUILD_ID, TZ).
- **Security (fixed Oct 3, Kanish OK):** `firestore.rules` now denies client reads of `/events`, so check-in
  codes can't be read straight from Firestore. The board stays public through the API, which only sends the
  code to the organiser.
- Docs match the deployment (Oct 3): report, current-status, architecture-diagram (+ svg), security,
  gcp-deployment/gcp-architecture names + Vertex `global`, slides, demo script, README.
- **Not verified by a human in the browser yet** (only API + build): see the click-through list in the PR.

---

## 3. Priority to-do list
**Change of plan (Oct 2):** Kanish isn't available, so Cloud Run deployment moves to tonight / tomorrow morning.
Today everything runs and is tested **locally** on Suhas's Windows laptop (PowerShell), using the **Firebase
emulators** (Firestore + Auth) instead of a real GCP project, plus a Gemini API key from Google AI Studio.
There is **no Google Maps key yet**.

### Features today — ✅ all 7 done on Oct 2 (details in the Progress log)
1. **Local setup**: Firebase emulators (Firestore + Auth) + seeded demo data + fix the `npm run install:all`
   quirk (`npm install --prefix` adds a stray `"radius": "file:.."` dependency to both package.json files).
2. **Snap-a-Poster** (idea from Adhi, re-implemented): upload a poster photo or paste a forwarded WhatsApp
   message → Gemini extracts title/date/time/location/category/description → pre-fills the Create Event form
   for the user to review. Reuse the existing Gemini client, `requireAuth` and the per-user AI throttle.
   If AI is unavailable, show a clear message and let the user fill the form manually — never invent data.
   Credit Adhi in the slides.
3. **Google Places Autocomplete** for location. Today the form has free-text Neighbourhood + City and asks for
   raw latitude/longitude, which brings back inconsistent localities ("Lane 12 RK Nagar" vs "Radha Krishna
   Nagar"). Reuse the Maps loader in `EventMap.tsx` and load the `places` library. On selection, auto-fill
   address, neighborhood (`sublocality_level_1` → `sublocality` → `locality`), city (`locality`), lat, lng.
   Keep fields editable; hide raw lat/lng inputs. **With no Maps key (today's case) the form must fall back to
   the current manual fields.**
4. **"Popular" badge** on event cards + a few Amrita/Ettimadai demo events in the seed data.
5. **Month calendar view**: month grid with event counts per day → click a day → that day's events.
   The card grid stays the default home view (the brief requires it).
6. **PWA "Add to Home Screen"** — only if time allows.
7. **Final check**: full regression test, update docs/slide text to reality, update this log, open the
   pull request `suhas-dev → main`.

### Tonight / tomorrow morning (with Kanish) — deployment checklist
Follow `docs/gcp-deployment.md`; deploy **this branch's code** (after Kanish merges the PR, or from `suhas-dev`).
1. **Project & budget**: create the GCP project on the free trial (never "Upgrade"); **budget alert** on the
   billing account (alerts at 50% / 90% / 100% of a small budget).
2. **Names**: replace every `radius` placeholder with the real IDs — `cloudbuild.yaml` (`_SERVICE`,
   `_REPO`, service account `radius-run@…`), `.env.example` values, the `gcloud` commands in the guide.
   Decide the app's display name too (UI says "Radius", manifest/repo say "Radius").
3. **Firebase**: add the project in Firebase; Firestore (Native) in `asia-south1`; deploy `firestore.rules`
   and `firestore.indexes.json`; **Auth → enable Email/Password and Google**, and add the Cloud Run URL to
   **Authorized domains**; register a Web app and copy its config into the `_VITE_FIREBASE_*` substitutions.
4. **Storage**: create the bucket (`GCS_BUCKET`) if image upload is wanted.
5. **Gemini key** → **Secret Manager** secret `gemini-api-key` (and `maintenance-token`); grant the Cloud Run
   service account *Secret Accessor*. Never a build arg, never committed.
   **Quota:** Suhas's free AI Studio key hit "429 You exceeded your current quota" after a day of testing.
   For the demo, use a key on the **free-trial project with billing linked** (usage comes out of the $300
   credit), or `AI_PROVIDER=vertex` (no key; billed to the trial). Don't demo on a free-tier key.
6. **Maps key**: enable **Maps JavaScript API** + **Places API (New)**; restrict the key by **HTTP referrer**
   (`http://localhost:5173/*` + the Cloud Run URL) and by **API**; set **daily quota caps** (~500/day Places);
   pass it as `_VITE_GOOGLE_MAPS_API_KEY`.
7. **Build & deploy**: `gcloud builds submit --config cloudbuild.yaml --substitutions=…` (image tag now uses
   `$BUILD_ID`, which works for manual builds). Env includes `TZ=Asia/Kolkata`.
8. **Seed** the real DB (`npm run seed` with `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account key
   kept outside git, or from Cloud Shell). **Re-seed on the morning of Oct 6** — seed dates are relative to the
   day you seed, so events seeded on Oct 3 will have started expiring by the demo.
9. **Cloud Scheduler** job calling `POST /api/maintenance/expire` with header `X-Maintenance-Token` (hourly).
10. **Monitoring for the slides**: Cloud Logging screenshots (look for "Gemini busy or slow, retrying once"
    and "Poster extraction complete"), Cloud Run metrics dashboard, **uptime check on `/api/health` + alert**.
11. **Smoke test on the real URL**: `/api/health` shows firestore connected + gemini configured; sign in;
    post; RSVP; Snap-a-Poster; Places autocomplete (check Gandhipuram / Ettimadai spellings against the seed);
    "Today" filter shows an event starting before 5:30 AM IST (TZ check); install on a phone.
12. Demo day: `--min-instances=1` before the demo (back to 0 after), re-seed, run `docs/demo-script.md`.

### After that
- **Presentation & video**: build the deck from `docs/presentation-slides.md`, record a 2–3 min demo video,
  rehearse. Everyone must be able to explain the architecture. Credit Adhi for Snap-a-Poster.

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
- `.env`, `.env.*` (except `.env.example`), `service-account*.json` and `docs/hackathon_brief.pdf` must never
  be committed (`.gitignore` covers the key files).
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
- (Oct 2, after merging main) **Fallbacks without a Google key are OpenStreetMap**: Leaflet + OSM tiles for the
  map, and Nominatim for **one-off server-side geocoding** of a typed address (≤ 1 request/s, identifying
  User-Agent, 24 h cache, only on "Find from address" or when an event is saved without a pin). That is
  allowed by Nominatim's policy. Autocomplete is Google Places with a key; **without a key it is Photon**
  (komoot's OpenStreetMap search, which allows search-as-you-type under fair use): `/api/places/suggest`
  (server-side, 10 min cache, ≥ 3 chars, 300 ms debounce in the browser) and `/api/places/resolve` (one reverse
  lookup per pick for the suburb). Taluk names (Perur, Podanur) are mapped to "Coimbatore"; names are snapped
  to the board's existing spellings. Never use Nominatim for autocomplete.
- AI fallback order: Gemini main model → `GEMINI_FALLBACK_MODEL` → built-in rule-based assistant (assist and
  search only). **Snap-a-Poster is Gemini-only** — rules cannot read a poster and must never invent details.
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
- Its Gemini model name `gemini-3.8-flash` turned out to be right: main's old `gemini-2.5-flash` is no longer
  available to new keys, so main now defaults to `gemini-3.8-flash` too.
- Its Snap-a-Poster fallback returns made-up details (a date two days out) when Gemini fails.
- Worth re-implementing: **Snap-a-Poster** only (§3 item 2). See the branches rules in §2.

---

## 7. How to work with me (the user)
- I'm a student and not strong in backend yet. Explain what you're doing in plain language, briefly.
  When something involves GCP setup, give me exact console clicks or commands step by step.
- All commands must work in **Windows PowerShell**.
- Before adding anything not in §3, check it against the priorities and the remaining days.

### Rules for every feature
1. **Plan first**: a short plan listing which files will be touched and why. Wait for Suhas's "go".
2. **Additive changes only.** Don't refactor, rename or restyle existing code unless the feature truly needs it
   (and say so). Follow existing patterns: routes → services, Zod validation via `middleware/validate.ts`, the
   shared logger, `AppError`, `requireAuth` + the existing per-user AI throttle, UI primitives in
   `components/ui`, the existing `CATEGORIES` list.
3. **Degrade gracefully**: if the Gemini key / Maps key / Storage isn't configured, the app still works and
   shows a clear message — never crashes, never invents data.
4. **Check**: `npm run typecheck` and `npm run build`; if the emulators are running, also
   `npm run verify --prefix backend` against them.
5. **Test instructions**: exact step-by-step browser test, including at least one edge-case test.
6. **Commit + push `suhas-dev`**: check `git status` and `git diff --stat` first; revert unrelated changes
   (e.g. package.json edits caused by npm). Never commit `.env*`, `service-account*.json`, or the brief PDF.
7. **Bugs found in existing code**: report them; fix only if small and directly related, otherwise list them
   here for later.
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
- Oct 2 (later): On `suhas-dev`: `.gitignore` now blocks GCP key files; README port (8080) and seed command
  fixed; unused `backend/src/scripts/seed.ts` removed. Branches compared: `thahseen` = main; from `adhi` only
  Snap-a-Poster is worth re-implementing. **Plan changed**: Kanish unavailable → deployment moved to
  tonight/tomorrow; today = local build with Firebase emulators, features in the §3 order.
  Next: feature 1 (local emulator setup).
- Oct 2: **Feature 1 done** — `npm run dev:local` (emulators + seed + API + web), Auth emulator added to
  `firebase.json`, `install:all` fixed (also installs root deps now), seed script refuses a `demo-` project
  without an emulator, root `.env.example` MAINTENANCE_TOKEN emptied. Verified: 29 upcoming events listed
  soonest-first, no ended ones; sign-up → create event without image → RSVP → refetch OK; verify script
  101/101; typecheck + build clean. Java 21 + firebase-tools 15 installed on Suhas's laptop.
  Next: feature 2 (Snap-a-Poster).
- Oct 2: **Feature 2 done — Snap-a-Poster** (idea by Adhi, credit him in the slides). `POST /api/ai/extract`
  (auth + AI throttle, image ≤5 MB JPG/PNG/WebP/HEIC sniffed from bytes, and/or text ≤4000 chars) →
  Gemini structured output → `normalizeExtraction()` (date/time/category clean-up, past-date + missing-end +
  past-midnight warnings, drops a neighbourhood/city not present in pasted text) → pre-fills the Create form;
  never overwrites typed fields without asking, AI-filled fields highlighted, end time suggested as start+2h.
  Browser shrinks photos to 2000px. Tested live: WhatsApp text ("this Saturday 7pm" → correct date), poster
  photo (10/10 fields), non-event text (found=false), prompt injection ignored, past-midnight warning,
  >5 MB → 413, bad file → 400, no key → 503 message. verify 116/116.
  **Found & fixed:** (1) `gemini-2.5-flash` is no longer available to new keys (404) → default is now
  `gemini-3.8-flash`, which also fixes the existing AI assist/search; (2) `gemini-3.8-flash` often answers
  503 "high demand" → extraction retries once on `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash`), 12s
  per attempt; (3) uploads over 5 MB returned a generic 500 → `error.ts` now maps multer errors to 413/400.
  **For later:** the existing "Improve with AI" and AI search don't retry/fall back yet, so they can still fail
  while Gemini is overloaded.
  Next: feature 3 (Places Autocomplete).
- Oct 2: **Feature 3 done — Places Autocomplete** (code complete; live Google test needs the Maps key tonight).
  `PlaceAutocompleteElement` (Places API New) on the address field in EventForm (create + edit), India-only,
  biased to a 30 km circle around Coimbatore; one `fetchFields` per pick. Fills address, neighbourhood, city,
  lat/lng (venue only if empty); lat/lng inputs hidden in that mode with a "Pinned… Remove pin" line.
  Neighbourhood = sublocality_level_1 → sublocality → neighborhood → locality; if it came from locality,
  city = administrative_area_level_2 (so Ettimadai → Ettimadai / Coimbatore); same-as-city → left empty.
  Single shared Maps loader in `frontend/src/lib/maps.ts` (EventMap uses it). No key or script failure →
  form identical to before. Place ID **not stored** (would need a data-model change; nothing uses it yet).
  New `placeKey()` (letters+digits only) for `neighborhoodLower`/`cityLower` + filters, so "R.S. Puram" =
  "R S Puram" = "RS Puram"; seed uses it and now spells "R.S. Puram". `GET /api/neighborhoods` feeds a
  `<datalist>` of suggestions on the (still free-text) neighbourhood filter. verify 123/123.
  **Deploy note:** deploy this branch, or run `npm run seed:clear` after deploying, so stored keys use placeKey.
  **Tonight with the key:** pick each seed neighbourhood in the autocomplete and align any spelling that differs.
  Next: feature 4 (Popular badge + Amrita events).
- Oct 2: **Feature 4 done.** "Popular" badge: `POPULAR_RSVP_THRESHOLD = 55` in `frontend/src/lib/utils.ts`
  (+ `isPopular()`, active events only) → 7 of 34 upcoming seed events (21%); 25 would have marked 93%.
  On cards it replaces the bottom-right RSVP count with an amber "🔥 Popular · N"; on the details page it sits
  next to the category badge. Seed: +5 upcoming Amrita/Ettimadai events (two on the same day, +3 days) and
  1 past clean-up → 42 events (34 upcoming + 8 past), 15 neighbourhoods. All seed events pass the form's
  validation rules; seed:clear + seed verified on the emulator (no duplicates). verify 123/123.
  Next: feature 5 (month calendar view).
- Oct 2: **Feature 5 done — month calendar** on Explore (List | Map | Calendar). URL:
  `?view=calendar&day=YYYY-MM-DD` (`day`, because `date` is already the Today/Weekend filter). New
  `GET /api/events/calendar?from&to` (+ category/neighborhood/city): browser sends its own local midnights,
  span ≤ 43 days (Zod), status ACTIVE + startsAt range on the existing index (no new index), not-yet-ended
  only, cap 300 with a `truncated` flag. Grouped by local day of startsAt (tested: 1:00 AM IST event stored
  as previous-day UTC lands on the right day). Past days greyed/disabled; empty month → "Post an event".
  Events can't span days in our model, so each shows on its start day. verify 134/134.
  **Found & fixed:** Today/Tomorrow/Weekend filters use the server's local day, and Cloud Run runs in UTC →
  added `TZ=Asia/Kolkata` to `cloudbuild.yaml` and the deployment guide. **Tonight:** confirm on Cloud Run
  that the "Today" filter shows an event starting before 5:30 AM IST.
  Next: feature 6 (PWA, if time) or 7 (final check + PR).
- Oct 2: **Feature 6 done — installable PWA** (manifest only, **no service worker on purpose**: not needed for
  install on Chrome/iOS, and an app-shell cache risks serving an old version after a deploy).
  `frontend/public/manifest.webmanifest` ("Radius", theme `#0f172a` = existing meta, background
  `#f8f9fc`), icons in `frontend/public/icons/` (192, 512, maskable 512, apple-touch 180) generated from the
  favicon by `node scripts/generate-pwa-icons.mjs` (headless Chrome/Edge, no new deps). index.html links them.
  Backend serves `.webmanifest` with `no-cache` (it was going to be cached "immutable" for a year).
  Checked with the built backend + SERVE_STATIC=true: manifest `application/manifest+json`, icons `image/png`.
  **For later:** (1) the app calls itself "Radius" (title, navbar, package.json, README) while the
  manifest/repo say "Radius" — decide on one name; (2) the SPA fallback returns index.html (200) for
  missing files like `/assets/old.js` — should 404 for paths with a file extension.
  Next: feature 7 (final check + PR).
- Oct 2: **Feature 7 — final check.** Fresh seed:clear + seed; verify 134/134; scripted API regression 38/38;
  typecheck + build clean; production serving checked with SERVE_STATIC=true.
  **Fixed:** (1) "Improve with AI" failed and AI search silently fell back to keywords whenever
  `gemini-3.8-flash` was overloaded → all Gemini calls now share `generateWithFallback()` (12 s timeout, one
  retry on `gemini-3.5-flash`); output token caps raised (the fallback model "thinks" and was truncating JSON);
  (2) `cloudbuild.yaml` tagged images with `$COMMIT_SHA`, which is empty for manual `gcloud builds submit` →
  now `$BUILD_ID`; (3) calendar view showed "0 events" in the filter bar; (4) SPA fallback returned HTML for
  missing files → now 404 for paths with an extension. Docs rewritten to match reality (README, roadmap,
  slides, demo script; removed claims such as "Gemini 1.5", Leaflet, "197/146 automated tests").
  Headless screenshots couldn't load data reliably, so **UI click-through is still on Suhas** (list in the PR).
  **Still open (not fixed):** app display name ("Radius" vs "Radius"); report/architecture docs
  not re-checked; Places spellings need the real key; events are single-day only.
  PR `suhas-dev → main` opened for Kanish — do not merge without review.
- Oct 2 (evening): **Merged `main` into `suhas-dev`** (Kanish: recommendations + trending; Thahseen: check-in,
  points, Q&A, saved, weather, Nominatim pins + draggable pin, Leaflet fallback, voice search, local mode).
  11 conflicting files resolved, mostly "keep both". Decisions: main's zero-config `npm run dev` replaces
  my `.env`-based setup (`dev:local` is now an alias; my `install:all` fix kept); Places autocomplete feeds
  main's EventLocationPin; one Maps loader; AI chain Gemini → fallback → rules, Snap-a-Poster Gemini-only.
  Also fixed: main's package.json files had the `"radius": "file:.."` self-dependency (from Kanish's
  `npm install --prefix`), removed; duplicate auth block in firebase.json; README errors (port 5000,
  GCS_BUCKET_NAME, VITE_API_BASE_URL, 36 events, Gemini 1.5); verify test updated because createEvent now
  geocodes missing pins. Tests: verify 134/134, intelligence 18/18, pulse 33/33, API regression 50/51 (the 1 =
  Gemini free-tier quota 429, handled correctly). Suhas's local `.env` files trimmed to local-mode style
  (Gemini key kept; backups in %TEMP%\claude\*.env.bak).
  **Open:** check-in code readable via public Firestore rules (needs Kanish's OK to deny client reads);
  `sanjay` branch looks superseded by main (ask Sanjay); `adhi` branch's admin/delete-request idea → future
  moderation; no human browser click-through yet of the merged app.
- Oct 2 (night): **Full browser QA + local fixes.** Real-Chrome test suite (95 checks) → 90 pass; the 5 that
  don't are all key/account related: Google map + Places (no Maps key yet), Google sign-in (popup, needs the
  real Firebase project), Snap-a-Poster ×2 (Gemini free-tier quota 429). Added: OpenStreetMap address
  suggestions without a Google key (Photon, `/api/places/suggest` + `/resolve`, `AddressSuggest.tsx`) — tested
  Brookefields → Ram Nagar, Amrita → Ettimadai, RS Puram → "R.S. Puram"; voice search set to `en-IN` with
  clear messages for no internet / mic blocked / no mic (tested with a simulated microphone); visible app name
  is now **Radius** everywhere; home stat "City: Coimbatore". 16/16 new UI checks pass.
  **Next:** create the Maps key (then test Google map + Places live), working Gemini key, then cloud deployment.
- Oct 3: **Google Maps key added** (Suhas's project; in `frontend/.env`, gitignored). Tested live in Chrome:
  Explore + event pages show Google Maps (35 pins, no console errors); Places autocomplete widget types,
  suggests and fills venue/neighbourhood/city/pin — 9/9 picks over 3 runs (Brookefields → Ram Nagar,
  Amrita → Ettimadai, Gandhipuram Central Bus Stand → Ram Nagar). Fixed: Google sometimes labels Coimbatore
  as administrative_area_level_3 and makes villages a "locality" (Amrita → city "Ettimadai") → inside
  Coimbatore district the town is the neighbourhood and the city is Coimbatore (same rule as Photon).
  All 18 seed neighbourhood spellings match Google's. **⚠ The key is NOT restricted yet** (works from any
  website and with no referrer) — restrict it (HTTP referrers + API restriction + Places daily cap) before
  deploying. Card for GCP billing was failing; Cloud Run/Storage still blocked on billing (teammate card or
  mentor credits). Gemini: still free-tier quota.
- Oct 3: **Feature work complete on localhost; PR #2 merged into `main` by Suhas's decision** (Kanish's review
  skipped to start cloud work). Verified before merging: every non-Gemini feature works locally (full Chrome QA,
  Google map + Places live). Gemini works but the free key hits "429 quota" after a few requests — needs a
  billing-enabled key for the demo. Not code but still to do: real Google sign-in + real Firestore (free
  Firebase setup: web config + service-account key), lock the Maps key, Firestore rule for check-in codes
  (Kanish), billing (card/credits) for Cloud Run + Storage + Scheduler + monitoring, deck/video/report.
  **Next: cloud integration** (deployment checklist in §3).
- Oct 3 (night): **DEPLOYED to Google Cloud.** Live: **https://radius-x2gneiue7a-el.a.run.app** (also
  https://radius-830388660133.asia-south1.run.app). Project `radius-510418` (billing = $300 trial).
  Done: $25 budget alert (50/90/100 %); `scripts/gcp-setup.sh` (APIs, Artifact Registry `radius`, bucket
  `radius-510418-event-images`, runtime SA `radius-run`, secrets); Firebase added; Firestore
  (Native, asia-south1) + rules + indexes deployed; Auth: Email/Password + Google on; web app
  `radius-web`; real DB seeded (43 events, 18 profiles); Cloud Run in asia-south1 with
  **AI_PROVIDER=vertex, VERTEX_LOCATION=global** (Flash-Lite is only served from `global` on Vertex — not
  us-central1/asia-south1; no Gemini key in prod); Cloud Run URLs added to Firebase authorized domains; **Maps
  key locked** to localhost:5173 + both run.app URLs (other sites get PERMISSION_DENIED); Cloud Scheduler
  `expire-events` hourly (Asia/Kolkata), verified 200; uptime check "Radius health" (/api/health, 5 min)
  + alert policy emailing Suhas. Note: this project builds with the **compute default SA**
  (`830388660133-compute@…`), which needed run.admin, iam.serviceAccountUser, artifactregistry.writer,
  logging.logWriter, storage.objectViewer. Live smoke test in Chrome **16/16** (Google map, Places pick, photo
  to Cloud Storage, real sign-up, publish, RSVP, check-in NEARBY, Snap-a-Poster via Vertex, delete) — test
  user/event deleted afterwards. **Redeploy:** `.\scripts\deploy.ps1` (reads gitignored
  `frontend/.env.production`; ~5 min). Gotchas: Git Bash mangles paths like `/api/health` in gcloud args
  (use PowerShell); `gcloud alpha` isn't installed (use REST).
  **Still to do:** Suhas tests real "Continue with Google" on the live URL (can't be automated); re-seed the
  real DB on the morning of Oct 6 and set `--min-instances=1` for the demo; merge PR #3; slides / video / report; monitoring screenshots for the slides.
- Oct 3 (night): **Check-in code leak closed** (Kanish OK). Confirmed live first: the public web key could read
  every event's `checkInCode` via the Firestore REST API. `firestore.rules`: `/events` → `allow read: if false`
  (nothing in the frontend reads Firestore; the API uses the Admin SDK). Deployed to `radius-510418`;
  re-checked: direct read → PERMISSION_DENIED, site still lists 35 events, public API responses carry no codes.
- Oct 3 (late night): **Wrap-up.** Google sign-in fix: helmet's default COOP `same-origin` broke the Firebase
  popup ("window closed before finishing") → `same-origin-allow-popups` (deployed; Suhas to confirm in a real
  browser). `deploy.ps1` no longer aborts on gcloud's stderr progress. **Monitoring:** dashboard "Radius -
  live monitoring" + 7 log-based metrics (events_created, rsvps_created, poster_extractions, ai_retries,
  ai_failures, app_errors, expiry_sweeps); definitions in `monitoring/`. **Maps key** narrowed to Maps JS +
  Places + Place widgets (Geocoding etc. now denied; live map + Places verified) and **daily caps** set
  (autocomplete 1,000, place details 500, text/nearby search/photos 100, map loads 2,000). **Vertex default
  location is now `global`** in code, cloudbuild and examples (Flash-Lite isn't served in us-central1).
  `scripts/demo-day.ps1` (re-seed live + min-instances=1; `-Off` to undo) — tested on live. Brief PDF
  untracked + gitignored (it was committed in 7910b9b on main; the repo is private, history not rewritten).
  Docs rewritten to reality with measured live latency (board p95 239 ms). Note: Cloud Run still mounts the
  unused `gemini-api-key` secret (AI_PROVIDER=vertex ignores it).
  **Left for the team:** confirm Google sign-in; merge PR #3; build the PPT from `docs/presentation-slides.md`
  (screenshot the dashboard), record the video, email the submission; demo morning `.scriptsdemo-day.ps1`.
- Oct 3 (final check before merging PR #3): Google sign-in confirmed by Suhas on the live URL. typecheck + build
  clean; verify 134/134, intelligence 18/18, pulse 33/33; live Chrome smoke test 16/16 (check-in needs the board
  seeded < ~2.5 h earlier: the "Live now" event lasts 2 h 45 min from seeding, so run demo-day.ps1 shortly before
  the demo); live board 35 events, none ended, soonest first; scheduler enabled. PR #3 description updated.
