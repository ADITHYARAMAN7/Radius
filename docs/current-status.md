# Project Audit & Current Status Report: Nearby-Events

> **Cognizant NPN Hackathon — Use Case 5: Local Event Bulletin Board**  
> *Audit Date: October 2026*

---

## A. Existing Features

1. **Grid Board Layout & Active Event Feed** (`/` Home & `/explore` Explore): Responsive card grid displaying active community events sorted chronologically by default.
2. **Automatic Date Sorting**: Uses compound Firestore indexing (`startsAt ASC`) so upcoming events occurring soonest appear first.
3. **Automatic Expiration Handling**:
   - Query-level filtering suppresses finished events (`endsAt < now`).
   - Server-side cron/sweep function (`expirePastEvents()`) batch updates status to `EXPIRED`.
   - Dedicated "Past Events" archive view on `/explore?date=past`.
4. **"I'm Going" 1-Click RSVP System**:
   - Atomic Firestore transaction increments/decrements `rsvpCount` in real time.
   - Dual-write pattern: maintains `events/{eventId}/rsvps/{uid}` and `users/{uid}/attending/{eventId}` mirror.
   - Optimistic UI state updates with duplicate RSVP prevention via document ID locking (`uid`).
5. **Color-Coded Category Badges**: 8 categories (**Sports**, **Music**, **Food**, **Yard Sale**, **Community**, **Education**, **Technology**, **Other**) with tailored icons and visual tags.
6. **Neighborhood & Multi-Parameter Filtering**: Filter events by category, neighborhood, city, date window (`today`, `tomorrow`, `weekend`, `week`, `upcoming`, `past`), and keyword search.
7. **Distance Radius Geolocation Filtering**: Haversine distance calculator filtering events within a specified radius (e.g. 5 km, 10 km, 50 km) from selected coordinates.
8. **Interactive Maps View**: Embedded interactive map (Leaflet / Google Maps loader) displaying custom category markers and popup event summaries.
9. **Shareable Permalinks & Web Share**: Direct URLs (`/events/:id`) with 1-click clipboard copy and native mobile Web Share API integration.
10. **Gemini 1.5 AI Event Assistant**:
    - Smart description & title generator (`/api/ai/assist`) converting short rough notes into structured title, summary, description, category, and tags.
    - Natural language query parser (`/api/ai/search`) parsing free-text queries like *"free sports games this weekend in Gandhipuram"* into structured query filters.
11. **User Management & Personal Dashboards**:
    - Firebase Auth email/password and google identity support.
    - `/my-events`: List events created by the logged-in user with edit, soft-cancel, reactivate, and delete controls.
    - `/my-rsvps`: List events the user is attending.
    - `/profile`: User bio, display name, and city preference management.
12. **Platform Insights & Analytics**: Visual charts on `/insights` showing total events, total RSVPs, category distributions, and organizer activity metrics powered by Recharts.

---

## B. Existing APIs

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `GET /api/health` | Public | None | Health check & system capability status. |
| `GET /api/stats` | Public | None | Platform totals & category analytics data. |
| `GET /api/events` | Public | Optional JWT | Paginated list of active/past events with search, category, location, and radius filters. |
| `GET /api/events/:id` | Public | Optional JWT | Single event details + related events + attendee list. |
| `POST /api/events` | Private | Required JWT | Create a new community event. |
| `PATCH /api/events/:id` | Private | Owner JWT | Update an existing event. |
| `POST /api/events/:id/cancel` | Private | Owner JWT | Soft-cancel an event (changes status to `CANCELLED`). |
| `POST /api/events/:id/reactivate` | Private | Owner JWT | Reactivate a cancelled event (restores to `ACTIVE` or `EXPIRED`). |
| `DELETE /api/events/:id` | Private | Owner JWT | Cascade delete event, RSVP subcollection, user mirror docs, and Cloud Storage image. |
| `POST /api/events/:id/rsvp` | Private | Required JWT | Atomic transaction to join event (RSVP). |
| `DELETE /api/events/:id/rsvp` | Private | Required JWT | Atomic transaction to cancel RSVP. |
| `GET /api/events/:id/attendees` | Public | None | Get list of public attendee profiles for an event. |
| `GET /api/ai/status` | Public | None | Returns whether Gemini AI integration is enabled. |
| `POST /api/ai/assist` | Private | Required JWT | Generate AI title, description, summary, and tags. |
| `POST /api/ai/search` | Private | Required JWT | Natural language query intent parser. |
| `GET /api/uploads/status` | Public | None | Returns Cloud Storage upload availability & limits. |
| `POST /api/uploads/image` | Private | Required JWT | Upload image file to Cloud Storage (5MB limit, memory stream). |
| `POST /api/me/session` | Private | Required JWT | Idempotent profile initialization on sign-in. |
| `GET /api/me` | Private | Required JWT | Fetch user profile. |
| `PATCH /api/me` | Private | Required JWT | Update user profile bio/city. |
| `GET /api/me/events` | Private | Required JWT | Get events created by current user. |
| `GET /api/me/rsvps` | Private | Required JWT | Get events attended by current user. |

