# Deploying Radius to Google Cloud

> A runbook. Every command is copy-pasteable; set the variables in step 0 and the rest
> follow. Allow about 30 minutes end to end, most of it waiting for API enablement and
> Firestore index builds.
>
> What each service does and why: [gcp-architecture.md](gcp-architecture.md).

**Prerequisites**

- A Google account with billing enabled (the free tier covers this comfortably)
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed
- Node.js 20+ (only to build and test locally)

---

## 0 · Variables

Set these once in the shell you will use throughout.

```bash
export PROJECT_ID="radius-$(date +%s | tail -c 5)"   # must be globally unique
export REGION="asia-south1"                                   # Mumbai; use your nearest
export SERVICE="radius"
export REPO="radius"
export BUCKET="${PROJECT_ID}-event-images"

echo "Project: $PROJECT_ID   Region: $REGION"
```

> **Region advice:** keep Cloud Run, Firestore and Cloud Storage in the **same region** —
> cross-region reads add latency to every request. Vertex AI is the exception: it is not
> available everywhere, so it has its own `VERTEX_LOCATION` (default `global` — the Flash-Lite models are only served there; `us-central1` and `asia-south1` return errors for them).

---

## 1 · Create or select the project

```bash
gcloud auth login

# New project:
gcloud projects create "$PROJECT_ID" --name="Radius"

# Or use an existing one:
# export PROJECT_ID=your-existing-project

gcloud config set project "$PROJECT_ID"
```

**Link billing** — required for Cloud Run and Artifact Registry:

```bash
gcloud billing accounts list
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX
```

Verify:

```bash
gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)'   # true
```

---

## 2 · Enable APIs, provision infrastructure

The repository ships an idempotent script that does steps 2–5 of the manual process:
enables every API, creates the Artifact Registry repo and the storage bucket, creates a
**least-privilege runtime service account**, and creates both Secret Manager secrets.

```bash
chmod +x scripts/gcp-setup.sh
PROJECT_ID="$PROJECT_ID" REGION="$REGION" ./scripts/gcp-setup.sh
```

<details>
<summary>What it runs, if you would rather do it by hand</summary>

```bash
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com \
  storage.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com \
  logging.googleapis.com aiplatform.googleapis.com

gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION"

gcloud storage buckets create "gs://$BUCKET" \
  --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member=allUsers --role=roles/storage.objectViewer

gcloud iam service-accounts create "${SERVICE}-run" \
  --display-name="Radius Cloud Run runtime"

for ROLE in roles/datastore.user roles/storage.objectAdmin \
            roles/secretmanager.secretAccessor roles/logging.logWriter \
            roles/firebaseauth.admin roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE}-run@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$ROLE" --condition=None
done
```

</details>

API enablement can take a couple of minutes to propagate. If a later step reports an API is
disabled, wait 60 seconds and retry.

---

## 3 · Configure Firebase

Firebase shares the Google Cloud project; these steps need the console.

### 3.1 Add Firebase to the project

Open <https://console.firebase.google.com> → **Add project** → choose **`$PROJECT_ID`**
from the list (do not create a new one).

### 3.2 Enable sign-in methods

**Authentication** → **Get started** → **Sign-in method**:

- **Email/Password** → Enable → Save
- **Google** → Enable → pick a support email → Save

### 3.3 Register the web app and capture its config

**Project settings** (gear) → **Your apps** → **Web** (`</>`) → register.

Copy the six values into shell variables — they are needed for the build:

```bash
export VITE_FIREBASE_API_KEY="AIza..."
export VITE_FIREBASE_AUTH_DOMAIN="${PROJECT_ID}.firebaseapp.com"
export VITE_FIREBASE_PROJECT_ID="$PROJECT_ID"
export VITE_FIREBASE_STORAGE_BUCKET="${PROJECT_ID}.appspot.com"
export VITE_FIREBASE_MESSAGING_SENDER_ID="123456789012"
export VITE_FIREBASE_APP_ID="1:123456789012:web:abc123"
```

> These are **public by design** — they ship to every browser. Security comes from
> Firestore rules and from server-side token verification, never from hiding them.

