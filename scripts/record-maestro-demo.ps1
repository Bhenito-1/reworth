# Optional helper: remind + run Maestro ≤60s demo (Windows).
# Does not capture video itself — start adb/QuickTime recording first if needed.
param(
  [string]$ApiHint = "http://127.0.0.1:3001/api/v1/healthz"
)

Write-Host "ReWorth Maestro demo helper" -ForegroundColor Cyan
Write-Host "1) Confirm API health: $ApiHint"
Write-Host "2) Start device screen recording (adb / QuickTime)"
Write-Host "3) Running: maestro test e2e/mobile/00_demo_60s.yaml"
Write-Host ""

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command maestro -ErrorAction SilentlyContinue)) {
  Write-Host "Maestro CLI not found. Install from https://maestro.mobile.dev" -ForegroundColor Yellow
  exit 1
}

maestro test e2e/mobile/00_demo_60s.yaml
$exit = $LASTEXITCODE
if ($exit -eq 0) {
  Write-Host "Maestro flow exited OK — stop recording and archive ≤60s clip for PO." -ForegroundColor Green
} else {
  Write-Host "Maestro failed (exit $exit). Fix device/appId/seed before recording." -ForegroundColor Red
}
exit $exit
