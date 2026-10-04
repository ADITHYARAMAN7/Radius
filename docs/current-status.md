# Current status — Radius

> Cognizant NPN Hackathon · Use Case 5 · updated 3 Oct 2026.
> Full write-up: [`cognizant-hackathon-report.md`](cognizant-hackathon-report.md).

## Live

- **App:** https://radius-x2gneiue7a-el.a.run.app
- **Health:** `/api/health` reports Firestore connected, Cloud Storage, Gemini and scheduled expiry configured
- **Project:** `radius-510418` (free trial, $25 budget alert), Cloud Run `radius`, `asia-south1`

## Brief requirements

| Requirement | Status |
|---|---|
| Grid of event cards | ✅ |
| Post form | ✅ |
| Date sorting (next event top-left) | ✅ |
| Automatic expiration | ✅ query filter + hourly Cloud Scheduler sweep |
| "I'm Going" RSVP counter | ✅ Firestore transaction, one per user |
| Colour-coded category badges | ✅ 8 categories |
| Search by neighbourhood | ✅ spelling-proof, with suggestions |
| Shareable link per event | ✅ link, native share, QR flyer, calendar export |

## Beyond the brief (all live)

Snap-a-Poster (Gemini via Vertex AI; idea by Adhi) · AI assist · AI search · Google map + Places
autocomplete · month calendar · Recommended for you · Trending · Popular badge · near-me filter · voice
search · QR check-in · neighbour points + leaderboard · Q&A · save for later · event-day weather ·
edit / cancel / reactivate / delete · insights dashboard · dark mode · installable PWA.

## Google Cloud services in use

Cloud Run · Cloud Firestore · Firebase Authentication · Cloud Storage · Vertex AI (Gemini 3.5 Flash-Lite,
fallback 3.1 Flash-Lite) · Google Maps JavaScript API + Places API (New) · Cloud Scheduler · Secret Manager ·
Cloud Build · Artifact Registry · Cloud Logging · Cloud Monitoring (dashboard, log-based metrics, uptime
check + alert) · Billing budget.

## Testing

| Suite | Result |
|---|---|
| Service checks against the Firestore emulator (`npm run verify --prefix backend`) | 134 / 134 |
| Recommendation scoring / trending checks | 18 / 18 · 33 / 33 |
| Real-Chrome UI suite (local) | 90 / 95 before keys; the 5 needed keys: Google map, Places and Snap-a-Poster now pass live, Google sign-in needs a manual test (popup) |
| Live smoke test on Cloud Run | 16 / 16 |
| Typecheck + production build | clean |

## Measured performance (live, 15 requests each)

| Request | Median | p95 |
|---|---|---|
| `/` | 143 ms | 182 ms |
| `/api/events` | 205 ms | 239 ms |
| Month calendar | 222 ms | 307 ms |
| `/api/health` | 166 ms | 229 ms |

## Known limits / next

- Moderation and reporting of posts (next item).
- Reminders (email / push); recurring and multi-day events; Tamil.
- Rate limits are per Cloud Run instance (in memory); a shared store is needed at scale.
- Text search scans up to 400 candidate events in memory; a search index is needed at scale.

## Operating it

- Redeploy: `.\scripts\deploy.ps1`
- Demo morning: `.\scripts\demo-day.ps1` (re-seed + warm instance); afterwards `.\scripts\demo-day.ps1 -Off`
- Monitoring: [`monitoring/README.md`](../monitoring/README.md)
- Deployment guide: [`gcp-deployment.md`](gcp-deployment.md)
