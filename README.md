# Nearby-Events 📍

> **Cognizant GCP Hackathon — Use Case 5: Local Event Bulletin Board**  
> *A high-performance, real-time, AI-assisted digital community platform built on Google Cloud Platform and Firebase.*

[![Google Cloud Platform](https://img.shields.io/badge/GCP-Cloud%20Run%20%7C%20Firestore%20%7C%20Storage%20%7C%20Vertex%20AI-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Node.js 20](https://img.shields.io/badge/Backend-Express%20%2B%20Node.js%2020%20%2B%20TypeScript-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**🌐 Live on Google Cloud Run:** https://nearby-events-x2gneiue7a-el.a.run.app

---

## 📌 Overview

**Nearby-Events** is a modern, cloud-native digital community bulletin board designed to help local residents discover, post, share, and RSVP to neighborhood events, garage sales, sports games, workshops, and meetups.

It replaces the fragmentation and clutter of physical corkboards and generic social media feeds with a hyper-local, real-time, and AI-enhanced experience powered by **Google Cloud Run**, **Cloud Firestore**, **Google Cloud Storage**, **Gemini** (default `gemini-3.5-flash-lite`, via the Gemini API or Vertex AI), **Firebase Authentication** and **Google Maps Platform**.

---

## 🚀 Key Features & Capability Breakdown

### 🎯 Use Case 5 Core Requirements
- 🗂️ **Grid Board Layout**: Clean, responsive card grid layout showing upcoming community gatherings.
- ⏱️ **Automatic Date Sorting**: The next event appears top-left; Firestore orders by each event's start time (`startsAt ASC`).
- 🧹 **Automatic Expiration Logic**: An event leaves the board as soon as its end time passes; a protected endpoint (for Cloud Scheduler) marks old events `EXPIRED`, and they stay viewable under "Past / Expired".
- 👍 **"I'm Going" 1-Click RSVP Counter**: Real-time RSVP button with optimistic state updates, duplicate prevention, and attendee lists.
- 🏷️ **Color-Coded Category Badges**: Distinct visual tags for **Sports**, **Music**, **Food**, **Yard Sale**, **Technology**, **Education**, **Community** and **Other**.
- 📍 **Neighborhood & Location Search**: Search and filter by neighbourhood (with suggestions of areas that have upcoming events), city, keyword or distance radius. Spelling-proof matching: "R.S. Puram" = "R S Puram" = "RS Puram".
- 🔗 **Shareable Deep Links**: Direct permalinks (`/events/:id`) with 1-click clipboard copy, native mobile Web Share API support and a printable QR flyer.

### 🤖 AI features (Gemini)
- 📸 **Snap-a-Poster** *(idea by Adhi)*: upload a poster photo or paste a forwarded WhatsApp message; Gemini pre-fills the post form for the organiser to check. Resolves "this Saturday 7pm" in the user's timezone, warns about past dates / missing end times / overnight events, never invents a place or date, ignores instructions hidden in pasted text, never auto-posts. Needs a Gemini key.
- ✍️ **AI Event Assistant**: turns a short note into a clearer title, description, category and tags; you pick which suggestions to keep.
- 🔎 **Natural-language search**: "sports this weekend in Gandhipuram" becomes board filters (`POST /api/ai/search`).
- 🛟 **Resilient by design**: each Gemini call has a timeout and one retry on a fallback model (`gemini-3.1-flash-lite`) when the main model is overloaded; the assistant and search then fall back to the built-in rule-based engine. AI is never required to post.

### ✨ Extended Platform Capabilities
- 🗓️ **Month Calendar View**: Explore → List · Map · **Calendar**; event counts and category dots per day, click a day for its events, shareable `?view=calendar&day=…` link. Days follow the viewer's timezone.
- ⭐ **Recommended for You**: a Local Relevance Score (distance, interests, timing, freshness, engagement) with plain-language reasons (`GET /api/events/recommended`).
- 📈 **Trending / Event Pulse**: events with fast-growing recent engagement, labelled Trending / Growing / Steady (`GET /api/events/trending`).
- 🔥 **"Popular" Badge**: cards and event pages mark events with 55+ RSVPs.
- 🗺️ **Interactive Maps View**: Google Maps with a key, otherwise a Leaflet/OpenStreetMap map — category-specific pins and location popups either way.
- 📍 **Address suggestions as you type**: with a Maps key, Google Places (API New); without one, OpenStreetMap suggestions via Photon (`GET /api/places/suggest`, server-side, cached). Picking a place fills the venue, address, neighbourhood (snapped to the board's spelling, e.g. "R.S. Puram"), city and map pin either way.
- 🎙️ **Voice search** in Chrome/Edge (Web Speech API, Indian English; needs internet and microphone permission). Hidden in browsers without speech support.
- 📱 **Installable on Phones**: web app manifest and icons for "Add to Home Screen".
- 🖼️ **Cloud Storage Cover Photos**: Secure image upload to Google Cloud Storage with size limits, validation, and CDN caching.
- 🔎 **Natural Language Search Intent AI**: Conversational natural-language query parsing (`POST /api/ai/search`) powered by Gemini.
- 👤 **User Profiles & Dashboards**: Dedicated pages for created events (`/my-events`), attending events (`/my-rsvps`), and profile management (`/profile`).
- 📊 **Platform Insights & Analytics**: Visual analytics dashboard (`/insights`) powered by Recharts displaying event metrics, category distributions, and community engagement.
- ✅ **QR Check-in (said yes vs. showed up)**: Every event has a check-in code and QR. Guests scan it or type the code at the venue (`POST /api/events/:id/checkin`); organisers see real turnout, and Insights reports the board-wide show-up rate.
- 🏅 **Neighbour Points, Levels & Badges**: Hosting (+20), RSVPing (+5) and checking in (+15) earn points, awarded in the same Firestore transaction as the action. Five levels, seven badges and a public leaderboard (`/community`).
- 💬 **Questions & Answers**: A public thread under each event, with organiser replies marked.
- 🔖 **Save for Later**: Bookmark an event without RSVPing; saved events live under a Saved tab in `/my-rsvps`.
- 🌦️ **Event-day Weather**: Forecast for the hour the event starts, at the venue (Open-Meteo, no API key).
- 📌 **Automatic Map Pins**: Organisers never type coordinates. The form finds the pin from the address or the device location and lets them drag it; if skipped, the server geocodes the address on publish (OpenStreetMap Nominatim, no API key).
- 🎙️ **Voice Search**: Speak a query on the Explore page and smart search turns it into filters.
- 🧩 **Runs With Nothing Configured**: With no `.env`, the app uses the Firebase emulators, stores photos on disk, falls back to OpenStreetMap for the map and to a built-in rule-based assistant for AI — see Quick Start.
- 🛡️ **Enterprise Security & Rate Limiting**: Helmet Content Security Policy (CSP), per-IP write limiters, per-user AI throttles, Zod schema validation, and Firebase Auth JWT token verification.

---

## 🏛️ System Architecture

![Nearby-Events Architecture](docs/architecture-diagram.svg)

### Google Cloud Infrastructure & Service Integration

| Component | GCP / Google Service | Key Purpose & Details |
|---|---|---|
| **Compute / API Server** | **Google Cloud Run** | Serverless, autoscaling container hosting the Express + TypeScript API engine. Supports single-container deployment serving both API and static frontend SPA. |
| **Database** | **Cloud Firestore** | NoSQL document database providing real-time synchronization, composite indexing (`date ASC, time ASC`), and secure rules. |
| **Object Storage** | **Google Cloud Storage** | Highly available bucket storage for uploaded event images and public assets with CDN caching. |
| **Generative AI** | **Gemini API / Vertex AI** | Snap-a-Poster (`/api/ai/extract`), content enhancement (`/api/ai/assist`) and search intent (`/api/ai/search`); `gemini-3.5-flash-lite` with a `gemini-3.1-flash-lite` fallback, built-in rules when there is no key. |
| **Identity & Auth** | **Firebase Authentication** | Secure user registration, sign-in, token issuance, and server-side JWT verification via Firebase Admin SDK. |
| **Logging & Telemetry** | **Google Cloud Logging** | Structured JSON logging with request tracing, correlation IDs, and runtime execution metrics. |

For full architectural specifications, see [docs/architecture-diagram.md](docs/architecture-diagram.md) and [docs/gcp-architecture.md](docs/gcp-architecture.md).

---

## 📂 Project Directory Structure

```
Nearby-Events/
├── backend/                      # Express + TypeScript API Server (Cloud Run target)
│   ├── src/
│   │   ├── config/               # Firebase Admin, GCP environment & logger configs
│   │   ├── middleware/           # Auth (JWT), rate limiters, Zod validators, error handling
│   │   ├── routes/               # REST API endpoints (/events, /rsvps, /ai, /uploads, /me, /meta)
│   │   ├── services/             # Business logic (event, rsvp, ai, storage, user, stats)
│   │   ├── types/                # Shared TypeScript interfaces & types
│   │   ├── utils/                # Date math, text normalization, search helpers
│   │   └── index.ts              # Express application entry point & graceful shutdown
│   ├── package.json
│   └── tsconfig.json
├── frontend/                     # React 18 + Vite + Tailwind CSS SPA
│   ├── src/
│   │   ├── components/           # UI components (EventCard, EventMap, EventFilters, EventForm, etc.)
│   │   ├── context/              # AuthContext & global state providers
│   │   ├── hooks/                # Custom hooks (useEvents, useNearby, useRsvp, useTheme)
│   │   ├── lib/                  # API client, Firebase SDK init, utility helpers
│   │   ├── pages/                # Home, Explore, EventDetails, CreateEvent, Insights, etc.
│   │   └── App.tsx               # Client-side router & lazy-loaded routes
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── scripts/
│   └── seed-events.ts            # Realistic seed script (43 upcoming & past events)
├── docs/                         # Hackathon submission documentation & presentation material
│   ├── cognizant-hackathon-report.md  # 5-page submission report
│   ├── presentation-slides.md         # 10-slide ready presentation deck
│   ├── architecture-diagram.md        # Technical architecture specifications
│   ├── architecture-diagram.svg       # Presentation-ready architecture SVG diagram
│   ├── gcp-architecture.md            # Detailed GCP service specifications
│   ├── gcp-deployment.md              # Cloud Run & GCP deployment command guide
│   ├── demo-script.md                 # Evaluator walkthrough guide
│   ├── security.md                    # Security audit & threat modeling document
│   └── roadmap.md                     # Future production roadmap
├── docker/                       # Dockerfile & Docker Compose configurations
│   ├── Dockerfile
│   └── docker-compose.yml
├── cloudbuild.yaml               # GCP Cloud Build CI/CD pipeline spec
├── firestore.rules               # Cloud Firestore security rules
├── firestore.indexes.json        # Composite indexes for compound sorting
└── package.json                  # Root monorepo orchestration scripts
```

---

## 🛠️ Quick Start & Local Development

### Fastest path: local mode (no Google Cloud project needed)

```bash
npm run install:all
npm run dev
```

With no `.env` files the app runs in **local mode**: `npm run dev` starts the Firebase emulators (Firestore + Auth), loads the demo events, and runs the API (port 8080) and the web app (port 5173). Open `http://localhost:5173` and use **Continue with the demo account** on the sign-in page.

| In production | In local mode |
|---|---|
| Cloud Firestore | Firestore emulator (data kept in `.emulator-data/`) |
| Firebase Authentication | Auth emulator |
| Cloud Storage | Photos saved to `backend/uploads/` |
| Gemini | Built-in rule-based assistant |
| Google Maps | OpenStreetMap |

The API starts the emulators itself if they are not running, so `npm run dev:api` plus `npm run dev:web` in two terminals works too. The demo board always has one event in progress; its check-in code is `NEARBY`.

To use a real Google Cloud project instead, follow steps 2–4 below and run `npm run dev:cloud` (API + web, no emulators). Setting `GCP_PROJECT_ID` or `GOOGLE_APPLICATION_CREDENTIALS` switches local mode off.

### Prerequisites
- **Node.js**: v20 or later (`>=20.0.0`)
- **npm**: v9 or later
- **Java**: 21 or later, for local mode (the Firebase emulators run on the JVM)

---

### 1. Clone & Install Dependencies

```bash
# Clone repository
git clone https://github.com/kanishmanickam/Nearby-Events.git
cd Nearby-Events

# Install dependencies for root, backend, and frontend
npm run install:all
```

---

### 2. Environment Configuration

#### Backend Environment (`backend/.env`)
Create `backend/.env` from `backend/.env.example` (full list of options there):
```env
PORT=8080
NODE_ENV=development
SERVE_STATIC=false
CORS_ORIGINS=http://localhost:5173

GCP_PROJECT_ID=your_project_id
# Service account key, kept OUTSIDE git (.gitignore blocks service-account*.json)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Gemini (Google AI Studio key). Leave empty to use the built-in rule-based assistant.
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite

# Cloud Storage bucket name (no gs:// prefix)
GCS_BUCKET=your_gcs_bucket_name
```

> **Only want to add a Gemini key to local mode?** Put just `GEMINI_API_KEY=…` in `backend/.env` —
> without a project ID, local mode stays on and Snap-a-Poster / AI use real Gemini.

#### Frontend Environment (`frontend/.env`)
Create `frontend/.env`:
```env
# Leave empty: Vite proxies /api to the API on :8080
VITE_API_BASE_URL=
VITE_GOOGLE_MAPS_API_KEY=your_maps_key   # optional: Google map + Places autocomplete
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

### 3. Seed Realistic Demo Data (43 Events)

The dataset includes **43 realistic community events** (35 upcoming — one always "live now" for the check-in demo — and 8 past events to demonstrate automatic archiving) across 15 Coimbatore neighbourhoods. Dates are relative to the day you seed, so **re-seed on the morning of a demo**:

```bash
# Populate Firestore with seed events
npm run seed

# To clear seeded events
npm run seed:clear
```

---

### 4. Run Development Servers

Run both Backend API and Frontend Web App against your Google Cloud project:

```bash
npm run dev:cloud
```

Or start them individually in separate terminals:

```bash
# Terminal 1: Backend API (Port 8080 — Vite proxies /api here)
npm run dev:api

# Terminal 2: Frontend App (Port 5173)
npm run dev:web
```

Open `http://localhost:5173` in your browser to experience **Nearby-Events**!

---

## � Complete REST API Reference

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | `GET` | Public | System health status & service availability checks. |
| `/api/stats` | `GET` | Public | Aggregate platform statistics (total events, RSVPs, categories). |
| `/api/events` | `GET` | Optional | List active events with filters (search, category, neighborhood, city, radius, date). |
| `/api/events/calendar` | `GET` | Optional | Every event starting in a date range (`from`, `to`; at most 6 weeks) for the month view. |
| `/api/events/recommended` | `GET` | Optional | Events ranked by the Local Relevance Score, with reasons. |
| `/api/events/trending` | `GET` | Public | Events with fast-growing recent engagement (Event Pulse). |
| `/api/neighborhoods` | `GET` | Public | Neighbourhoods with upcoming events, for the filter suggestions. |
| `/api/events/:id` | `GET` | Optional | Retrieve event details, related events, and attendee roster. |
| `/api/events` | `POST` | Required | Create a new community event. |
| `/api/events/:id` | `PATCH` | Required | Update an event (Owner only). |
| `/api/events/:id/cancel` | `POST` | Required | Soft-cancel an event (Owner only). |
| `/api/events/:id/reactivate` | `POST` | Required | Reactivate a cancelled event (Owner only). |
| `/api/events/:id` | `DELETE` | Required | Delete an event record (Owner only). |
| `/api/events/:id/rsvp` | `POST` | Required | RSVP "I'm Going" to an event (Idempotent). |
| `/api/events/:id/rsvp` | `DELETE` | Required | Cancel RSVP to an event (Idempotent). |
| `/api/events/:id/attendees` | `GET` | Public | List attendees for a given event. |
| `/api/events/:id/checkin` | `POST` | Required | Check in at an event with the organiser's code. |
| `/api/events/:id/comments` | `GET` | Optional | List the event's question-and-answer thread. |
| `/api/events/:id/comments` | `POST` | Required | Post a question or an organiser reply. |
| `/api/events/:id/comments/:commentId` | `DELETE` | Required | Remove a comment (author or event organiser). |
| `/api/events/:id/save` | `POST` / `DELETE` | Required | Save or un-save an event for later. |
| `/api/events/:id/weather` | `GET` | Public | Forecast for the hour the event starts. |
| `/api/community/leaderboard` | `GET` | Public | Most active neighbours and the points rules. |
| `/api/geocode` | `POST` | Required | Look up map coordinates for a written address. |
| `/api/ai/status` | `GET` | Public | Check assistant readiness and which engine answers (Gemini or built-in). |
| `/api/ai/assist` | `POST` | Required | Suggest a clearer title, description, category and tags (Gemini, or the built-in assistant). |
| `/api/ai/extract` | `POST` | Required | Snap-a-Poster: poster image and/or pasted text (multipart) → form values + warnings. Needs Gemini. |
| `/api/ai/search` | `POST` | Required | Natural-language query parsing into structured filters. |
| `/api/uploads/image` | `POST` | Required | Upload event cover photo to Google Cloud Storage. |
| `/api/me/session` | `POST` | Required | Sync/initialize current user's profile. |
| `/api/me` | `GET` | Required | Get current authenticated user profile. |
| `/api/me` | `PATCH` | Required | Update user display name, bio, or contact info. |
| `/api/me/events` | `GET` | Required | List all events created by the logged-in user. |
| `/api/me/rsvps` | `GET` | Required | List all events the logged-in user is attending. |
| `/api/me/saved` | `GET` | Required | List the events the logged-in user has saved. |

---

## 📊 Dataset Overview (43 Seed Events)

The seed generator (`scripts/seed-events.ts`) populates **43 community events** (35 upcoming, 8 past) across 15 Coimbatore neighbourhoods and 7 categories — including **5 at Amrita Vishwa Vidyapeetham, Ettimadai** and one event that is always **live now** (check-in code `NEARBY`):

- ⚽ **Sports**: 7-a-side Football, Race Course 5K Run, Badminton Ladder, Sunset Vinyasa Yoga.
- 🎵 **Music**: Carnatic Fusion Night, Acoustic Open Mic, Peelamedu Vinyl Lounge, Community Choir.
- 🍲 **Food**: Organic Farmers Market, Kongunadu Cooking Masterclass, Street Food Walk, Sourdough & Coffee Pop-up.
- 💻 **Technology**: Cloud Run & Firestore Hands-on, Python & AI for Beginners, Founders Breakfast, Hack Night.
- 📚 **Education**: Spoken English Confidence Circle, Kids Hydraulic STEM Workshop, Urban Gardening, Youth Financial Literacy.
- 🤝 **Community**: Noyyal Riverbank Cleanup, 200 Native Trees Planting, Community Repair Café, Board Game Social.
- 🏷️ **Yard Sale**: Multi-Family Street Clearance, Flat Liquidation Moving Sale, Vintage Books & Records Swap, Plant & Seed Swap, Kids Toy Clear-out.
- 🎓 **Amrita / Ettimadai**: GCP Study Jam and Campus Cultural Night (same day), Inter-College 3v3 Basketball, Hostel Food Stall Day, Book & Gadget Swap.
- ⌛ **Expired Events Archive**: 8 past events to verify automatic date filtering and past event tabs.

---

## ☁️ Deploying & operating (Windows PowerShell)

| Task | Command |
|---|---|
| Build and redeploy to Cloud Run (~5 min) | `.\scripts\deploy.ps1` (reads the gitignored `frontend/.env.production`) |
| Demo morning: re-seed live board + keep one instance warm | `.\scripts\demo-day.ps1` |
| After the demo: back to scale-to-zero | `.\scripts\demo-day.ps1 -Off` |

First-time setup: [`docs/gcp-deployment.md`](docs/gcp-deployment.md). Monitoring (dashboard, log-based metrics, uptime alert): [`monitoring/`](monitoring/README.md).

---

## 🏆 Hackathon Submission Deliverables

Full submission documentation prepared for the **Cognizant GCP Hackathon**:

| Document | Description | Link |
|---|---|---|
| 📄 **Submission Report** | 5-page detailed project report addressing problem, data, KPIs, and GCP architecture | [docs/cognizant-hackathon-report.md](docs/cognizant-hackathon-report.md) |
| 📊 **Presentation Deck** | 10-slide ready presentation deck for evaluators | [docs/presentation-slides.md](docs/presentation-slides.md) |
| 📐 **Architecture Specs** | Technical specifications & SVG schematic of the GCP stack | [docs/architecture-diagram.md](docs/architecture-diagram.md) |
| 🎯 **Demo Script** | Step-by-step evaluator testing walkthrough | [docs/demo-script.md](docs/demo-script.md) |
| ☁️ **GCP Deployment Guide** | Step-by-step Cloud Run deployment guide | [docs/gcp-deployment.md](docs/gcp-deployment.md) |
| 🛡️ **Security Audit** | Threat model, rate limiting, and security compliance | [docs/security.md](docs/security.md) |
| 🗺️ **Roadmap** | Future feature roadmap and scaling strategy | [docs/roadmap.md](docs/roadmap.md) |

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).
