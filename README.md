# Nearby-Events 📍
> **Cognizant GCP Hackathon — Use Case 5: Local Event Bulletin Board**  
> *A high-performance, real-time, AI-assisted community event platform built on Google Cloud Platform and Firebase.*

[![Google Cloud Platform](https://img.shields.io/badge/GCP-Cloud%20Run%20%7C%20Firestore%20%7C%20Storage%20%7C%20Vertex%20AI-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Overview

**Nearby-Events** is a cloud-native digital community bulletin board designed to help local residents discover, post, share, and RSVP to neighborhood events, garage sales, sports games, and meetups. 

Powered by **Google Cloud Run**, **Cloud Firestore**, **Firebase Auth**, **Cloud Storage**, **Gemini** (default model `gemini-3.8-flash`) and **Google Maps Platform**, it replaces scattered paper notices and WhatsApp forwards with one searchable, always-current board.

---

## 🚀 Key Features

### Use Case 5 requirements
- 🗂️ **Card grid board**: every upcoming event as a card with title, date/time, location and description.
- 📝 **Post form**: name, date/time, venue and address, neighbourhood, city and description, validated on the client and again on the server.
- ⏱️ **Date sorting**: the next event is top-left; Firestore orders by the event's start time (`startsAt ASC`).
- 🧹 **Automatic expiration**: an event leaves the board as soon as its end time passes; a protected maintenance endpoint (for Cloud Scheduler) marks old events `EXPIRED`, and they stay viewable under "Past / Expired".
- 👍 **"I'm Going" RSVP counter**: one RSVP per signed-in user, cancellable, counted in a Firestore transaction.
- 🏷️ **Colour-coded category badges**: Sports, Music, Food, Yard Sale, Community, Education, Technology, Other.
- 📍 **Search by neighbourhood**: free-text filter with suggestions of the neighbourhoods that have upcoming events; spelling-proof matching ("R.S. Puram" = "R S Puram").
- 🔗 **Shareable links**: every event has its own URL (`/events/:id`) with copy-link, native share and a printable QR code.

### Added on top
- 📸 **Snap-a-Poster** *(idea by Adhi)*: upload a poster photo or paste a forwarded WhatsApp message; Gemini pre-fills the post form for the organiser to check. Relative dates ("this Saturday 7pm") are resolved in the user's timezone, nothing is invented, and nothing is posted automatically.
- 🗓️ **Month calendar view** on Explore (List · Map · Calendar): event counts and category dots per day, click a day to see its events, shareable `?view=calendar&day=…` link.
- 🔥 **"Popular" badge** on events with 55+ RSVPs.
- 🗺️ **Google Places autocomplete** for the address (fills neighbourhood, city and map pin) — switches on with a Maps key; without one the form keeps manual fields.
- 🤖 **AI assist and AI search** (Gemini): tidy up a rough description; type "sports this weekend in Gandhipuram" to set the filters. All AI calls retry once on a fallback model when the main one is overloaded.
- 🧭 **Explore map** (with a Maps key), **near-me** distance filter (browser location), **insights dashboard**, **Google Calendar / iCal export**, **edit / cancel / reactivate / delete** for organisers, **My Events / My RSVPs / Profile**, **dark mode**.
- 📱 **Installable on phones** ("Add to Home Screen" via a web app manifest).

---

## 🏛️ System Architecture

![Nearby-Events Architecture](docs/architecture-diagram.svg)

| Component | Google Cloud Service | Purpose |
|---|---|---|
| **Compute** | **Google Cloud Run** | Scalable, containerized Node.js/TypeScript backend API. |
| **Database** | **Cloud Firestore** | Real-time NoSQL document database for Events, RSVPs, and Users. |
| **Storage** | **Google Cloud Storage** | Secure, CDN-cached bucket for event cover photos and media. |
| **Generative AI** | **Gemini API / Vertex AI** | Snap-a-Poster extraction, AI assist and AI search (`gemini-3.8-flash`, fallback `gemini-3.5-flash`). |
| **Maps** | **Google Maps Platform** | Explore map, event map, Places autocomplete for addresses. |
| **Authentication** | **Firebase Auth** | User authentication with secure JWT tokens and role management. |
| **Logging & Monitoring** | **Google Cloud Logging** | Structured JSON logging with request tracing. |

For detailed architectural specifications, see [docs/architecture-diagram.md](docs/architecture-diagram.md) and [docs/gcp-architecture.md](docs/gcp-architecture.md).

---

## 📂 Project Structure

```
Nearby-Events/
├── backend/                  # Express + TypeScript API Server (Cloud Run)
│   ├── src/
│   │   ├── config/           # Firebase, GCP, and environment config
│   │   ├── middleware/       # Auth, error handling, rate limiting
│   │   ├── routes/           # REST endpoints (/events, /rsvps, /ai, /uploads)
│   │   ├── services/         # Business logic (event, rsvp, ai, storage)
│   │   └── index.ts          # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # React 18 + Vite + Tailwind CSS + Google Maps JS API
│   ├── src/
│   │   ├── components/       # EventCard, EventMap, EventFilters, EventForm
│   │   ├── context/          # Auth context and state providers
│   │   ├── pages/            # Home, Explore, EventDetails, CreateEvent, etc.
│   │   └── App.tsx           # Router and application root
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   └── seed-events.ts        # 42 realistic demo events (upcoming & expired)
├── docs/                     # Hackathon documentation & diagrams
│   ├── cognizant-hackathon-report.md  # 5-page submission report
│   ├── presentation-slides.md         # 10-slide ready presentation deck
│   ├── architecture-diagram.md        # Architecture specification
│   ├── architecture-diagram.svg       # Presentation-ready SVG diagram
│   ├── gcp-deployment.md              # Cloud Run & GCP deployment guide
│   ├── demo-script.md                 # Live presentation demo walkthrough
│   └── security.md                    # Security audit & threat modeling
├── docker/                   # Dockerfile & Docker Compose configs
├── firestore.rules           # Security rules for Cloud Firestore
├── firestore.indexes.json    # Composite indexes for compound sorting
└── package.json              # Monorepo root scripts
```

---

## 🛠️ Quick Start & Running Locally

> **No Google Cloud project yet?** Skip to [Run locally with emulators](#run-locally-with-emulators-no-google-cloud-project-needed) —
> one command (`npm run dev:local`) runs everything on your laptop. The steps directly below assume a real
> Firebase project and service account (see `docs/gcp-deployment.md`).

### Prerequisites
- Node.js 20+ & npm
- Firebase CLI + Java 21 (only for the local emulators — see below)

### 1. Clone the repository
```bash
git clone https://github.com/kanishmanickam/Nearby-Events.git
cd Nearby-Events
```

### 2. Install all dependencies
```bash
npm run install:all
```

### 3. Seed Realistic Demo Data (42 Events)
```bash
npm run seed          # add/refresh the demo events
npm run seed:clear    # remove previously seeded events first
```

### 4. Start Development Servers
In two separate terminals:
```bash
# Terminal 1: Backend API (Port 8080 — the Vite dev server proxies /api here)
npm run dev:api

# Terminal 2: Frontend Web App (Port 5173)
npm run dev:web
```

Visit `http://localhost:5173` in your browser!

### Run locally with emulators (no Google Cloud project needed)
Firestore and Firebase Auth run as local emulators under the emulator-only project id `demo-nearby`,
so nothing can touch a real project. Commands below are for Windows PowerShell (they work in other shells too).

**One-time setup**
```powershell
winget install --id EclipseAdoptium.Temurin.21.JDK -e   # Java, needed by the emulators
npm install -g firebase-tools                           # Firebase CLI (no `firebase login` needed)
# Close and reopen VS Code / the terminal so `java` is on PATH, then check:
java -version
firebase --version
npm run install:all
```

Create `backend/.env` and `frontend/.env` from their `.env.example` files with these local values:

| File | Setting |
|---|---|
| `backend/.env` | `GCP_PROJECT_ID=demo-nearby`, `FIREBASE_PROJECT_ID=demo-nearby`, `GOOGLE_APPLICATION_CREDENTIALS=` (empty), `GCS_BUCKET=` (empty), `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, optional `GEMINI_API_KEY=` from [Google AI Studio](https://aistudio.google.com/apikey) |
| `frontend/.env` | `VITE_FIREBASE_PROJECT_ID=demo-nearby`, `VITE_FIREBASE_API_KEY=emulator`, `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` |

The project id must be the same in both files, or the API rejects sign-in tokens.

**Every time**
```powershell
npm run dev:local
```
This starts the Firestore + Auth emulators, seeds the 42 demo events, then runs the API (:8080) and web app
(:5173). Open http://localhost:5173. Emulator UI (browse data and test users): http://localhost:4000.
Press `Ctrl+C` to stop. Emulator data lives in memory, so events you create disappear on stop and the next
start reseeds fresh demo data.

**Signing in:** click *Create account* and use any made-up email and a 6+ character password
(e.g. `test@example.com` / `test1234`). *Continue with Google* also works and shows a fake account picker.

**What is off locally:** image upload (Cloud Storage isn't emulated, the form says so), maps (no Maps key),
and AI features until you add `GEMINI_API_KEY`. Everything else works.

---

## 📊 Breadth of Sample Data

The platform comes with a pre-configured seed generator in `scripts/seed-events.ts` providing **42 realistic community events** (34 upcoming, 8 past) across 15 Coimbatore neighbourhoods, including 5 at Amrita Vishwa Vidyapeetham, Ettimadai:
- **Sports**: 7-a-side football at VOC Grounds, badminton doubles ladder, Race Course 5K run, rooftop yoga, inter-college 3v3 basketball.
- **Music**: acoustic open mic, Carnatic & fusion night, community choir, vinyl & jazz listening lounge, campus cultural night.
- **Food**: organic farmers market & tiffin stalls, Kongunadu cooking masterclass, heritage street-food walk, sourdough & coffee pop-up, hostel food stall day.
- **Yard Sale**: multi-family street sale, plant & seedling swap, relocation clear-out, toys & cycles, vintage books & vinyl, semester-end book & gadget sale.
- **Technology**: Google Cloud full-stack workshop, open-source hack night, Python & GenAI for beginners, founders breakfast, Cloud Run study jam.
- **Education**: kids' STEM robotic arm, spoken English circle, terrace gardening, youth financial literacy.
- **Community**: board game night, repair café, native tree planting, Noyyal riverbank clean-up.
- **8 past events** (one per category, plus an Ettimadai clean-up) to demonstrate expiry.

Dates are generated relative to the day you seed, so the board is always populated with upcoming events — **re-seed on the morning of a demo**.

---

## 🏆 Hackathon Submission Documents

| Document | Description | Link |
|---|---|---|
| **Submission Report** | Full 5-page project report addressing problem, data, KPIs, and GCP architecture | [docs/cognizant-hackathon-report.md](docs/cognizant-hackathon-report.md) |
| **Presentation Deck** | 10-slide comprehensive presentation deck | [docs/presentation-slides.md](docs/presentation-slides.md) |
| **Architecture Diagram** | Visual SVG schematic of the GCP stack | [docs/architecture-diagram.svg](docs/architecture-diagram.svg) |
| **Demo Script** | Step-by-step evaluator testing journey | [docs/demo-script.md](docs/demo-script.md) |
| **GCP Deployment Guide** | Step-by-step Cloud Run deployment commands | [docs/gcp-deployment.md](docs/gcp-deployment.md) |

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
