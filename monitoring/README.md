# Monitoring — Nearby-Events

What watches the live service (project `nearby-events-510418`, Cloud Run `nearby-events`, `asia-south1`):

| What | Where | Why |
|---|---|---|
| **Dashboard** "Nearby-Events - live monitoring" | Cloud Monitoring → Dashboards (`dashboard.json`) | One screen for traffic, speed, errors, uptime, board activity and AI health |
| **Uptime check** "Nearby-Events health" | Calls `GET /api/health` every 5 min from several regions | Proves the app *and* its Firestore connection are up |
| **Alert policy** "Nearby-Events is down" | `uptime-alert-policy.json` → email | Someone hears about an outage before users do |
| **Log-based metrics** (below) | Cloud Logging → Log-based metrics | Turn the API's structured JSON logs into counters, free |
| **Budget alert** | Billing → Budgets ($25, 50/90/100 %) | Cost safety on the free trial |
| **Daily quota caps** | APIs → Places API (New) / Maps JavaScript API → Quotas | Hard ceiling on Maps spend: autocomplete 1,000/day, place details 500/day, map loads 2,000/day |

## Log-based metrics

| Metric | Counts log lines with `jsonPayload.message` = |
|---|---|
| `events_created` | `Event created` |
| `rsvps_created` | `RSVP created` |
| `poster_extractions` | `Poster extraction complete` |
| `ai_retries` | `Gemini busy or slow, retrying once` |
| `ai_failures` | `Poster extraction failed`, `Gemini request failed, using the built-in assistant`, `Smart search parse failed, falling back to the built-in parser` |
| `expiry_sweeps` | `Expiration sweep complete` (the hourly Cloud Scheduler job) |
| `app_errors` | any entry with `severity >= ERROR` |

All are filtered to `resource.type="cloud_run_revision" AND resource.labels.service_name="nearby-events"`.

## Recreate in another project (PowerShell)

```powershell
$P = 'your-project-id'
$R = 'resource.type="cloud_run_revision" AND resource.labels.service_name="nearby-events"'
gcloud logging metrics create events_created --project $P --log-filter "$R AND jsonPayload.message=`"Event created`""
# ...one line per metric in the table above...
gcloud monitoring dashboards create --project $P --config-from-file monitoring/dashboard.json
```

The uptime check id inside `dashboard.json` and `uptime-alert-policy.json` (`nearby-events-health-…`) and the
notification channel (`CHANNEL`) are project-specific — replace them after creating the uptime check and an
email channel in the console.

## Useful log searches (Logs Explorer)

```
resource.type="cloud_run_revision" jsonPayload.message="Gemini busy or slow, retrying once"
resource.type="cloud_run_revision" jsonPayload.message="Poster extraction complete"
resource.type="cloud_run_revision" severity>=WARNING
```
