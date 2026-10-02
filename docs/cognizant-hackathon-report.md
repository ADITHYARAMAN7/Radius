# Cognizant GCP Hackathon — Comprehensive Submission Report

**Project Title:** Nearby-Events (Local Event Bulletin Board)  
**Use Case:** Use Case 5 — Local Event Bulletin Board  
**Target Platform:** Google Cloud Platform (GCP) & Firebase  
**Repository:** [https://github.com/kanishmanickam/Nearby-Events.git](https://github.com/kanishmanickam/Nearby-Events.git)  

---

## Executive Summary

**Nearby-Events** is a modern, high-performance, cloud-native digital community bulletin board engineered on Google Cloud Platform and Firebase. It eliminates the friction, fragmentation, and safety concerns of traditional physical bulletin boards and generic social networks by offering a hyper-local, real-time platform where residents can discover, post, share, and RSVP to neighborhood events, garage sales, and community meetups.

The platform integrates **Google Cloud Run**, **Cloud Firestore**, **Cloud Storage**, **Vertex AI / Gemini 1.5**, and **Google Maps Platform** with an enterprise-grade React TypeScript single-page application.

---

## 1. Problem Understanding & Current Process Inefficiencies

### 1.1 The Baseline Problem
Local communities struggle to distribute and consume timely event information. The traditional methods suffer from severe inefficiencies:
- **Physical Flyers / Pinboards:** Ephemeral, geographically restricted to physical passersby, non-interactive (no RSVP), no automatic expiration (outdated clutter remaining for weeks), and environmentally wasteful.
- **Generic Social Media (Facebook Groups, Nextdoor):** High algorithmic clutter, ad fatigue, privacy concerns, lack of structured filtering by precise neighborhood/category, and absence of AI assistance for casual organizers.
- **Messaging Groups (WhatsApp, Telegram):** Noise and message loss; inability to sort by "what is happening next" or view geographic proximity on an interactive map.

### 1.2 Process-Flow Comparison

```
Traditional Process:
Create Physical Flyer / Raw Post ──> Manual Distribution ──> No RSVP Visibility ──> Stale/Expired Clutter

Nearby-Events AI-Powered Solution:
Organizer Inputs Idea ──> Gemini AI Assistant (Polishes & Tags) ──> Cloud Run / Firestore ──> Instant Map/Grid Display (Sorted by Date) ──> 1-Click "I'm Going" RSVP ──> Automated Date Expiration
```

---

## 2. Proposed Solution Design & Innovation

### 2.1 Core Feature Matrix (Use Case 5 Compliance)

| Requirement | Implementation in Nearby-Events | Technical Detail |
|---|---|---|
| **Board Layout** | Responsive CSS Grid of interactive event cards | `frontend/src/components/events/EventCard.tsx` + `Explore.tsx` |
| **Post Form** | Rich multi-step form with live validation and image upload | `frontend/src/components/events/EventForm.tsx` |
| **Date Sorting** | Ascending chronological sort (next happening event at top-left) | Firestore indexed query `date ASC, time ASC` |
| **Expiration Check** | Automatic backend computation & active/expired filtering | `backend/src/services/eventService.ts` |
| **"I'm Going" Counter** | 1-click optimistic RSVP increment with duplicate prevention | `/api/rsvps` with Firestore transactions |
| **Category Badges** | Color-coded badges for Sports, Music, Food, Yard Sale, etc. | `frontend/src/components/events/CategoryBadge.tsx` |
| **Search by Neighborhood** | Real-time text filter and geolocation radius query | Client & backend regex/prefix matching |
| **Shareable Links** | Direct deep-linking with Open Graph metadata and clipboard copy | `frontend/src/components/events/ShareMenu.tsx` (`/events/:id`) |

### 2.2 AI & Automation Innovations
1. **Gemini 1.5 Flash AI Assistant**: Organizers can type a brief one-sentence note (e.g., *"Sunday morning pickup soccer at Central Park"*), and Gemini automatically generates a compelling title, formatted markdown description, optimal category, and relevant community tags.
2. **Dynamic Geocoding & Map Visualizer**: Integrated Leaflet/Google Maps view with custom category pins and interactive event popups.
3. **Optimistic RSVP State Engine**: Instant UI feedback on "I'm Going" toggles, backed by transactional integrity in Cloud Firestore.

---

## 3. Data, Systems, Tools & Stakeholders

### 3.1 Stakeholder Ecosystem
- **Local Residents & Attendees**: Seek immediate discovery of nearby happenings without login barriers for viewing.
- **Event Organizers & Small Businesses**: Require zero-cost, rapid event publication with AI copywriting and attendee headcounts.
- **Community Leaders & Neighborhood Associations**: Need analytics on local engagement and category interest trends.
- **Platform Administrators**: Need secure content moderation, rate limiting, and structured logging.

### 3.2 Data Architecture & Schema

```
Firestore Collections:
├── users/
│   └── {userId}: { uid, email, displayName, photoUrl, createdAt }
├── events/
│   └── {eventId}: { title, description, category, date, time, location,
│                    neighborhood, latitude, longitude, imageUrl, tags[],
│                    rsvpCount, createdBy, createdAt, status }
└── rsvps/
    └── {rsvpId}: { eventId, userId, userName, userEmail, createdAt }
```

### 3.3 GCP Technologies & Systems

| GCP Component | Role | Justification |
|---|---|---|
| **Google Cloud Run** | Backend Container Hosting | Serverless, auto-scaling to zero, low latency, cost-efficient |
| **Cloud Firestore** | NoSQL Document Database | Real-time listeners, compound querying, sub-millisecond document reads |
| **Cloud Storage** | Event Image Hosting | Globally edge-cached, fine-grained ACLs, direct CDN delivery |
| **Vertex AI / Gemini** | Event Content Generation | State-of-the-art LLM for instant copywriting & tag extraction |
| **Firebase Auth** | Identity Management | Secure JWT issuance, email/password & OAuth 2.0 social logins |
| **Cloud Logging** | Observability & Auditing | Structured JSON logging with request-ID correlation |

---

## 4. Architecture Considerations & Alternatives Considered

```
                               ┌─────────────────────────┐
                               │       Web Client        │
                               │  (React 18 + Vite + TS) │
                               └────────────┬────────────┘
                                            │ HTTPS / WSS
                                            ▼
                               ┌─────────────────────────┐
                               │  GCP Cloud Run Service  │
                               │   (Node.js / Express)   │
                               └────────────┬────────────┘
                   ┌────────────────────────┼────────────────────────┐
                   ▼                        ▼                        ▼
        ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
        │   Cloud Firestore   │  │    Cloud Storage    │  │  Vertex AI / Gemini │
        │  (Events, RSVPs)    │  │    (Event Media)    │  │  (Content Assistant)│
        └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### Alternatives Evaluated:
1. **Relational Database (Cloud SQL Postgres) vs. Cloud Firestore**:
   - *Decision*: Firestore was selected due to its native schemaless JSON model, built-in real-time subscription capabilities, and direct compatibility with mobile/web SDKs.
2. **VM Hosting (Compute Engine) vs. Serverless (Cloud Run)**:
   - *Decision*: Cloud Run was chosen over Compute Engine to eliminate infrastructure patching, enable zero-scaling during low-traffic night hours, and reduce operational overhead.
3. **Client-side LLM calls vs. Backend Proxy**:
   - *Decision*: Centralized backend routing via `/api/ai/suggest` protects GCP API keys and applies token rate limiting per IP.

---

## 5. Success Metrics & KPIs

| Metric Category | Target KPI | Measurement Tool |
|---|---|---|
| **User Engagement** | >60% browse-to-RSVP conversion rate | Firestore RSVP aggregation & Insights Dashboard |
| **Content Velocity** | <60 seconds average event creation time | AI Assistant telemetry & form analytics |
| **System Performance**| <150ms 95th percentile API response time | Cloud Monitoring & Cloud Run metrics |
| **Reliability** | 99.9% uptime with 0 unhandled crash loops | Cloud Logging error reporting |
| **Data Freshness** | 100% past events correctly flagged as Expired | Automated UTC date comparator service |

---

## 6. Risks, Compliance, and Mitigation Strategies

| Identified Risk | Severity | Mitigation Strategy Implemented |
|---|---|---|
| **Spam / Inappropriate Posts** | Medium | Rate limiting (100 req/15min), input sanitization, and structured validation schemas. |
| **RSVP Race Conditions** | Low | Atomic Firestore batch operations and idempotent `/rsvp` toggle endpoints. |
| **API Key Exposure** | Critical | Strict environment variable separation (`.env`), `.gitignore`, and backend credential isolation. |
| **Image Hosting Vulnerabilities** | Medium | Filetype MIME validation (JPEG/PNG/WebP only) and 5MB size ceilings in Cloud Storage upload middleware. |
| **Stale Event Accumulation** | Low | Real-time `status: 'active' \| 'expired'` computation logic and dedicated UI filter tabs. |

---

## 7. Roadmap: What's Built Now vs. What's Next

### Built Now (Phase 1 - Hackathon MVP):
- [x] Full Use Case 5 implementation (Grid, Post Form, Date Sorting, Expiration Check).
- [x] "I'm Going" public RSVP counter with live toggle state.
- [x] Category badges (Sports, Music, Food, Yard Sale, Technology, Education, Community).
- [x] Neighborhood text search + Category filtering + Past/Expired filters.
- [x] Shareable deep links with native navigator share & clipboard fallback.
- [x] Gemini 1.5 Flash AI Event Assistant.
- [x] Interactive Leaflet/Google Maps view with custom category pins.
- [x] 36 realistic seed events spanning upcoming and expired dates.

### What's Next (Phase 2 & 3):
- [ ] **Push Notifications (FCM)**: Real-time alerts when new events are posted within 5km of a user.
- [ ] **Calendar Export**: 1-click export to Google Calendar and Apple iCal (.ics).
- [ ] **Multi-language Translation**: Cloud Translation API integration for diverse community access.
- [ ] **QR Code Check-ins**: Organizer ticketing and door attendance scanning.

---

## 8. Conclusion & Hackathon Value Proposition

Nearby-Events fulfills 100% of the Cognizant Use Case 5 requirements while pushing the boundary of modern cloud applications through Gemini AI integration, real-time Firestore synchronization, and serverless Cloud Run architecture. It is fully demo-ready, thoroughly tested, and packaged with complete presentation assets.
