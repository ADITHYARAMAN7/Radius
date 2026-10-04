# Radius — demo-day switch for the live Cloud Run deployment (Windows PowerShell).
#
#   .\scripts\demo-day.ps1          # morning of the demo: fresh demo events + one warm instance
#   .\scripts\demo-day.ps1 -Off     # after the demo: back to scale-to-zero (stops the idle cost)
#
# Seed dates are relative to the day you seed, so events seeded days earlier have started to
# expire. Re-seeding only replaces the demo events (seedTag); events people posted are kept.
# Needs: gcloud signed in, and `gcloud auth application-default login` done once.

param(
  [switch]$Off,
  [string]$Project = 'radius-510418',
  [string]$Region = 'asia-south1',
  [string]$Service = 'radius'
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot

if ($Off) {
  gcloud run services update $Service --region $Region --project $Project --min-instances=0
  if ($LASTEXITCODE -ne 0) { throw 'Could not set min-instances back to 0.' }
  Write-Host 'Back to scale-to-zero.'
  return
}

Write-Host "Re-seeding the REAL Firestore in $Project ..."
Push-Location $root
try {
  $env:GCP_PROJECT_ID = $Project
  Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
  npx tsx scripts/seed-events.ts --clear
  if ($LASTEXITCODE -ne 0) { throw 'Seeding failed - see the messages above.' }
} finally {
  Remove-Item Env:GCP_PROJECT_ID -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host 'Keeping one instance warm (no cold start in front of the judges)...'
gcloud run services update $Service --region $Region --project $Project --min-instances=1
if ($LASTEXITCODE -ne 0) { throw 'Could not set min-instances=1.' }

$url = gcloud run services describe $Service --region $Region --project $Project --format='value(status.url)'
Write-Host "`nReady: $url"
Write-Host "Health: $url/api/health"
Write-Host 'After the demo run:  .\scripts\demo-day.ps1 -Off'
