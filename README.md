# Nearby-Events 📍
> **Cognizant GCP Hackathon — Use Case 5: Local Event Bulletin Board**  
> *A high-performance, real-time, AI-assisted community event platform built on Google Cloud Platform and Firebase.*

[![Google Cloud Platform](https://img.shields.io/badge/GCP-Cloud%20Run%20%7C%20Firestore%20%7C%20Storage%20%7C%20Vertex%20AI-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Overview

**Nearby-Events** is a cloud-native digital community bulletin board designed to help local residents discover, post, share, and RSVP to neighborhood events, garage sales, sports games, and meetups. 

Powered by **Google Cloud Run**, **Cloud Firestore**, **Cloud Storage**, and **Gemini 1.5 Flash**, it solves the fragmentation and clutter of physical bulletin boards and generic social feeds.

---

## 🚀 Key Features (Use Case 5 Requirements)

- 🗂️ **Grid Board Layout**: Clean, modern card grid showing all upcoming community gatherings.
- ⏱️ **Automatic Date Sorting**: Events happening next appear first at the top-left using compound indexed Firestore queries (`date ASC, time ASC`).
- 🧹 **Automatic Expiration Logic**: Past events older than today are automatically flagged/hidden from active feeds and viewable in a dedicated past events archive.
- 👍 **"I'm Going" RSVP Counter**: 1-click attendance button on every event card with live optimistic count updates and duplicate prevention.
- 🏷️ **Color-Coded Category Badges**: Visual tags for **Sports**, **Music**, **Food**, **Yard Sale**, **Technology**, **Education**, and **Community**.
- 📍 **Neighborhood Search & Interactive Map**: Filter events instantly by neighborhood name, city, or browse via interactive Leaflet/Google Maps view with custom category pins.
- 🔗 **Shareable Deep Links**: Direct URL per event (`/events/:id`) with 1-click clipboard copy and native mobile Web Share API support.
- 🤖 **Gemini 1.5 AI Event Assistant**: Generates engaging titles, rich descriptions, and smart tags from a simple 1-line note.

---

## 🏛️ System Architecture

![Nearby-Events Architecture](docs/architecture-diagram.svg)

| Component | Google Cloud Service | Purpose |
|---|---|---|
| **Compute** | **Google Cloud Run** | Scalable, containerized Node.js/TypeScript backend API. |
| **Database** | **Cloud Firestore** | Real-time NoSQL document database for Events, RSVPs, and Users. |
| **Storage** | **Google Cloud Storage** | Secure, CDN-cached bucket for event cover photos and media. |
| **Generative AI** | **Vertex AI / Gemini 1.5** | AI Event Assistant for description and tag auto-generation. |
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
├── frontend/                 # React 18 + Vite + Tailwind CSS + Leaflet
│   ├── src/
│   │   ├── components/       # EventCard, EventMap, EventFilters, EventForm
│   │   ├── context/          # Auth context and state providers
│   │   ├── pages/            # Home, Explore, EventDetails, CreateEvent, etc.
│   │   └── App.tsx           # Router and application root
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   └── seed-events.ts        # 36 realistic demo events (upcoming & expired)
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

### 3. Seed Realistic Demo Data (36 Events)
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
This starts the Firestore + Auth emulators, seeds the 36 demo events, then runs the API (:8080) and web app
(:5173). Open http://localhost:5173. Emulator UI (browse data and test users): http://localhost:4000.
Press `Ctrl+C` to stop. Emulator data lives in memory, so events you create disappear on stop and the next
start reseeds fresh demo data.

**Signing in:** click *Create account* and use any made-up email and a 6+ character password
(e.g. `test@example.com` / `test1234`). *Continue with Google* also works and shows a fake account picker.

**What is off locally:** image upload (Cloud Storage isn't emulated, the form says so), maps (no Maps key),
and AI features until you add `GEMINI_API_KEY`. Everything else works.

---

## 📊 Breadth of Sample Data

The platform comes with a pre-configured seed generator in `scripts/seed-events.ts` providing **36 realistic community events**:
- **Sports**: Pickup soccer, 3v3 basketball, sunset yoga, 5K fun run.
- **Music**: Jazz in the park, acoustic open mic, indie indie showcase.
- **Food**: Taco crawl, farmers market brunch, artisan sourdough workshop.
- **Yard Sale**: Multi-family estate sale, neighborhood book exchange, vintage vinyl swap.
- **Technology**: Local AI hack night, robotics demo, web dev meetup.
- **Education**: Urban gardening 101, local history walking tour.
- **Community**: Park cleanup drive, neighborhood association townhall.
- **Expired Events**: Dedicated dataset to verify automatic expiration handling.

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
