#!/usr/bin/env bash
#
# Radius — one-time Google Cloud provisioning.
#
# Idempotent: every step checks before it creates, so re-running after a failure is
# safe and will not duplicate anything.
#
#   chmod +x scripts/gcp-setup.sh
#   PROJECT_ID=my-project REGION=asia-south1 ./scripts/gcp-setup.sh
#
# Creates: enabled APIs, Artifact Registry repo, Cloud Storage bucket, a least-privilege
# runtime service account, and the two Secret Manager secrets.
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-radius}"
REPO="${REPO:-radius}"
BUCKET="${BUCKET:-${PROJECT_ID}-event-images}"
RUNTIME_SA="${SERVICE}-run"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID is required, e.g.  PROJECT_ID=my-project ./scripts/gcp-setup.sh" >&2
  exit 1
fi

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()  { printf '    \033[0;32m%s\033[0m\n' "$1"; }

gcloud config set project "$PROJECT_ID" >/dev/null
say "Project: $PROJECT_ID   Region: $REGION"

# --------------------------------------------------------------------------- APIs
say "Enabling APIs (safe to re-run)"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  identitytoolkit.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  logging.googleapis.com \
  aiplatform.googleapis.com \
  --quiet
ok "APIs enabled"

# ---------------------------------------------------------- Artifact Registry
say "Artifact Registry repository"
if gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  ok "repository '$REPO' already exists"
else
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Radius container images" \
    --quiet
  ok "repository '$REPO' created"
fi

# ------------------------------------------------------------- Cloud Storage
say "Cloud Storage bucket for event images"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  ok "bucket gs://$BUCKET already exists"
else
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --quiet
  ok "bucket gs://$BUCKET created"
fi

# Event images are shown on a public board, so the objects are publicly readable.
# Uniform bucket-level access means this is the only grant that matters.
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member=allUsers \
  --role=roles/storage.objectViewer \
  --quiet >/dev/null
ok "public read granted (objects only)"

CORS_FILE="$(mktemp)"
cat > "$CORS_FILE" <<'JSON'
[{"origin":["*"],"method":["GET","HEAD"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
JSON
gcloud storage buckets update "gs://$BUCKET" --cors-file="$CORS_FILE" --quiet
rm -f "$CORS_FILE"
ok "CORS configured for browser reads"

# ------------------------------------------------------- runtime service account
#
# A dedicated identity with only the roles this app actually needs. The default
# Compute service account is far broader than required and should not be used.
say "Runtime service account"
SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  ok "service account already exists"
else
  gcloud iam service-accounts create "$RUNTIME_SA" \
    --display-name="Radius Cloud Run runtime" \
    --quiet
  ok "service account created"
fi

for ROLE in \
  roles/datastore.user \
  roles/storage.objectAdmin \
  roles/secretmanager.secretAccessor \
  roles/logging.logWriter \
  roles/firebaseauth.admin \
  roles/aiplatform.user
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None \
    --quiet >/dev/null
  ok "granted $ROLE"
done

# ------------------------------------------------------------- Secret Manager
say "Secrets"

ensure_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    ok "secret '$name' already exists (left untouched)"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --quiet
    ok "secret '$name' created"
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:$SA_EMAIL" \
    --role=roles/secretmanager.secretAccessor \
    --quiet >/dev/null
}

# Random by default so a deployment is never left with a guessable sweep token.
ensure_secret "maintenance-token" "$(openssl rand -hex 32)"

# Placeholder: replace with a real key, or switch to AI_PROVIDER=vertex and leave it.
ensure_secret "gemini-api-key" "unset"

# -------------------------------------------------------- Cloud Build permissions
say "Cloud Build permissions"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$CB_SA" \
    --role="$ROLE" \
    --condition=None \
    --quiet >/dev/null
  ok "Cloud Build granted $ROLE"
done

# --------------------------------------------------------------------- summary
cat <<SUMMARY

$(printf '\033[1;32m')Provisioning complete.$(printf '\033[0m')

  Project            $PROJECT_ID
  Region             $REGION
  Image repository   ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}
  Image bucket       gs://${BUCKET}
  Runtime identity   ${SA_EMAIL}
  Secrets            maintenance-token, gemini-api-key

Still to do by hand (they need the console):

  1. Firestore database   — create it in $REGION, production mode
  2. Firebase Auth        — enable Email/Password and Google sign-in
  3. Web app config       — copy the six values for the build substitutions
  4. Maps API key         — create and restrict by HTTP referrer
  5. Gemini key           — gcloud secrets versions add gemini-api-key --data-file=-
                            (skip if you use AI_PROVIDER=vertex)

Then deploy:  see docs/gcp-deployment.md
SUMMARY
