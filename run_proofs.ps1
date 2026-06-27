$ErrorActionPreference = "Stop"

function Run-Command {
    param([string]$cmd)
    Write-Host "`n=== Running: $cmd ==="
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $cmd with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Run-Command "npm run typecheck"
Run-Command "npm run build"
Run-Command "npm run build:admin"
Run-Command "npm run build:functions"
Run-Command "npm run test:rules"
Run-Command "npm run test:pilot-clearance"
Run-Command "npm run test:hard-launch-readiness"
Run-Command "npm run mobile:check"
Run-Command "npm run mobile:sync"

Write-Host "`n=== ALL COMMANDS PASSED ===" -ForegroundColor Green
