# Phase E local verification — run from repo root
$ErrorActionPreference = 'Continue'
$logDir = 'launch_package/final-hard-launch/logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$ts = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'

function Log-Step($name, $cmd) {
  $out = Join-Path $logDir "$ts-$name.log"
  Write-Host "==> $name"
  cmd /c "$cmd > `"$out`" 2>&1"
  Write-Host "    log: $out"
}

Log-Step 'functions-build' 'npm run build:functions'
Log-Step 'frontend-build' 'npm run build'
Log-Step 'rules-stability' 'npm run test:stability'
Log-Step 'hard-launch-readiness-pilot' 'node scripts/verify-hard-launch-readiness.mjs --pilot'
Log-Step 'gate12-controls' 'npm run test:gate12:controls'
Log-Step 'gate12-appcheck' 'npm run test:gate12:appcheck'
Log-Step 'gate12-smtp-secrets' 'npm run test:gate12:smtp:secrets'
Log-Step 'e2e-env' 'npm run test:e2e:env'

Write-Host "Done. Review logs in $logDir"
