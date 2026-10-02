# Nearby-events System Architecture Diagram

> **Cognizant Google Cloud Hackathon Project**  
> *Discover. Connect. Participate. — A Location-Aware Community Event & Experience Platform*

---

## 1. High-Level Architecture Flow

```
                                  +-----------------------+
                                  |         USER          |
                                  |  (Browser / Mobile)   |
                                  +-----------+-----------+
                                              |
                                              | HTTPS / Web
                                              v
                                  +-----------------------+           +-----------------------+
                                  |  React + TypeScript   | --------> | Firebase Auth Service |
                                  |     Vite Frontend     | <-------- |  (Google / Email JWT) |
                                  +-----------+-----------+           +-----------------------+
                                              |
                                              | REST API (/api/*) + JWT Bearer
                                              v
                                  +-----------------------+           +-----------------------+
                                  |    Google Cloud Run   | --------> |     Cloud Logging     |
                                  |  (Express API Engine) |           |  (Audit & Telemetry)  |
                                  +-----------+-----------+           +-----------------------+
                                              |
            +---------------------------------+---------------------------------+
            |                                 |                                 |
            v                                 v                                 v
+-----------------------+         +-----------------------+         +-----------------------+
|    Cloud Firestore    |         |     Cloud Storage     |         |   Gemini / Vertex AI  |
|  (Serverless NoSQL)   |         |    (Images Bucket)    |         |   (GenAI Assistant)   |
|                       |         |                       |         |                       |
|  * users/             |         |  * events/{uid}/*     |         |  * Structured JSON    |
|  * events/            |         |  * Magic-byte Check   |         |  * Event Assistant    |
|  * rsvps/             |         |  * 5 MB Max Upload    |         |  * Smart Search       |
+-----------------------+         +-----------------------+         +-----------------------+
            |
            +---------------------------------+
                                              |
                                              v
                                  +-----------------------+
                                  |  Google Maps Platform |
                                  | (Location & Geocoding)|
                                  |                       |
                                  |  * Interactive Pins   |
                                  |  * Distance Radius    |
                                  |  * Venue Navigation   |
                                  +-----------------------+
```

---

## 2. Interactive Mermaid Diagram

```mermaid
graph TD
    %% User and Identity
    User(["👤 Community User\n(Web & Mobile Browser)"])
    Auth["🔐 Firebase Authentication\n(Email & Google OAuth 2.0)"]

    %% Client Tier
    subgraph ClientTier ["🖥️ Presentation Layer (React + Vite + TypeScript)"]
        SPA["⚛️ React Single Page App\n* Explore Feed & Dynamic Chips\n* Interactive Event Map\n* Instant RSVP Engine\n* Event Creation Form"]
    end

    %% Compute Tier
    subgraph ComputeTier ["☁️ Compute Layer (Google Cloud Run)"]
        CloudRun["🚀 Cloud Run Serverless Container\n(Node.js 20 + Express API Engine)"]
        
        subgraph Middlewares ["Security & Middleware"]
            AuthGuard["🛡️ JWT Auth Guard"]
            RateLimit["⏱️ Request Throttling & Helmet"]
            Validation["✅ Zod Schema Validator"]
        end

        subgraph CoreServices ["Application Microservices"]
            EventSvc["📅 Event Service\n(CRUD, Composite Search, Expiry)"]
            RsvpSvc["🎟️ RSVP Transaction Engine\n(Atomic Writes & Counters)"]
            UploadSvc["🖼️ Storage Upload Pipeline\n(Magic-Byte MIME Check)"]
            AiSvc["✨ AI Dispatcher\n(Gemini 2.5 Flash GenAI)"]
        end
    end

    %% Storage & Database Tier
    subgraph DataTier ["🗄️ Google Cloud Data & Intelligence Tier"]
        Firestore[("🔥 Cloud Firestore\n(NoSQL Document Database)")]
        
        subgraph Collections ["Firestore Collections"]
            ColUsers["📂 users\n(Profiles & /attending mirrors)"]
            ColEvents["📂 events\n(Active, Expired & Seeded Events)"]
            ColRsvps["📂 rsvps\n(Event RSVP subcollections)"]
        end

        GCS["📦 Cloud Storage (GCS)\n* events/{uid}/... Prefix Isolation\n* Public CDN HTTPS Delivery\n* Cascade Cleanup on Delete"]
        
        Gemini["🧠 Google Gemini / Vertex AI\n* Gemini 2.5 Flash Model\n* Structured JSON Schema Assistant\n* Smart Natural Language Search"]
        
        Maps["📍 Google Maps Platform\n* Maps JavaScript API\n* Geocoding & Radius Filtering\n* OpenStreetMap Fallback Mode"]
        
        Logging["📊 Cloud Logging & Monitoring\n* Structured JSON Logging\n* Error Telemetry & Tracing"]
    end

    %% Relationships & Data Flow
    User -->|HTTPS Traffic| SPA
    SPA -->|Get ID Token| Auth
    SPA -->|Authorized API Requests| CloudRun
    
    CloudRun --> Middlewares
    Middlewares --> CoreServices
    
    EventSvc -->|Read / Write| ColEvents
    RsvpSvc -->|Atomic Transactions| ColRsvps
    RsvpSvc -->|Mirror Update| ColUsers
    Firestore --- ColUsers
    Firestore --- ColEvents
    Firestore --- ColRsvps

    UploadSvc -->|Signed Stream| GCS
    AiSvc -->|Structured Prompting| Gemini
    SPA -.->|Render Pins| Maps
    CloudRun -->|Async Audit Stream| Logging

    %% Styling
    classDef client fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef compute fill:#0369a1,stroke:#0ea5e9,stroke-width:2px,color:#fff;
    classDef data fill:#d97706,stroke:#f59e0b,stroke-width:2px,color:#fff;
    classDef ai fill:#7c3aed,stroke:#a855f7,stroke-width:2px,color:#fff;
    classDef maps fill:#059669,stroke:#10b981,stroke-width:2px,color:#fff;
    classDef auth fill:#ea580c,stroke:#f97316,stroke-width:2px,color:#fff;

    class SPA client;
    class CloudRun,AuthGuard,RateLimit,Validation,EventSvc,RsvpSvc,UploadSvc,AiSvc compute;
    class Firestore,ColUsers,ColEvents,ColRsvps,GCS,Logging data;
    class Gemini ai;
    class Maps maps;
    class Auth auth;
```

