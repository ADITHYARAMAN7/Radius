# Demo script — Nearby-Events

> Written for whoever is presenting. About 5–6 minutes if you keep moving, plus questions.
> Starred steps (⭐) are the ones to keep if you are short of time: 2, 4b, 8, 10, 14.

---

## Before you start

Run through this ten minutes before, not during.

- [ ] `npm run seed` — demo events are generated **relative to today**, so they are
      always genuinely upcoming. Re-seed if the board was seeded on a previous day.
- [ ] **Set `--min-instances=1` on Cloud Run.** A cold start in front of judges is the
      one avoidable own goal. Put it back to 0 afterwards.
      ```bash
      gcloud run services update nearby-objects --min-instances=1 --region=asia-south1
      ```
- [ ] Open `/api/health` and confirm `firestore: connected` and `gemini: configured`.
- [ ] Sign in **once** beforehand so you are not typing a password on stage.
- [ ] Have a second tab already on `/insights` — switching tabs is faster than loading.
- [ ] Have the event link for step 7 copied, in case the clipboard misbehaves.
- [ ] Browser zoom at 100%, notifications off.
- [ ] For Snap-a-Poster, have **a real poster photo** on the laptop (or phone) and this WhatsApp-style text
      copied: `*Forwarded* Unplugged acoustic jam this Saturday 7pm at Brew Bay Cafe, Gandhipuram. Entry free!`
- [ ] Install the app on a phone from the Cloud Run URL ("Add to Home Screen") so you can show the icon.

**If Gemini is overloaded**, each AI call retries once on a fallback model (up to ~25 s). If both fail
the user sees "Couldn't read it automatically — please fill the form manually". Say that plainly, fill
the form by hand and move on — nothing breaks, which is itself worth saying out loud.

---

## The run

### 1 · Open on the home page  *(20s)*

> "In Coimbatore, local events live on paper posters and forwarded WhatsApp messages — easy to
> miss, impossible to search, and never taken down. Nearby-Events puts them on one board."

Scroll once to show **Happening this week**, **Most popular** (note the amber **🔥 Popular** badges),
and the category tiles with live counts.

**Say:** every number on this page is live from Firestore. Nothing is hardcoded.

---

### 2 · Explore, and search by neighbourhood  ⭐ *(30s)*

Click **Explore Events**. Point at the result count.

Type **`Gandhipuram`** in the search box.

> "Search covers title, description, category, neighbourhood and location."

**Say:** Firestore has no full-text search, so this narrows in Firestore and scores
relevance in memory. That is a deliberate trade-off, and the migration path to a real
search index is written up in the architecture doc.

*(That one sentence tends to land well with technical judges — it shows you know the
limit rather than hoping nobody asks.)*

---

### 3 · Filters  *(25s)*

Clear the search. Click **Sports**, then **This weekend**.

> "Category, date, neighbourhood, city, distance and sort."

**Point at the URL.** It now reads `?category=Sports&date=weekend`.

**Say:** filters live in the URL, so a filtered board is itself shareable and survives a
reload.

---

### 4 · Map view  *(25s)*

Hit the **Map** toggle.

> "Same result set, different view — switching does not refetch."

Click a marker. The preview card opens. Click **View full event**.

*(No Maps key? The map says it is unavailable — skip to step 5.)*

---

### 4b · Calendar view  ⭐ *(30s)*

Back on Explore, hit **Calendar**. Open **Filters → Neighbourhood → Ettimadai** (the suggestions list
offers it).

> "Here is everything happening on this campus over the next two weeks."

Click the day with **two events** (the Cloud Run study jam and the cultural night). Point at the greyed
past days.

**Say:** days follow the viewer's timezone — an event at 1 AM IST lands on the right day — and finished
events never appear, the same expiry rule as the board. The URL (`?view=calendar&day=…`) is shareable.

---

### 5 · Event details  *(30s)*

Walk the page: image, category, date, time, location with a Google Maps link, the
embedded map, full description, tags, organiser, and the RSVP count.

**Say:** this URL is the shareable permalink. It opens for anyone, signed in or not.

---

### 6 · RSVP  *(20s)*

Press **I'm Going**. The count moves immediately.

> "42 people are going."

Hover the button — it now reads **Cancel RSVP**.

**Say:** the RSVP document id *is* the user id, so a duplicate RSVP is structurally
impossible, and the count, the attendee list and the user's own list are updated in one
Firestore transaction so they cannot drift.

---

### 7 · Share  *(15s)*

Click **Share** → show WhatsApp, X, Facebook, email, add-to-calendar.
Click **Copy link** and show the toast.

---

### 8 · Snap-a-Poster  ⭐ *(60s — this is the moment)*

Click **Create event**. At the top: **Fill from a poster or WhatsApp message**.

1. Upload the **poster photo** → "Reading your poster…" → the form fills; filled fields are ringed and say
   **"Filled by AI, please check"**.
2. Or paste the WhatsApp text (`…this Saturday 7pm…`) → the date becomes **this Saturday's real date**, start
   19:00, and the end time shows **"Suggested (start + 2 hours)"**.

> "Most events here already exist as a poster or a forwarded message. Snap-a-Poster turns that into a
> structured listing in seconds — and the organiser checks every field before anything is posted."

**Say:** it never guesses — no neighbourhood or city unless the text names one, a non-event says
"Couldn't find event details", and instructions hidden in the pasted text are ignored. *Snap-a-Poster
was Adhi's idea; we rebuilt it on the production stack.*

