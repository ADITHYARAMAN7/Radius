# Radius — build and deploy to Cloud Run from Windows PowerShell.
#
#   .\scripts\deploy.ps1
#
# Reads the public build values (Firebase web config + Maps key) from frontend/.env.production
# (gitignored), then runs cloudbuild.yaml: build the image, push it, deploy to Cloud Run.
# Gemini runs through Vertex AI (no key), MAINTENANCE_TOKEN comes from Secret Manager.

param(
  [string]$Project = 'radius-510418',
  [string]$Region = 'asia-south1',
  [string]$Service = 'radius',
  [string]$VertexLocation = 'global'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'frontend\.env.production'
if (-not (Test-Path $envFile)) { throw "Missing $envFile - see CLAUDE.md (deployment) for the values it needs." }

$vals = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*VITE_[A-Z_]+=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  $vals[$name.Trim()] = $value.Trim()
}
foreach ($required in 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID') {
  if (-not $vals[$required]) { throw "$required is empty in frontend/.env.production" }
}

$subs = @(
  "_REGION=$Region", "_SERVICE=$Service", "_REPO=$Service",
  "_BUCKET=$Project-event-images", '_AI_PROVIDER=vertex', "_VERTEX_LOCATION=$VertexLocation",
  "_VITE_FIREBASE_API_KEY=$($vals.VITE_FIREBASE_API_KEY)",
  "_VITE_FIREBASE_AUTH_DOMAIN=$($vals.VITE_FIREBASE_AUTH_DOMAIN)",
  "_VITE_FIREBASE_PROJECT_ID=$($vals.VITE_FIREBASE_PROJECT_ID)",
  "_VITE_FIREBASE_STORAGE_BUCKET=$($vals.VITE_FIREBASE_STORAGE_BUCKET)",
  "_VITE_FIREBASE_MESSAGING_SENDER_ID=$($vals.VITE_FIREBASE_MESSAGING_SENDER_ID)",
  "_VITE_FIREBASE_APP_ID=$($vals.VITE_FIREBASE_APP_ID)",
  "_VITE_GOOGLE_MAPS_API_KEY=$($vals.VITE_GOOGLE_MAPS_API_KEY)"
) -join ','

Push-Location $root
try {
  Write-Host "Building and deploying $Service to $Project ($Region)... (about 5 minutes)"
  # gcloud prints progress on stderr; with 'Stop', PowerShell 5.1 treats that as a failure
  # whenever output is redirected. Judge the build by its exit code instead.
  $ErrorActionPreference = 'Continue'
  gcloud builds submit --config cloudbuild.yaml --project $Project --region $Region --substitutions $subs
  if ($LASTEXITCODE -ne 0) { throw "Build or deploy failed (exit code $LASTEXITCODE) - see the log above." }
  $url = gcloud run services describe $Service --region $Region --project $Project --format='value(status.url)'
  Write-Host "`nLive at: $url"
  Write-Host "Health:  $url/api/health"
} finally {
  Pop-Location
}
