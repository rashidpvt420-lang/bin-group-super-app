# deploy-production.ps1
# [Institutional Build Engine v5.1 - FULL STACK]
# Enforces Single Operational Path for bin-group-57c60

$PROJECT_ID = "bin-group-57c60"
Write-Host '🚀 [BIN-DEVOPS] Initializing Hardened Full-Stack Deployment...' -ForegroundColor Green

# 1/5 Shared Package Build
Write-Host '🛠️ [1/5] Building Shared Pricing Engine (@bin/shared)...' -ForegroundColor Yellow
npm run build --workspace=@bin/shared
if ($LASTEXITCODE -ne 0) { Write-Host '❌ Shared Build Failed' -ForegroundColor Red; exit 1 }

# 2/5 Owner App Build
Write-Host '🏠 [2/5] Building Owner Terminal (Home SPA)...' -ForegroundColor Yellow
npm run build --workspace=home-os-owner-app
if ($LASTEXITCODE -ne 0) { Write-Host '❌ Owner App Build Failed' -ForegroundColor Red; exit 1 }

# 3/5 Admin Panel Build
Write-Host '🛡️ [3/5] Building Admin Panel (/admin SPA)...' -ForegroundColor Yellow
npm run build --workspace=home-os-admin-panel
if ($LASTEXITCODE -ne 0) { Write-Host '❌ Admin Panel Build Failed' -ForegroundColor Red; exit 1 }

# 4/5 Assemble Deployment Bundle
Write-Host '📦 [4/5] Assembling Unified Hosting Bundle...' -ForegroundColor Yellow
Remove-Item -Recurse -Force hosting/public/* -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force hosting/public/admin | Out-Null

Copy-Item -Recurse -Force apps/owner-app/build/* hosting/public/
Copy-Item -Recurse -Force apps/admin-panel/build/* hosting/public/admin/

# 5/5 Institutional Deploy (Atomic)
Write-Host '🚀 [5/5] Uploading to Production (bin-group-57c60)...' -ForegroundColor Cyan

$FUNCTIONS_DIR = Join-Path $PSScriptRoot "functions"
$DEPLOY_FLAGS = "hosting,firestore:rules,firestore:indexes,storage"

if (Test-Path $FUNCTIONS_DIR) {
    Write-Host '✅ Functions source detected. Building backend...' -ForegroundColor Gray
    $prevCwd = (Get-Location).Path
    Set-Location $FUNCTIONS_DIR
    npm run build
    Set-Location $prevCwd
    if ($LASTEXITCODE -ne 0) { Write-Host '❌ Functions Build Failed' -ForegroundColor Red; exit 1 }
    $DEPLOY_FLAGS += ",functions"
} else {
    Write-Host '⚠️ WARNING: functions directory NOT FOUND. Deployment will proceed without backend triggers.' -ForegroundColor Yellow
}

# Execute Institutional Deployment
firebase deploy --project=$PROJECT_ID --only "$DEPLOY_FLAGS" --force

if ($LASTEXITCODE -ne 0) { 
    Write-Host '❌ Deployment Failed!' -ForegroundColor Red
    exit 1 
}

Write-Host '✅ [COMPLETE] Deployment successful.' -ForegroundColor Green
Write-Host '🌍 Live surfaces:' -ForegroundColor White
Write-Host "OWNER: https://bin-groups.com/"
Write-Host "ADMIN: https://bin-groups.com/admin"