### 3.4 Authorise the deployed domain

After step 9 you will have a Cloud Run URL. Come back to
**Authentication → Settings → Authorized domains** and add its hostname, or **Google
sign-in will fail** with `auth/unauthorized-domain`. `localhost` is allowed by default.

---

## 4 · Configure Firestore

### 4.1 Create the database

Console → **Firestore Database** → **Create database** → **Production mode** → region
**`$REGION`**.

Or:

```bash
gcloud firestore databases create --location="$REGION"
```

### 4.2 Deploy rules and indexes

```bash
npx firebase-tools@13 login
npx firebase-tools@13 use "$PROJECT_ID"
npx firebase-tools@13 deploy --only firestore:rules,firestore:indexes
```

Composite indexes take a few minutes to build. Until they are ready, filtered queries
return an error containing a direct link to create the missing index — following that link
also works.

Check progress:

```bash
gcloud firestore indexes composite list --format='table(name,state)'
```

### 4.3 Seed demo data (optional but recommended for a demo)

```bash
cd backend
cp .env.example .env
# set GCP_PROJECT_ID=$PROJECT_ID in backend/.env, then authenticate locally:
gcloud auth application-default login
npm install && npm run seed
cd ..
```

Events are generated **relative to today**, so the board is always genuinely upcoming.

---

## 5 · Configure Cloud Storage

Created by the setup script. To do it manually, or to verify:

```bash
gcloud storage buckets describe "gs://$BUCKET" --format='value(name,location)'
```

Browser reads need CORS:

```bash
cat > /tmp/cors.json <<'JSON'
[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
JSON
gcloud storage buckets update "gs://$BUCKET" --cors-file=/tmp/cors.json
```

Uploads go **through the API**, never directly from the browser, so no storage credential
reaches a client and the 5 MB / MIME limits are enforced server-side.

---

## 6 · Configure Google Maps

### 6.1 Enable and create a key

```bash
gcloud services enable maps-backend.googleapis.com
```

Console → **APIs & Services** → **Credentials** → **Create credentials** → **API key**.

### 6.2 Restrict it — do this before the URL is public

In the key's settings:

- **Application restrictions** → **HTTP referrers**, add:
  - `http://localhost:5173/*`
  - `http://localhost:8080/*`
  - `https://*.run.app/*` (tighten to your exact hostname after step 9)
- **API restrictions** → **Restrict key** → **Maps JavaScript API** only

```bash
export VITE_GOOGLE_MAPS_API_KEY="AIza..."
```

> An unrestricted Maps key in a public bundle is a billing incident waiting to happen. The
> restriction is the control, not secrecy.

Without a key, the map view explains what is missing and the list view is unaffected.

---

## 7 · Configure Gemini or Vertex AI

Pick one.

### Option A — Gemini Developer API (fastest)

Get a key at <https://aistudio.google.com/apikey>, then store it as a secret:

```bash
printf 'YOUR_GEMINI_KEY' | gcloud secrets versions add gemini-api-key --data-file=-
export AI_PROVIDER=api
```

### Option B — Vertex AI (recommended for production)

No key exists anywhere; the Cloud Run service account authenticates.

```bash
gcloud services enable aiplatform.googleapis.com
# roles/aiplatform.user was granted by the setup script
export AI_PROVIDER=vertex
export VERTEX_LOCATION=global
```

Either way the AI features are optional — the app runs with them switched off.

---

## 8 · Build the application

### 8.1 Verify locally first

Do not deploy something you have not built:

```bash
npm run install:all
npm run typecheck      # 0 errors expected
npm run build          # both halves
```

