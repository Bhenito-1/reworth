# One-shot dev dependencies for marketplace (web + API + shared packages).
# Run from repo root:  .\scripts\install-dev.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Installing dev stack (@reworth/web, @reworth/api, workspaces)..." -ForegroundColor Cyan
pnpm install --frozen-lockfile `
  --filter "reworth..." `
  --filter "@reworth/web..." `
  --filter "@reworth/api..." `
  --filter "@reworth/admin..."

Write-Host "Generating Prisma client..." -ForegroundColor Cyan
pnpm --filter @reworth/api run prisma:generate

$nextBin = Join-Path $PWD "apps\web\node_modules\.bin\next.CMD"
if (-not (Test-Path $nextBin)) {
  Write-Error "next CLI still missing at $nextBin — install did not complete."
}
Write-Host "Done. Run: pnpm dev" -ForegroundColor Green