**Places autocomplete** *(with a Maps key)*: in **Street address**, type `Brew Bay` / `Gandhipuram` and pick
a suggestion — neighbourhood, city and the map pin fill in. **Say:** this is what keeps "R.S. Puram" and
"RS Puram" from becoming two different places.

---

### 9 · Improve with AI  *(30s)*

On a fresh Create form, type a rough draft badly on purpose:

- **Title:** `football match this sunday near college`
- **Description:** `casual game, anyone can come`

Press **Improve with AI**.

Gemini returns a polished title, a structured description, a suggested category and tags.

**Point at the checkboxes.**

> "You choose which suggestions to accept. It is not all-or-nothing, and it is never
> required — you can publish without ever touching this."

**Say:** the model is instructed never to invent a date, price or address. On an events
board, a confidently fabricated time is the failure that actually matters.

Apply, fill in date, time and location, then **Publish**. It appears on the board.

---

### 10 · Smart search  ⭐ *(30s)*

Back to **Explore**. In the search box type:

> `free tech workshops this weekend`

Press **Smart search**.

The category chip, the date chip and the keywords all set themselves.

**Say this clearly — it is the strongest architectural point in the demo:**

> "Gemini does the language. Firestore does the retrieval. The model never sees event data
> and never chooses what comes back, so it cannot invent an event that does not exist."

---

### 11 · My events  *(20s)*

**My events** → created events with live RSVP counts, upcoming and past tabs, edit and
delete.
**My RSVPs** → everything you said yes to.

**Say:** past events stay here for the organiser's record, but they drop off the public
board automatically.

---

### 12 · Insights  *(20s)*

Switch to the **Insights** tab: total events, active, expired, total RSVPs, most popular
category, most active neighbourhood, and charts by category and neighbourhood.

**Say:** computed live from Firestore on each load.

---

### 13 · The GCP architecture  *(30s)*

Open `docs/architecture.md` or the diagram slide.

> "Cloud Run serves both the API and the React app. Firestore holds users, events and
> RSVPs. Cloud Storage holds event images. Gemini powers Snap-a-Poster, the assistant and
> smart search, with a fallback model when it is busy. Maps Platform does the map and the
> address autocomplete. Cloud Logging gets structured JSON. Cloud Scheduler runs the expiry sweep."

---

### 14 · On a phone  ⭐ *(15s)*

Show the **Nearby-Events** icon on the phone's home screen and open it — it runs full-screen like an app,
no app store needed.

**Close on this:**

> "Expiry is handled twice on purpose. Every query filters on end time, so a finished
> event cannot appear even one second after it ends. The scheduled sweep is bookkeeping on
> top. A missed sweep costs accuracy in the admin view, never correctness for users."

---

## Questions you should expect

**"Does search scale?"**
No, not as built, and that is deliberate. Firestore cannot do full-text, so this narrows
in Firestore and scores in memory under a hard 400-document read cap. Past a few hundred
concurrent events it needs Algolia or Typesense mirrored on write — about a day of work,
no data model change. The cap is there so reads stay bounded whatever happens.

**"What stops me editing someone else's event?"**
The uid comes from the verified Firebase ID token, never from the request body — there is
no field to put the lie in. Ownership is checked server-side on every mutation. Firestore
rules are a second lock in case a client ever talks to Firestore directly.

**"Can RSVP counts drift?"**
No. The count, the RSVP document and the user's mirror are written in one transaction, and
the RSVP document id is the uid, so a double-press cannot double-count. Deleting an event
cascades to every attendee's list. There is a test for each of those.

**"What if Gemini is down?"**
Every AI feature is additive. Each call times out after 12 seconds and retries once on a
fallback model if the main one is overloaded. If that fails too, Snap-a-Poster and the assistant
say "fill the form manually", and smart search degrades to keyword search. Nothing blocks on the
model, and it never invents data to cover a failure.

**"What if the poster is wrong or misleading?"**
The organiser reviews every field before posting. Dates in the past, missing end times and
overnight events are flagged. Places are only filled if the text names them.

**"Is this actually working, or is it mocked?"**
Real Firestore, real transactions, real Gemini calls. `npm run verify --prefix backend` runs
134 automated checks against the Firestore emulator (ownership, RSVP transaction, expiry,
calendar range, Snap-a-Poster date rules), and the full API flow is regression-tested by script.

**"What would you do next?"**
See `docs/roadmap.md`. Honestly: moderation and a real search index, in that order. Those
are what stop this being deployable today, not features.

---

## If something breaks on stage

| Symptom | Do this |
|---|---|
| Board is empty | You are looking at a stale deploy or an unseeded project. Switch to the tab you pre-loaded. |
| AI button missing | Gemini is not configured. Say so plainly and move on — it is designed to degrade. |
| Snap-a-Poster says "Couldn't read it automatically" | Gemini is overloaded. Say "it never guesses", fill the form by hand, try once more later. |
| Address field is a plain text box | No Maps key in this build — type the address, neighbourhood and city by hand. |
| Map blank | Maps key missing or referrer-restricted. The list view is unaffected; carry on. |
| Slow first load | Cold start. This is why `--min-instances=1` is on the checklist. |
| Sign-in popup blocked | Use the email/password form instead of Google. |

Do not debug live. Narrate the fallback and keep moving — judges remember recovery better
than they remember a perfect run.