### 8.2 Build and deploy with Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions="\
_REGION=${REGION},\
_SERVICE=${SERVICE},\
_REPO=${REPO},\
_BUCKET=${BUCKET},\
_AI_PROVIDER=${AI_PROVIDER:-api},\
_VERTEX_LOCATION=${VERTEX_LOCATION:-global},\
_VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY},\
_VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN},\
_VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID},\
_VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET},\
_VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID},\
_VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID},\
_VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}"
```

This single command builds the image, pushes it to Artifact Registry, and deploys the
revision. Steps 8 and 9 are one operation.

> ### Why not `gcloud builds submit --tag`
>
> It **cannot build this project**. It expects a Dockerfile at the source root (ours is
> `docker/Dockerfile`) and it cannot pass `--build-arg`. Vite inlines `VITE_*` at **build**
> time, so without build args the deployed bundle ships with an empty Firebase config and
> no Maps key — **sign-in and the map fail in production while the build reports success.**
> Always use `--config cloudbuild.yaml`.

<details>
<summary>Building locally with Docker instead</summary>

```bash
docker build -f docker/Dockerfile \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY" \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN" \
  --build-arg VITE_FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID" \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET="$VITE_FIREBASE_STORAGE_BUCKET" \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="$VITE_FIREBASE_MESSAGING_SENDER_ID" \
  --build-arg VITE_FIREBASE_APP_ID="$VITE_FIREBASE_APP_ID" \
  --build-arg VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" \
  -t "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:local" .

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker push "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:local"
```

</details>

---

## 9 · Deploy to Cloud Run

`cloudbuild.yaml` already deployed. To deploy an existing image by hand, or to change
runtime settings:

```bash
gcloud run deploy "$SERVICE" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="${SERVICE}-run@${PROJECT_ID}.iam.gserviceaccount.com" \
  --memory=512Mi --cpu=1 \
  --min-instances=0 --max-instances=10 --timeout=60s \
  --set-env-vars="NODE_ENV=production,TZ=Asia/Kolkata,SERVE_STATIC=true,GCP_PROJECT_ID=${PROJECT_ID},GCS_BUCKET=${BUCKET},AI_PROVIDER=${AI_PROVIDER:-api},VERTEX_LOCATION=${VERTEX_LOCATION:-global}" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest,MAINTENANCE_TOKEN=maintenance-token:latest"
```

Capture the URL and verify:

```bash
export SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo "$SERVICE_URL"

curl -s "$SERVICE_URL/api/health" | python3 -m json.tool
```

Expected:

```json
{
  "status": "ok",
  "integrations": {
    "firestore": "connected",
    "cloudStorage": "configured",
    "gemini": "configured (api)",
    "scheduledExpiry": "configured"
  }
}
```

**Now go back to step 3.4** and add `$SERVICE_URL`'s hostname to Firebase authorised
domains, and tighten the Maps key referrer restriction to it.

### Schedule the expiry sweep

```bash
gcloud scheduler jobs create http expire-events \
  --location="$REGION" \
  --schedule="0 * * * *" \
  --uri="${SERVICE_URL}/api/maintenance/expire" \
  --http-method=POST \
  --headers="X-Maintenance-Token=$(gcloud secrets versions access latest --secret=maintenance-token)"

# Run it once now to confirm it works
gcloud scheduler jobs run expire-events --location="$REGION"
```

---

## 10 · Environment variables

Runtime configuration lives on the service, not in the image, so the same artifact can be
promoted between environments.

| Variable | Where it comes from | Notes |
|---|---|---|
| `PORT` | Cloud Run | Do not set it yourself |
| `NODE_ENV` | `--set-env-vars` | `production` |
| `SERVE_STATIC` | `--set-env-vars` | `true` |
| `TZ` | `--set-env-vars` | `Asia/Kolkata` — "Today"/"Weekend" filters use the server's local day; Cloud Run defaults to UTC |
| `GCP_PROJECT_ID` | `--set-env-vars` | |
| `GCS_BUCKET` | `--set-env-vars` | No `gs://` prefix |
| `AI_PROVIDER` | `--set-env-vars` | `api` or `vertex` |
| `VERTEX_LOCATION` | `--set-env-vars` | Only for `vertex` |
| `GEMINI_API_KEY` | `--set-secrets` | **Never** an env var or build arg |
| `MAINTENANCE_TOKEN` | `--set-secrets` | **Never** an env var or build arg |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | **Leave unset.** Cloud Run uses the attached service account |

Inspect or update without a rebuild:

```bash
gcloud run services describe "$SERVICE" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env)'

gcloud run services update "$SERVICE" --region="$REGION" \
  --update-env-vars=AI_PROVIDER=vertex
```