---

## 3. Google Cloud Component Breakdown

| GCP Component | Role in Nearby-events | Key Architectural Feature |
|---|---|---|
| **Google Cloud Run** | Serverless Backend & SPA Host | Autoscaling 0 to N instances, sub-second boot, single container deployment. |
| **Cloud Firestore** | Primary NoSQL Document Database | Atomic transactions for RSVPs, composite indexes for rapid filtering, subcollections for scalability. |
| **Cloud Storage (GCS)** | Event Imagery Object Store | User-isolated prefixes (`events/{uid}/...`), magic-byte validation, 5MB ceiling. |
| **Gemini / Vertex AI** | Generative AI & Semantic Assistant | `@google/genai` structured JSON schema generation for event drafts and smart search intent. |
| **Google Maps Platform** | Location & Neighborhood Visualization | Map pin rendering, distance calculation (Haversine formula), directions navigation. |
| **Firebase Auth** | Identity & Access Management | Google Sign-in and Email/Password with JWT validation via Firebase Admin SDK. |
| **Cloud Logging** | Observability & Audit Trail | Structured JSON logs with request correlation IDs and health check monitoring. |

---

## 4. Presentation Graphic Asset

A vector SVG diagram is available for slide decks and submission materials:

👉 **[Download / View Presentation SVG (`docs/architecture-diagram.svg`)](file:///c:/Users/kanis/OneDrive/Desktop/Cognizant%20hackhathon/Hackhathon/docs/architecture-diagram.svg)**

---

## 5. Security & Isolation Model

```
+--------------------------------------------------------------------------+
|                            SECURITY BOUNDARIES                           |
+--------------------------------------------------------------------------+
| 1. Client Security:                                                      |
|    - No secrets in frontend bundle (VITE_ variables are public only).    |
|    - All sensitive writes require Authorization Bearer <Firebase ID Token>|
|                                                                          |
| 2. API Security:                                                         |
|    - Magic-byte image inspection prevents malicious file uploads.        |
|    - Ownership verification ensures creators only edit/delete own data.  |
|    - HTML output sanitization and https:// URL enforcement for images.   |
|                                                                          |
| 3. Data Consistency:                                                     |
|    - RSVP count is protected by server-side Firestore Transactions.      |
|    - Cascading delete cleans event documents, RSVPs, and GCS images.     |
+--------------------------------------------------------------------------+
```
