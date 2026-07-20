param(
  [string]$ProjectId = "bin-group-57c60",
  [switch]$ConfigureSecrets
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "BIN GROUP Windows AI recovery preflight" -ForegroundColor Yellow
Write-Host "Project: $ProjectId" -ForegroundColor Yellow

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not available in PATH."
  }
}

foreach ($command in @("git", "node", "npm", "java", "firebase")) {
  Assert-Command $command
}

if ($ProjectId -ne "bin-group-57c60") {
  throw "This recovery preflight is restricted to the canonical BIN GROUP production project."
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "main") {
  throw "Run this preflight from main. Current branch: $branch"
}

$status = git status --porcelain
if ($status) {
  Write-Host $status -ForegroundColor Red
  throw "Working tree is not clean. Commit, stash, or discard local edits before validation."
}

Write-Host "Refreshing origin/main before exact-SHA validation." -ForegroundColor Yellow
git fetch origin main --quiet

$headSha = (git rev-parse HEAD).Trim()
$originMainSha = (git rev-parse origin/main).Trim()
if ($headSha -notmatch '^[0-9a-f]{40}$' -or $originMainSha -notmatch '^[0-9a-f]{40}$') {
  throw "Could not resolve a valid exact commit SHA."
}
if ($headSha -ne $originMainSha) {
  throw "Local main is not the exact current origin/main SHA. Local: $headSha; origin/main: $originMainSha"
}

$env:NODE_OPTIONS = "--max-old-space-size=8192"
$env:GENERATE_SOURCEMAP = "false"

if ($ConfigureSecrets) {
  Write-Host "Configuring AI Function secrets. Secret values are entered only into Firebase prompts." -ForegroundColor Cyan
  firebase functions:secrets:set OPENAI_API_KEY --project $ProjectId
  firebase functions:secrets:set IMAGE_GENERATION_API_KEY --project $ProjectId
  firebase functions:secrets:set GEMINI_API_KEY --project $ProjectId
}

Write-Host "Verifying AI secret metadata. Values are not printed." -ForegroundColor Yellow
firebase functions:secrets:get OPENAI_API_KEY --project $ProjectId
firebase functions:secrets:get IMAGE_GENERATION_API_KEY --project $ProjectId
firebase functions:secrets:get GEMINI_API_KEY --project $ProjectId

Write-Host "Installing locked dependencies." -ForegroundColor Yellow
npm ci --include=optional --legacy-peer-deps

Write-Host "Running source validation." -ForegroundColor Yellow
npm run test:repo-hygiene
npm run test:launch-honesty
npm run typecheck
npm run lint
npm run build:shared
npm run build
npm run build:admin
npm run build:functions
npm run test:rules
npm run test:stability
npm run test:mobile-store-readiness

if (-not (Test-Path ".\dist\index.html")) {
  throw "Main build output missing: dist/index.html"
}
if (-not (Test-Path ".\apps\admin-panel\build\index.html")) {
  throw "Admin build output missing: apps/admin-panel/build/index.html"
}

Write-Host "Windows AI recovery preflight passed for exact SHA $headSha." -ForegroundColor Green
Write-Host "No Firebase deployment was performed." -ForegroundColor Yellow
Write-Host "Start the protected START HERE - Firebase Production Deploy workflow from main and bind it to exact SHA $headSha." -ForegroundColor Cyan