Rotate a secret (a new revision picks it up):

```bash
printf 'NEW_KEY' | gcloud secrets versions add gemini-api-key --data-file=-
gcloud run services update "$SERVICE" --region="$REGION"
```

---

## 11 · Checking logs

Application logs are structured JSON with trace correlation, so they are queryable rather
than greppable.

```bash
# Live tail
gcloud beta run services logs tail "$SERVICE" --region="$REGION"

# Last 50 entries
gcloud run services logs read "$SERVICE" --region="$REGION" --limit=50
```

Useful filters:

```bash
# Errors only, last hour
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name="'"$SERVICE"'" AND severity>=ERROR' \
  --freshness=1h --format='table(timestamp,jsonPayload.message,jsonPayload.errorMessage)'

# Follow one event through the system
gcloud logging read \
  'resource.type=cloud_run_revision AND jsonPayload.eventId="EVENT_ID"' \
  --freshness=24h --format='table(timestamp,severity,jsonPayload.message)'

# Did the scheduled sweep run?
gcloud logging read \
  'resource.type=cloud_run_revision AND jsonPayload.message="Expiration sweep complete"' \
  --freshness=24h --format='table(timestamp,jsonPayload.expired)'

# Who is hitting rate limits?
gcloud logging read \
  'resource.type=cloud_run_revision AND jsonPayload.message="Rate limit exceeded"' \
  --freshness=1h --format='table(timestamp,jsonPayload.key,jsonPayload.path)'
```

In the console: **Logging → Logs Explorer**, filter to the Cloud Run revision. Because the
payload is structured, every field is directly filterable, and a log line links through to
its request trace.

---

## Before a live demo

```bash
gcloud run services update "$SERVICE" --region="$REGION" --min-instances=1
```

Cloud Run scales to zero and a cold start in front of judges is avoidable. Afterwards:

```bash
gcloud run services update "$SERVICE" --region="$REGION" --min-instances=0
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `Dockerfile required` | Used `--tag` instead of `--config` | Use `--config cloudbuild.yaml` |
| Sign-in does nothing; console shows an invalid API key | `VITE_FIREBASE_*` substitutions were empty at build | Rebuild with the values set — they are **build**-time |
| `auth/unauthorized-domain` | Cloud Run hostname not authorised | Firebase → Authentication → Settings → Authorized domains |
| Map area explains it is unavailable | No Maps key, or referrer restriction excludes the host | Add the host to the key's HTTP referrers |
| `/api/health` → `firestore: unreachable` | Database not created, or the service account lacks `datastore.user` | Create the database; re-run `scripts/gcp-setup.sh` |
| Query fails asking for an index | Composite index still building | Wait, or follow the link in the error |
| AI buttons missing | `gemini-api-key` still the `unset` placeholder | Add a real version, or switch to `AI_PROVIDER=vertex` |
| Image upload → 503 | `GCS_BUCKET` unset | `gcloud run services update --update-env-vars=GCS_BUCKET=...` |
| First request very slow | Cold start | `--min-instances=1` before demoing |
| Scheduler job → 403 | Token mismatch | Recreate the job with the current secret value |

---

## Teardown

```bash
gcloud run services delete "$SERVICE" --region="$REGION" --quiet
gcloud scheduler jobs delete expire-events --location="$REGION" --quiet
gcloud artifacts repositories delete "$REPO" --location="$REGION" --quiet
gcloud storage rm -r "gs://$BUCKET"

# Or remove everything at once:
gcloud projects delete "$PROJECT_ID"
```

---

## Running locally is unaffected

None of the above is required for local development. With the emulators you need no Google
Cloud project at all:

```bash
# Terminal 1 — needs Java
npx firebase-tools@13 emulators:start --only firestore,auth

# Terminal 2
printf 'FIRESTORE_EMULATOR_HOST=127.0.0.1:8081\nFIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\n' >> backend/.env
echo 'VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099' >> frontend/.env

npm run seed
npm run dev
```

Sign-in, events, RSVPs and the full signed-in app all work against the emulators. Only the
map and the AI assistant need real keys.
