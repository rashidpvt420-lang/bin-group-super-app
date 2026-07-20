param(
  [string]$ProjectId = "bin-group-57c60",
  [switch]$ConfigureSecrets
)

$ErrorActionPreference = "Stop"

Write-Host "BIN GROUP AI secret configuration preflight" -ForegroundColor Yellow
Write-Host "Project: $ProjectId" -ForegroundColor Yellow
Write-Host "This script can create new Firebase Secret Manager versions, but it cannot deploy production code." -ForegroundColor Gray

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not available in PATH."
  }
}

function Assert-LastExitCode($Operation) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with exit code $LASTEXITCODE."
  }
}

Assert-Command "git"
Assert-Command "firebase"
Assert-Command "node"
Assert-Command "npm"

$branch = (git branch --show-current).Trim()
Assert-LastExitCode "Read current Git branch"
if ($branch -ne "main") {
  throw "Run this script from main. Current branch: $branch"
}

$status = git status --porcelain
Assert-LastExitCode "Read Git working tree status"
if ($status) {
  Write-Host $status -ForegroundColor Red
  throw "Working tree is not clean. Commit, stash, or discard local edits first."
}

git fetch origin main --quiet
Assert-LastExitCode "Fetch origin/main"
$headSha = (git rev-parse HEAD).Trim()
Assert-LastExitCode "Read HEAD SHA"
$originMainSha = (git rev-parse origin/main).Trim()
Assert-LastExitCode "Read origin/main SHA"
if ($headSha -ne $originMainSha) {
  throw "Local main is not the exact current origin/main SHA. Local: $headSha; origin/main: $originMainSha"
}

if (-not $ConfigureSecrets) {
  throw "No secret changes were made. Re-run with -ConfigureSecrets only when you are ready to create new AI secret versions."
}

Write-Host "Setting AI Firebase Function secrets. Paste values only into Firebase CLI prompts." -ForegroundColor Cyan
firebase functions:secrets:set OPENAI_API_KEY --project $ProjectId
Assert-LastExitCode "Set OPENAI_API_KEY"
firebase functions:secrets:set IMAGE_GENERATION_API_KEY --project $ProjectId
Assert-LastExitCode "Set IMAGE_GENERATION_API_KEY"
firebase functions:secrets:set GEMINI_API_KEY --project $ProjectId
Assert-LastExitCode "Set GEMINI_API_KEY"

Write-Host "Verifying secret metadata. Secret values are not printed." -ForegroundColor Yellow
firebase functions:secrets:get OPENAI_API_KEY --project $ProjectId
Assert-LastExitCode "Read OPENAI_API_KEY metadata"
firebase functions:secrets:get IMAGE_GENERATION_API_KEY --project $ProjectId
Assert-LastExitCode "Read IMAGE_GENERATION_API_KEY metadata"
firebase functions:secrets:get GEMINI_API_KEY --project $ProjectId
Assert-LastExitCode "Read GEMINI_API_KEY metadata"

Write-Host "Running deterministic Functions validation." -ForegroundColor Yellow
npm ci --include=optional --legacy-peer-deps
Assert-LastExitCode "Install locked dependencies"
npm run build:functions
Assert-LastExitCode "Build Cloud Functions"

Write-Host "AI secret configuration and Functions validation completed." -ForegroundColor Green
Write-Host "No Firebase deployment was performed." -ForegroundColor Green
Write-Host "Deploy only through START HERE - Firebase Production Deploy using the exact current main SHA: $headSha" -ForegroundColor Yellow
