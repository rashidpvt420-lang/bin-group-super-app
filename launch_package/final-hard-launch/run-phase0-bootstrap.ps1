$ErrorActionPreference = "Continue"
$repo = "C:\Users\My-PC\Desktop\bin app"
Set-Location $repo
$logRoot = Join-Path $repo "launch_package\final-hard-launch\logs"
New-Item -ItemType Directory -Force -Path $logRoot, (Join-Path $repo "launch_package\final-hard-launch\evidence"), (Join-Path $repo "launch_package\final-hard-launch\screenshots") | Out-Null

$proof = Join-Path $repo "launch_package\final-hard-launch\logs\phase0-proof.log"
function Log([string]$msg) { $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "$ts $msg" | Tee-Object -FilePath $proof -Append }

Log "=== PHASE 0A ==="
Log ("CWD: " + (Get-Location))
Log ("TOP: " + (git rev-parse --show-toplevel 2>&1))
Log ("BRANCH: " + (git branch --show-current 2>&1))
Log ("STATUS: " + (git status -sb 2>&1 | Out-String).Trim())
Log ("LOG: " + (git log -1 --oneline 2>&1))
Log ("REMOTE: " + (git remote -v 2>&1 | Out-String).Trim())
Log ("NODE: " + (node -v 2>&1))
Log ("NPM: " + (npm -v 2>&1))

Log "=== PHASE 0B ==="
Log ("DIFF STAT: " + (git diff --stat 2>&1 | Out-String).Trim())
Log ("DIFF NAMES: " + (git diff --name-status 2>&1 | Out-String).Trim())
Log ("SHORT STATUS: " + (git status --short 2>&1 | Out-String).Trim())

$branch = "fix/final-hard-launch-audit-2026-07-11"
if (git branch --list $branch) {
  $branch = "fix/final-hard-launch-audit-2026-07-11-" + (Get-Date -Format "HHmmss")
}
git switch -c $branch 2>&1 | ForEach-Object { Log $_ }
Log ("FINAL_BRANCH: $branch")
Log ("POST SWITCH: " + (git status -sb 2>&1 | Out-String).Trim())

$commands = @(
  @{ name = "npm-ci"; cmd = "npm ci" },
  @{ name = "baseline-build"; cmd = "npm run build" },
  @{ name = "build-functions"; cmd = "npm run build:functions" },
  @{ name = "verify-rules-hardening"; cmd = "npm run verify:rules-hardening" },
  @{ name = "test-stability"; cmd = "npm run test:stability" },
  @{ name = "build-admin"; cmd = "npm run build:admin" },
  @{ name = "build-owner"; cmd = "npm run build:owner" },
  @{ name = "test-repo-hygiene"; cmd = "npm run test:repo-hygiene" },
  @{ name = "test-runtime-audit"; cmd = "npm run test:runtime-audit" },
  @{ name = "test-pilot-clearance"; cmd = "npm run test:pilot-clearance" },
  @{ name = "test-launch-clearance"; cmd = "npm run test:launch-clearance" },
  @{ name = "test-hard-launch-readiness"; cmd = "npm run test:hard-launch-readiness" },
  @{ name = "test-mobile-store-readiness"; cmd = "npm run test:mobile-store-readiness" },
  @{ name = "test-gate12-appcheck"; cmd = "npm run test:gate12:appcheck" },
  @{ name = "test-gate12-appcheck-enforce"; cmd = "npm run test:gate12:appcheck:enforce" },
  @{ name = "test-gate12-stripe"; cmd = "npm run test:gate12:stripe" },
  @{ name = "launch-hard-gate"; cmd = "npm run launch:hard-gate" }
)

$results = @()
foreach ($item in $commands) {
  $logFile = Join-Path $logRoot ($item.name + ".log")
  $start = Get-Date
  Log ("START $($item.cmd)")
  & cmd /c "$($item.cmd) 2>&1" | Tee-Object -FilePath $logFile
  $code = $LASTEXITCODE
  $end = Get-Date
  $status = if ($code -eq 0) { "PASS" } else { "FAIL" }
  $line = "RESULT|$($item.cmd)|$start|$end|$code|$status"
  Log $line
  $results += $line
}

$results | Set-Content (Join-Path $repo "launch_package\final-hard-launch\logs\baseline-results.tsv")
Log "=== DONE ==="
