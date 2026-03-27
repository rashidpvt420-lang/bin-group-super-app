# BIN-GROUP Master V4.4 - FINAL PRODUCTION LAUNCH

Write-Host "[DEPLOY] INITIALIZING BIN-GROUP PRODUCTION HARD RESET..." -ForegroundColor Cyan

# 1. Resolve Firebase Target Conflict
Write-Host "Re-mapping Firebase Targets to Root Config..." -ForegroundColor Yellow
firebase target:clear hosting admin-panel
firebase target:clear hosting owner-portal
firebase target:clear hosting tenant-portal
firebase target:clear hosting technician-portal
firebase target:clear hosting bin-group

$ProjectID = "studio-5724711541-8a962"
firebase target:apply hosting admin-panel "$ProjectID-admin"
firebase target:apply hosting owner-portal "$ProjectID-owner"
firebase target:apply hosting tenant-portal "$ProjectID-tenant"
firebase target:apply hosting technician-portal "$ProjectID-tech"
firebase target:apply hosting bin-group "home-os-owner-app"

# 2. Build Core Super-App (React)
$Root = Get-Location
Write-Host "Building React Super-App..." -ForegroundColor Green
Set-Location -Path "bin-group-super-app"
npm run build
Set-Location -Path $Root

# 3. Build & Deploy Flutter Core (Production Grade)
Write-Host "Compiling Flutter Core..." -ForegroundColor Green
Set-Location -Path "flutter-app"
$FlutterExe = "C:\Users\My-PC\Downloads\flutter_windows_3.41.1-stable\flutter\bin\flutter.bat"

# Initialize web platform support
& $FlutterExe create . --platforms web
& $FlutterExe pub get

# Production Build (Ultra-Optimized JS with CanvasKit Fallback)
# Note: --web-renderer is deprecated in Flutter 3.41.1; engine now handles renderer auto-detection.
# Using -O4 for maximum optimization levels.
& $FlutterExe build web --release -O4

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FATAL] Flutter Build Failed. Aborting deployment." -ForegroundColor Red
    exit 1
}

# 4. Final Deploy From Root
Set-Location -Path $Root
Write-Host "Finalizing Global Push..." -ForegroundColor Green
firebase deploy --only hosting:bin-group
firebase deploy --only hosting:owner-portal

Write-Host "[SUCCESS] BIN-GROUP GLOBAL LAUNCH COMPLETE!" -ForegroundColor Cyan
Write-Host "NOTE: Add 'studio-5724711541-8a962-owner.web.app' to Firebase Auth Authorized Domains." -ForegroundColor Yellow
exit 0
