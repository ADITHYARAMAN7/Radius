# Nearby-Events — Local Event Bulletin Board
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
- `main` = the foundation. **Never commit to main, never merge into main.** All work goes on `suhas-dev`,
  pushed to `origin/suhas-dev`. At the very end: one pull request `suhas-dev → main` for Kanish to review.
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
- Images: Cloud Storage. AI: Gemini (`@google/genai`, default model `gemini-3.8-flash`, or Vertex AI).
  Note: Google no longer offers `gemini-2.5-flash` to new API keys (404) — that was main's old default.
- Maps: Google Maps JS API via `@googlemaps/js-api-loader` (Explore map + event detail map).
- Deploy: one Docker image (`docker/Dockerfile`) built by `cloudbuild.yaml` → **Cloud Run** (`asia-south1`).
  Gemini key goes in **Secret Manager**, injected at runtime. `VITE_*` values are public build args.
- Expiry: list query filters by `endsAt >= now` and `status == ACTIVE`; plus `POST /api/maintenance/expire`
  (protected by `MAINTENANCE_TOKEN`) for Cloud Scheduler to flip old events to `EXPIRED`.
- Security: `firestore.rules` (public read, owner-only writes, rsvpCount/status/creatorId not client-writable).

### Useful commands (from repo root)
- `npm run install:all` — install root + backend + frontend (uses `cd`, so it never edits package.json)
- `npm run dev:local` — **local dev with no GCP project**: Firestore + Auth emulators (project `demo-nearby`),
  seeds demo data, runs API + web. Emulator UI on :4000. Needs Java 21 + global `firebase-tools`, and
  `backend/.env` / `frontend/.env` set up as in README "Run locally with emulators". Data is in-memory.
- `npm run dev` — run API (:8080) + web (:5173) together; Vite proxies `/api` to :8080.
- `npm run seed` / `npm run seed:clear` — demo data from `scripts/seed-events.ts`
  (42 events: 34 upcoming + 8 expired, 15 Coimbatore neighborhoods incl. 5 Amrita/Ettimadai events)
- `npm run typecheck`, `npm run build`
- `npm run verify --prefix backend` — backend checks script
- Full deployment guide: `docs/gcp-deployment.md`

### Status (end of Oct 2, branch `suhas-dev`, PR open to `main`)
- Typecheck + production build clean; `npm run verify --prefix backend` 134/134 against the emulators;
  scripted API regression 38/38 (board, expiry, filters, create/edit/cancel/reactivate/delete, ownership,
  RSVP/un-RSVP, share link, calendar, insights, AI assist/search, Snap-a-Poster).
- All 4 must-haves and all 4 listed features work. Main's extras: login, edit/cancel/reactivate/delete,
  Explore map, near-me filter, AI assist + AI search, insights, iCal/Google Calendar export, QR flyer, share
  menu, dark mode, My Events / My RSVPs / Profile.
- Added on suhas-dev: local emulator setup (`npm run dev:local`), Snap-a-Poster (idea by Adhi), Places
  autocomplete (needs Maps key; manual fallback), spelling-proof neighbourhood filter + suggestions, Popular
  badge, Amrita/Ettimadai seed events (42 total), month calendar view, installable PWA, Gemini fallback model.
- Docs updated to match: README, `docs/roadmap.md`, `docs/presentation-slides.md`, `docs/demo-script.md`.
  **Not yet reviewed:** `docs/cognizant-hackathon-report.md`, `docs/architecture*.md` may still contain old
  claims (e.g. Gemini 1.5) — check before submitting them.
- **Not verified by a human in the browser yet** (only API + build): see the click-through list in the PR.

---

## 3. Priority to-do list
**Change of plan (Oct 2):** Kanish isn't available, so Cloud Run deployment moves to tonight / tomorrow morning.
Today everything runs and is tested **locally** on Suhas's Windows laptop (PowerShell), using the **Firebase
emulators** (Firestore + Auth) instead of a real GCP project, plus a Gemini API key from Google AI Studio.
There is **no Google Maps key yet**.

### Features today — ✅ all 7 done on Oct 2 (details in the Progress log)
1. **Local setup**: Firebase emulators (Firestore + Auth) + seeded demo data + fix the `npm run install:all`
   quirk (`npm install --prefix` adds a stray `"nearby-objects": "file:.."` dependency to both package.json files).
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
2. **Names**: replace every `nearby-objects` placeholder with the real IDs — `cloudbuild.yaml` (`_SERVICE`,
   `_REPO`, service account `nearby-objects-run@…`), `.env.example` values, the `gcloud` commands in the guide.
   Decide the app's display name too (UI says "Nearby-objects", manifest/repo say "Nearby-Events").
3. **Firebase**: add the project in Firebase; Firestore (Native) in `asia-south1`; deploy `firestore.rules`
   and `firestore.indexes.json`; **Auth → enable Email/Password and Google**, and add the Cloud Run URL to
   **Authorized domains**; register a Web app and copy its config into the `_VITE_FIREBASE_*` substitutions.
4. **Storage**: create the bucket (`GCS_BUCKET`) if image upload is wanted.
5. **Gemini key** → **Secret Manager** secret `gemini-api-key` (and `maintenance-token`); grant the Cloud Run
   service account *Secret Accessor*. Never a build arg, never committed.
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
  `frontend/public/manifest.webmanifest` ("Nearby-Events", theme `#0f172a` = existing meta, background
  `#f8f9fc`), icons in `frontend/public/icons/` (192, 512, maskable 512, apple-touch 180) generated from the
  favicon by `node scripts/generate-pwa-icons.mjs` (headless Chrome/Edge, no new deps). index.html links them.
  Backend serves `.webmanifest` with `no-cache` (it was going to be cached "immutable" for a year).
  Checked with the built backend + SERVE_STATIC=true: manifest `application/manifest+json`, icons `image/png`.
  **For later:** (1) the app calls itself "Nearby-objects" (title, navbar, package.json, README) while the
  manifest/repo say "Nearby-Events" — decide on one name; (2) the SPA fallback returns index.html (200) for
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
  **Still open (not fixed):** app display name ("Nearby-objects" vs "Nearby-Events"); report/architecture docs
  not re-checked; Places spellings need the real key; events are single-day only.
  PR `suhas-dev → main` opened for Kanish — do not merge without review.
