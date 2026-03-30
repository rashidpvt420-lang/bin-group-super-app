# BIN-GROUP Master V4.5 - FINAL PRODUCTION LAUNCH

Write-Host "[DEPLOY] INITIALIZING BIN-GROUP PRODUCTION HARD RESET..." -ForegroundColor Cyan

# 1. Resolve Firebase Target Conflict
Write-Host "Re-mapping Firebase Targets to Root Config..." -ForegroundColor Yellow
firebase target:clear hosting admin-panel
firebase target:clear hosting owner-portal
firebase target:clear hosting tenant-portal
firebase target:clear hosting technician-portal
firebase target:clear hosting bin-group

$ProjectID = "bin-group-57c60"
firebase target:apply hosting admin-panel "studio-5724711541-8a962-admin"
firebase target:apply hosting owner-portal "studio-5724711541-8a962-owner"
firebase target:apply hosting tenant-portal "studio-5724711541-8a962-tenant"
firebase target:apply hosting technician-portal "studio-5724711541-8a962-tech"
firebase target:apply hosting bin-group "home-os-owner-app"

# 2. Build Core Super-App (React)
$Root = Get-Location
Write-Host "Building React Super-App..." -ForegroundColor Green
Set-Location -Path "..\bin-group-super-app"
npm run build
Set-Location -Path $Root

# 3. Skip Flutter Core (Already in releases folder)
Write-Host "Skipping Flutter Core compilation... Using pre-built releases." -ForegroundColor Green

# 4. Final Deploy From Root
Write-Host "Finalizing Global Push..." -ForegroundColor Green
firebase deploy --only "hosting,functions,firestore,storage"

Write-Host "[SUCCESS] BIN-GROUP GLOBAL LAUNCH COMPLETE!" -ForegroundColor Cyan
Write-Host "NOTE: Add 'bin-groups.com' to Firebase Auth Authorized Domains." -ForegroundColor Yellow
exit 0
