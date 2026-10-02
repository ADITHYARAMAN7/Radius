# Nearby-Events — Hackathon Presentation Deck (10 Slides)

**Cognizant GCP Hackathon | Use Case 5: Local Event Bulletin Board**

---

### Slide 1: Title Slide
- **Title**: Nearby-Events (Local Event Bulletin Board)
- **Subtitle**: A Real-Time, AI-Powered Hyper-Local Community Platform on Google Cloud
- **Team**: Hackathon Innovators
- **Target Use Case**: Use Case 5 — Local Event Bulletin Board
- **Stack**: Google Cloud Run, Cloud Firestore, Cloud Storage, Vertex AI / Gemini, React 18, TypeScript

---

### Slide 2: The Problem & Inefficiencies
- **The Challenge**: Traditional community communication is broken, noisy, and fragmented.
- **Pain Points in Current Process**:
  1. *Physical Boards*: Easily ruined by weather, local-only, zero interactive RSVP, cluttered with expired flyers.
  2. *Social Feeds*: Algorithmic bury, excessive ads, privacy issues, no dedicated neighborhood timeline.
  3. *Chat Groups*: Information gets buried in hundreds of messages; impossible to view what's happening *next*.
- **The Opportunity**: A clean, lightning-fast digital bulletin board accessible without app downloads.

---

### Slide 3: Proposed Solution
- **Nearby-Events**: A digital community board where neighbors can post events, meetups, or garage sales with titles, dates, locations, and descriptions.
- **Key Highlights**:
  - 📅 **Automatic Date Sorting**: The next upcoming event is always prioritized at the top-left.
  - ⏱️ **Automatic Expiration Logic**: Cleanses or flags stale events past today's date.
  - 👥 **"I'm Going" RSVP Counter**: 1-click attendance counter with live feedback.
  - 🏷️ **Color-Coded Category Badges**: Sports, Music, Food, Yard Sale, Tech, Education, Community.
  - 📍 **Neighborhood Search & Map**: Discover by city, neighborhood name, or interactive map.
  - 🔗 **Shareable Links**: Direct URLs (`/events/:id`) for quick messaging and social distribution.

---

### Slide 4: AI & Innovation (Gemini 1.5 Integration)
- **Problem**: Organizers often don't know how to write engaging descriptions or choose proper tags.
- **Solution — Gemini Event Assistant**:
  - Enter a simple note: *"Pickup basketball at Maple Park Saturday 10am"*
  - Gemini AI generates:
    - Catchy Title: *"Weekend 3v3 Community Basketball Pickup"*
    - Formatted Markdown Description with rules & what to bring
    - Auto-assigned Category: `Sports`
    - Suggested Tags: `["basketball", "fitness", "outdoor", "weekend"]`
- **Result**: Cuts event posting time from 5 minutes to under 30 seconds.

---

### Slide 5: System Architecture & GCP Integration
- **Serverless Compute**: **Google Cloud Run** running Express/TypeScript container (scales to zero, high throughput).
- **Real-Time Database**: **Cloud Firestore** for sub-millisecond document lookups, compound indexing, and atomic RSVP counters.
- **Object Storage**: **Google Cloud Storage** for edge-cached event poster photos.
- **Generative AI**: **Vertex AI / Gemini 1.5 Flash** for intelligent event generation.
- **Authentication**: **Firebase Auth** (JWT validation, email & OAuth).
- **Observability**: **Google Cloud Logging** with structured JSON traces and request-ID tracking.

*(Refer to `docs/architecture-diagram.svg` for full visual schematic)*

---

### Slide 6: Live Demo Journey & Breadth of Sample Data
- **36 Seeded Real-World Events**: Pre-populated across 7 categories (29 upcoming + 7 expired).
- **Demo Walkthrough Flow**:
  1. *Homepage & Hero*: Search by neighborhood or keyword.
  2. *Explore & Filter*: Filter by `Sports`, `Food`, `Yard Sale` or view `Past / Expired` events.
  3. *Interactive Map*: Pan & click event pins to view popups.
  4. *RSVP Action*: Click "I'm Going" and watch the public counter update.
  5. *AI Creation*: Use the AI assistant to instantly draft and publish a new Yard Sale event.
  6. *Share*: Copy unique shareable link with 1 click.

---

### Slide 7: Technical Excellence & Alternatives Considered
- **Architecture Decisions**:
  - *Cloud Run vs. VMs*: Chosen for serverless auto-scaling and zero maintenance.
  - *Firestore vs. SQL*: Firestore provides real-time document sync and flexible nested tags.
  - *Optimistic UI Updates*: RSVP state updates immediately in UI while Firestore batch write commits asynchronously.
- **Security & Reliability**:
  - Rate limiting (express-rate-limit) prevents spam post flooding.
  - File upload mime-type whitelist and 5MB size caps.
  - Error boundaries preventing white-screen crashes.

---

### Slide 8: Business Impact & Success Metrics (KPIs)
- **Community Adoption**: Measured by monthly active organizers and total RSVPs generated.
- **Time-to-Publish**: Reduced by >80% with Gemini AI auto-completion.
- **Platform Performance**: Sub-100ms API response time via Cloud Run + Firestore indexing.
- **Data Hygiene**: 100% automated expiration check ensuring zero stale events at the top of the feed.

---

### Slide 9: Risks, Compliance & Mitigation
- **Content Moderation Risk**: Mitigated via input sanitization, rate limiting, and future Cloud Natural Language sentiment filtering.
- **Data Privacy (GDPR/CCPA)**: Public RSVPs only expose attendee counts; personal email addresses remain protected behind Firebase Auth rules.
- **High Concurrency Spikes**: Cloud Run auto-scales instances on demand while Firestore distributes read/write operations across shards.

---

### Slide 10: Future Roadmap & Next Steps
- **Phase 2 (Immediate Post-Hackathon)**:
  - Push Notifications via Firebase Cloud Messaging (FCM) based on user's home neighborhood.
  - 1-Click "Add to Google Calendar" (.ics export).
- **Phase 3 (Enterprise & City Scale)**:
  - City Council / Municipal verification badges for official civic announcements.
  - Cloud Translation API integration for multi-lingual community accessibility.
  - QR Code attendance check-in for ticketed community events.

---

### Summary Callout:
> **"Nearby-Events delivers a seamless, reliable, and intelligent bulletin board for modern neighborhoods—built end-to-end on Google Cloud."**