---

## C. Existing Database Collections (Cloud Firestore)

1. **`events/{eventId}`**
   - Fields: `title`, `description`, `summary`, `category`, `tags`, `date`, `startTime`, `endTime`, `startsAt` (Timestamp), `endsAt` (Timestamp), `location`, `address`, `latitude`, `longitude`, `neighborhood`, `city`, `neighborhoodLower`, `cityLower`, `searchKeywords` (Array), `imageUrl`, `imagePath`, `creatorId`, `creatorName`, `creatorPhotoURL`, `rsvpCount`, `status` (`ACTIVE` | `CANCELLED` | `EXPIRED`), `createdAt`, `updatedAt`.
2. **`events/{eventId}/rsvps/{uid}`**
   - Fields: `uid`, `displayName`, `photoURL`, `createdAt`. Document ID is `uid` (enforces 1 RSVP per user at DB schema level).
3. **`users/{uid}`**
   - Fields: `uid`, `displayName`, `email`, `photoURL`, `bio`, `city`, `createdAt`, `updatedAt`.
4. **`users/{uid}/attending/{eventId}`**
   - Fields: `eventId`, `startsAt` (Timestamp), `createdAt` (Timestamp). Enables $O(1)$ fast retrieval for "Events I am attending".

---

## D. Existing GCP Services

- **Google Cloud Run**: Serverless container execution hosting Node.js/Express API and static SPA fallback.
- **Cloud Firestore**: Serverless NoSQL document database with compound indexes and security rules.
- **Google Cloud Storage**: Public bucket storage for event cover images.
- **Vertex AI / Gemini 1.5 Flash**: Generative AI content engine (supports both Vertex AI service account auth and Gemini API Key mode).
- **Firebase Authentication**: User identity provider (email/password & Google OAuth).
- **Cloud Logging**: Structured JSON logger integration with request context tracing.

---

## E. Existing AI Features

- **"Improve with AI" Content Generator** (`/api/ai/assist`):
  - Model: `gemini-1.5-flash`
  - Input: Rough title, description, category, location context.
  - Output: Structured JSON containing refined title, 2-3 paragraph description, under-140 char summary, best-fitting category, and 3-6 lowercase tags.
  - Guardrails: System instructions enforcing strict factual accuracy (never invents prices/addresses/dates), per-user in-memory sliding window rate limiter (12 req/min), input size bounds (up to 2KB).
- **Natural Language Search Intent Parser** (`/api/ai/search`):
  - Converts queries like *"outdoor morning sports in Race Course"* into structured JSON query parameters (`keywords`, `category`, `dateFilter`, `neighborhood`, `city`).
  - Fallback: Gracefully degrades to plain keyword matching if AI call fails or times out.

---

## F. Existing Security Implementation

- **Helmet CSP (Content Security Policy)**: Strict script-src, style-src, font-src, frame-src, and connect-src rules enforcing zero inline scripts. Enforced in production, report-only in dev.
- **Rate Limiting**:
  - Global API Read Limiter: 300 requests / 15 minutes per IP.
  - Global API Write Limiter: 60 requests / 15 minutes per IP.
  - Per-User AI Limiter: 12 requests / 1 minute per UID.
- **Input Validation**: Zod schemas (`eventInputSchema`, `eventQuerySchema`, `profileUpdateSchema`, `aiAssistSchema`) validating string lengths, date formats, time ranges, and enumerations.
- **Firestore Security Rules (`firestore.rules`)**:
  - Read access is public for events and profiles.
  - Direct writes restricted strictly to document owners.
  - Prevents client-side tampering of `rsvpCount`, `creatorId`, or `status`.
- **Cross-Tenant Image Deletion Protection**: Validates `imagePath` ownership (`isOwnedImagePath`) so users can only touch paths prefixed with `events/{their_uid}/`.

---

## G. Existing Testing

- **Service-Level Verification Script** (`backend/src/scripts/verify.ts`):
  - Evaluates end-to-end functionality against Firestore Emulator (or live test DB).
  - Verifies profile creation, input validation rules, event creation, ownership enforcement, atomic RSVP transaction concurrency, idempotency, soft-cancellation, reactivation, distance radius filtering, cascade deletion, cross-tenant security regression tests, and insights stats aggregation.
  - Total test assertions: **50+ automated assertion checks**.
