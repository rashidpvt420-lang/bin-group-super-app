param(
  [string]$ProjectId = "bin-group-57c60",
  [switch]$SkipSecretSetup
)

$ErrorActionPreference = "Stop"

Write-Host "BIN GROUP Windows AI live recovery" -ForegroundColor Yellow
Write-Host "Project: $ProjectId" -ForegroundColor Yellow

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not available in PATH."
  }
}

Assert-Command "git"
Assert-Command "node"
Assert-Command "npm"
Assert-Command "firebase"

$branch = git branch --show-current
if ($branch -ne "main") {
  throw "Run this script from main after syncing with origin/main. Current branch: $branch"
}

$status = git status --porcelain
if ($status) {
  Write-Host $status -ForegroundColor Red
  throw "Working tree is not clean. Stash/commit/discard local edits before production deploy."
}

$env:NODE_OPTIONS = "--max-old-space-size=8192"
$env:GENERATE_SOURCEMAP = "false"
$env:VITE_SKIP_MINIFY = "1"

if (-not $SkipSecretSetup) {
  Write-Host "Setting AI Firebase Function secrets. Paste values only into Firebase prompts." -ForegroundColor Cyan
  firebase functions:secrets:set OPENAI_API_KEY --project $ProjectId
  firebase functions:secrets:set IMAGE_GENERATION_API_KEY --project $ProjectId
  firebase functions:secrets:set GEMINI_API_KEY --project $ProjectId
}

Write-Host "Verifying AI secret metadata. Values are not printed." -ForegroundColor Yellow
firebase functions:secrets:get OPENAI_API_KEY --project $ProjectId
firebase functions:secrets:get IMAGE_GENERATION_API_KEY --project $ProjectId
firebase functions:secrets:get GEMINI_API_KEY --project $ProjectId

Write-Host "Installing root dependencies." -ForegroundColor Yellow
npm install

Write-Host "Building main app with expanded Node heap." -ForegroundColor Yellow
npm run build

Write-Host "Building admin app with expanded Node heap." -ForegroundColor Yellow
npm run build:admin

Write-Host "Building functions." -ForegroundColor Yellow
npm run build:functions

if (-not (Test-Path ".\dist\index.html")) {
  throw "Main build output missing: dist/index.html"
}
if (-not (Test-Path ".\apps\admin-panel\build\index.html")) {
  throw "Admin build output missing: apps/admin-panel/build/index.html"
}

Write-Host "Deploying AI functions." -ForegroundColor Yellow
firebase deploy --only functions:runSovereignAI,functions:generateDesignConcept,functions:generateAIDesignConceptImages --project $ProjectId

Write-Host "Deploying hosting targets." -ForegroundColor Yellow
firebase deploy --only hosting --project $ProjectId

Write-Host "AI + hosting deployment completed." -ForegroundColor Green
