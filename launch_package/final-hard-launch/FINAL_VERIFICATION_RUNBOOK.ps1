# FINAL_VERIFICATION_RUNBOOK.ps1
# BIN GROUP Super App - controlled bank-transfer pilot verification (no hard public launch).
# Run from repo root in PowerShell 7+ on a machine with .env.e2e, Firebase Admin creds, and network.
# Do NOT paste prior log output back into this script - only run the commands below.

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\My-PC\Desktop\bin app'
Set-Location $repo

$logRoot = Join-Path $repo 'launch_package\final-hard-launch\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$ts = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
$runLog = Join-Path $logRoot "final-verification-$ts.log"

function Write-RunLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Write-Host $line
  Add-Content -Path $runLog -Value $line
}

function Invoke-GateStep {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$Command
  )
  $stepLog = Join-Path $logRoot "$ts-$Name.log"
  Write-RunLog "==> $Name"
  try {
    & $Command *>&1 | Tee-Object -FilePath $stepLog
    if ($LASTEXITCODE -ne 0) {
      throw "Exit code $LASTEXITCODE"
    }
    Write-RunLog "[PASS] $Name (log: $stepLog)"
    return $true
  } catch {
      Write-RunLog "[FAIL] $Name - $($_.Exception.Message) (log: $stepLog)"
  }
  return $false
}

Write-RunLog '=== BIN GROUP final verification runbook ==='
Write-RunLog "Repo: $repo"
Write-RunLog "Run log: $runLog"

# --- Preflight: disk + git sanity (informational) ---
$drive = Get-PSDrive C
$freeGb = [math]::Round($drive.Free / 1GB, 2)
Write-RunLog "C: free space: ${freeGb} GB"
if ($freeGb -lt 5) {
  Write-RunLog 'WARNING: less than 5 GB free - skip Playwright / large npm ci unless space is freed first.'
}

Write-RunLog 'Git snapshot:'
git status -sb 2>&1 | Tee-Object -FilePath (Join-Path $logRoot "$ts-git-status.log")
git log -1 --oneline 2>&1 | Tee-Object -FilePath (Join-Path $logRoot "$ts-git-log.log") -Append
$conflicts = git diff --name-only --diff-filter=U 2>&1
if ($conflicts) {
  Write-RunLog "ABORT: merge conflicts present: $conflicts"
  exit 1
}

# Bank-transfer pilot scope - Stripe format checks become advisory only.
$env:LAUNCH_BANK_ONLY = '1'
$env:VITE_ENABLE_STRIPE_CHECKOUT = 'false'
Write-RunLog 'LAUNCH_BANK_ONLY=1 (bank-transfer pilot; Stripe card billing deferred)'
Write-RunLog 'VITE_ENABLE_STRIPE_CHECKOUT=false (card checkout disabled for pilot)'

# --- Prerequisite: unique E2E passwords (invalidates any pilot timer started before this) ---
Write-RunLog '--- Phase 0: rotate E2E role passwords (required before env guard) ---'
Write-RunLog 'Requires Firebase Admin + .env.e2e. Updates .env.e2e locally only.'
Invoke-GateStep -Name 'gate12-rotate-e2e' -Command { npm run gate12:rotate-e2e }
Invoke-GateStep -Name 'seed-e2e-auth' -Command { npm run seed:e2e:auth }

# --- Block 1: build + stability ---
Write-RunLog '--- Block 1: build + stability ---'
$block1Ok = $true
$block1Ok = (Invoke-GateStep -Name 'build-functions' -Command { npm run build:functions }) -and $block1Ok
$block1Ok = (Invoke-GateStep -Name 'build-frontend' -Command { npm run build }) -and $block1Ok
$block1Ok = (Invoke-GateStep -Name 'test-stability' -Command { npm run test:stability }) -and $block1Ok
if (-not $block1Ok) {
  Write-RunLog 'Block 1 failed - fix build/stability before continuing.'
  exit 1
}

# --- Block 2: E2E credential guards ---
Write-RunLog '--- Block 2: E2E env + REST auth ---'
$block2Ok = $true
$block2Ok = (Invoke-GateStep -Name 'test-e2e-env' -Command { npm run test:e2e:env }) -and $block2Ok
$block2Ok = (Invoke-GateStep -Name 'test-e2e-auth-rest' -Command { npm run test:e2e:auth-rest }) -and $block2Ok
if (-not $block2Ok) {
  Write-RunLog 'Block 2 failed - re-run gate12:rotate-e2e and seed:e2e:auth, then retry.'
  exit 1
}

