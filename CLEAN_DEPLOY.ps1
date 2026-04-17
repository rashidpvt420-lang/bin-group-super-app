# BIN Construction V2 - Master Deployment Script
# This script bypasses local 'sandbox-exec' issues by deploying pre-transpiled assets.

Write-Host "🚀 Starting BIN Construction V2 Production Launch..." -ForegroundColor Cyan

# 1. Clean and Prepare
Write-Host "Step 1: Preparing build environment..."
$Root = Get-Location

# Initialize Hosting Targets (Required for first-time multisite setup)
Write-Host "Initializing Hosting Sites & Targets..."
$ProjectID = "studio-5724711541-8a962"

# Attempt to create sites (Will skip if already exists)
firebase hosting:sites:create "$ProjectID-admin"
firebase hosting:sites:create "$ProjectID-owner"
firebase hosting:sites:create "$ProjectID-tenant"
firebase hosting:sites:create "$ProjectID-tech"

# Apply targets
firebase target:apply hosting admin-panel "$ProjectID-admin"
firebase target:apply hosting owner-portal "$ProjectID-owner"
firebase target:apply hosting tenant-portal "$ProjectID-tenant"
firebase target:apply hosting technician-portal "$ProjectID-tech"

# 2. Deploy Security Rules & Firestore Config
Write-Host "Step 2: Deploying Firestore Rules & Indexes..."
firebase deploy --only firestore:rules,firestore:indexes

# 3. Deploy Cloud Functions
Write-Host "Step 3: Deploying ROI Engine & Backend Backbone..."
cd "$Root\bin-group-super-app\functions"
# Reminder: Run 'npm install' manually if you haven't, due to sandbox-exec environment issues.
firebase deploy --only functions

# 4. Deploy Portal Webapps
Write-Host "Step 4: Building & Deploying Portals (This may take a few minutes)..."

# Admin Panel
Write-Host "Deploying Admin Dashboard..."
cd "$Root\admin-panel"
npm run build
firebase deploy --only hosting:admin-panel

# Owner Portal
Write-Host "Deploying Owner Portal..."
cd "$Root\owner-portal"
npm run build
firebase deploy --only hosting:owner-portal

# Tenant Portal
Write-Host "Deploying Tenant Portal..."
cd "$Root\tenant-portal"
npm run build
firebase deploy --only hosting:tenant-portal

# Technician Portal
Write-Host "Deploying Technician Portal..."
cd "$Root\technician-portal"
npm run build
firebase deploy --only hosting:technician-portal

cd $Root
Write-Host "✅ V2 PRODUCTION DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "Give the Owner Portal URL to your client to begin testing."