- **TypeScript Static Verification**:
  - `npm run typecheck`: Validates full strict type checking (`tsc --noEmit`) across both frontend and backend modules with zero errors.
- **Production Build Validation**:
  - `npm run build`: Confirms Vite bundle compilation and backend TypeScript compilation without errors.

---

## H. Existing Analytics Implementation

- **`getInsights()` Service**: Aggregates total active/expired/cancelled events, unique organizers, total RSVPs, and category distribution breakdowns.
- **Frontend Dashboard (`/insights`)**: Uses Recharts to render visual graphs for Category Distribution (Pie Chart), Event Status Breakdown, and Community Engagement KPIs.

---

## I. Current Architecture

```
[ Client Browser (React 18 SPA) ]
          │
          │ HTTP / REST API (CORS, Rate Limited)
          ▼
[ Express API Server on Cloud Run ]
   ├── Auth Middleware (Firebase Admin JWT Verification)
   ├── Rate Limiters & Zod Validators
   ├── Event & RSVP Services (Transactions & In-Memory Filters)
   └── External Integrations:
         ├── Cloud Firestore (NoSQL Events, RSVPs, Profiles)
         ├── Cloud Storage (Image Uploads)
         └── Vertex AI / Gemini 1.5 (Content Assist & Search Intent)
```

---

## J. Missing Functionality

1. **Push & Email Notifications**: No automated reminder system for upcoming RSVPed events (e.g. 24h before event).
2. **Comment / Discussion Threads**: Events do not currently support community Q&A or attendee discussion comments.
3. **Calendar Export (.ics / Google Calendar)**: `CalendarExport.tsx` component is stubbed/basic without full `.ics` download generator.
4. **QR Code Check-in / Ticket Verification**: No check-in mechanism for event organizers at the physical venue.
5. **Real-time WebSockets / Live Updates**: Current feed uses REST polling/refetching rather than real-time Firestore client listeners.
6. **Multi-Instance Rate Limiting**: In-memory rate limiting map in API server does not sync across multiple Cloud Run container instances (needs Redis/Firestore backend if scaled).

---

## K. Potential Scalability Problems

1. **In-Memory Filtering & Search Cap (`FETCH_CAP = 400`)**:
   - `listEvents()` queries up to 400 candidate documents from Firestore into Node.js memory to perform text search scoring and distance calculations.
   - *Impact*: As total active events scale beyond thousands, pulling 400 records per request could increase memory usage and latency.
2. **In-Memory Rate Limiting**:
   - The AI rate limiter uses an in-memory `Map`. On autoscaling Cloud Run (multiple instances), rate limits are enforced per-instance rather than globally.
3. **Storage Cleanup on Crash**:
   - Unattached images uploaded before event submission are not garbage collected automatically if the user abandons the form.

---

## L. Potential Database / Query Problems

1. **Case-Insensitive Search Limitation**:
   - Firestore lacks native full-text indexing; search relies on generated `searchKeywords` arrays and `neighborhoodLower`/`cityLower` fields.
2. **Compound Filter Constraints**:
   - Querying multiple unequal fields simultaneously (e.g., specific date range + category + neighborhood + distance radius) requires carefully ordered in-memory fallback to avoid requiring dozens of composite indexes.

---

## M. Recommended Implementation Order

1. **Phase 1: Polish & User Experience Enhancements**
   - Complete `.ics` / Google Calendar export generator for RSVPed events.
   - Add event discussion/comment threads for community Q&A.
2. **Phase 2: Real-Time & Event Notifications**
   - Integrate Web Push / Email reminders for upcoming events (24-hour notice).
   - Implement live Firestore listener options for active event board updates.
3. **Phase 3: Production Infrastructure & Scalability**
   - Replace in-memory rate limiter with Redis / Firestore backing for multi-container Cloud Run deployment.
   - Integrate Algolia / Typesense or Cloud Search if event volume exceeds `FETCH_CAP` (400 records).

---

## Summary

- **What is already complete**:
  - Full-stack TypeScript architecture (React 18 + Vite + Express + Cloud Run).
  - 100% Use Case 5 requirements (Grid board, automatic date sorting, expiration logic, 1-click RSVP counter, category badges, neighborhood search, shareable deep links, Gemini AI assistant).
  - Complete security rules, rate limiters, Zod validation, and automated verification test suite.
  - Zero TypeScript or build errors (`npm run typecheck` & `npm run build` both pass cleanly).

- **What needs improvement**:
  - Calendar export file generator (.ics format).
  - Event discussion & community comments.
  - Distributed rate limiting across multi-instance Cloud Run containers.

- **What should be implemented first**:
  - 1. Calendar export (.ics generator) for RSVPed events.
  - 2. Event comments/discussion Q&A section on Event Details page.