# --- Block 3: Gate 12 production controls (bank-only advisory Stripe) ---
Write-RunLog '--- Block 3: Gate 12 controls / SMTP / App Check ---'
$block3Ok = $true
$block3Ok = (Invoke-GateStep -Name 'test-gate12-controls' -Command { npm run test:gate12:controls }) -and $block3Ok
$block3Ok = (Invoke-GateStep -Name 'test-gate12-smtp' -Command { npm run test:gate12:smtp }) -and $block3Ok
$block3Ok = (Invoke-GateStep -Name 'test-gate12-appcheck' -Command { npm run test:gate12:appcheck }) -and $block3Ok
if (-not $block3Ok) {
  Write-RunLog 'Block 3 failed - resolve Gate 12 blockers (non-Stripe for bank pilot).'
  exit 1
}

# --- Block 4: fixtures + full launch automation chain ---
Write-RunLog '--- Block 4: seed Gate 11 + launch:fix-all ---'
$block4Ok = $true
$block4Ok = (Invoke-GateStep -Name 'seed-e2e-gate11' -Command { npm run seed:e2e:gate11 }) -and $block4Ok
Write-RunLog 'launch:fix-all runs production E2E + records Firestore evidence on real passes.'
Write-RunLog 'NOTE: launch:fix-all also calls pilot-launch-watch start at the end - only run when Blocks 1-3 passed.'
$block4Ok = (Invoke-GateStep -Name 'launch-fix-all' -Command { npm run launch:fix-all }) -and $block4Ok
if (-not $block4Ok) {
  Write-RunLog 'Block 4 failed - inspect launch_package/final-hard-launch/logs/*-launch-fix-all.log'
  exit 1
}

# --- Block 5: launch status + pilot clearance register ---
Write-RunLog '--- Block 5: launch status + pilot clearance ---'
$block5Ok = $true
$block5Ok = (Invoke-GateStep -Name 'launch-status' -Command { npm run launch:status }) -and $block5Ok
$block5Ok = (Invoke-GateStep -Name 'test-pilot-clearance' -Command { npm run test:pilot-clearance }) -and $block5Ok
if (-not $block5Ok) {
  Write-RunLog 'Block 5 failed - pilot not yet eligible.'
  exit 1
}

# --- Block 6: Stripe prefix check (MANUAL - hard public launch only) ---
Write-RunLog '--- Block 6: Stripe live secret prefix (MANUAL / public launch only) ---'
Write-RunLog 'Bank pilot does NOT require sk_live_/whsec_ - do not green hard-launch-readiness.json manually.'
Write-RunLog 'For future public launch, verify prefixes only (never paste full secrets into chat):'
Write-RunLog '  (gcloud secrets versions access latest --secret=STRIPE_SECRET_KEY --project=bin-group-57c60).Substring(0,8)  # expect sk_live_'
Write-RunLog '  (gcloud secrets versions access latest --secret=STRIPE_WEBHOOK_SECRET --project=bin-group-57c60).Substring(0,6)  # expect whsec_'
Write-RunLog 'Then: npm run test:gate12:stripe && npm run launch:verify-stripe'

# --- Block 7: pilot window (ONLY after full chain above passes) ---
Write-RunLog '--- Block 7: pilot window restart (only after Blocks 1-5 all PASS) ---'
Write-RunLog 'If a pilot timer was started before unique passwords or before this clean chain, reset it first:'
Write-RunLog '  Firebase Console -> Firestore -> system_health/pilot_window -> delete document (or clear pilotStartedAt)'
Write-RunLog 'Then start a fresh 48h window:'
Invoke-GateStep -Name 'launch-pilot-start' -Command { npm run launch:pilot:start }
Write-RunLog 'After 48h with no P0/P1: npm run launch:pilot:verify'

Write-RunLog '=== Final verification runbook complete ==='
Write-RunLog "Review logs under: $logRoot"
Write-RunLog 'Verdict target: CONTROLLED BANK-TRANSFER PILOT ELIGIBLE + HARD LAUNCH NO-GO'
