$ErrorActionPreference = "Stop"

$baseDir = "c:\Users\My-PC\Desktop\bin app"
$releaseDir = "$baseDir\releases"

Write-Host "Creating BIN Group OS Release package..."
if (Test-Path $releaseDir) {
    Remove-Item -Recurse -Force $releaseDir
}
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$portals = @(
    @{ Name = "tenant-portal"; BuildCmd = "npm run build"; OutDir = "dist" },
    @{ Name = "technician-portal"; BuildCmd = "npm run build"; OutDir = "dist" },
    @{ Name = "owner-portal"; BuildCmd = "npm run build"; OutDir = "dist" },
    @{ Name = "admin-panel"; BuildCmd = "npm run build"; OutDir = "build" },
    @{ Name = "broker-portal"; BuildCmd = "npm run build"; OutDir = "dist" }
)

foreach ($portal in $portals) {
    $portalDir = "$baseDir\$($portal.Name)"
    Write-Host "`n--- Building $($portal.Name) ---"
    
    Set-Location $portalDir
    Write-Host "Running $($portal.BuildCmd)..."
    try {
        cmd /c "$($portal.BuildCmd)"
    }
    catch {
        Write-Host "Warning: Build threw an error, continuing..." -ForegroundColor Yellow
    }
    
    $sourceBuild = "$portalDir\$($portal.OutDir)"
    $destBuild = "$releaseDir\$($portal.Name)"
    
    if (Test-Path $sourceBuild) {
        Write-Host "Copying build to release folder..."
        Copy-Item -Recurse -Force "$sourceBuild" "$destBuild"
    }
    else {
        Write-Host "Warning: Build directory not found for $($portal.Name)!" -ForegroundColor Red
    }
}

Write-Host "`n=================================="
Write-Host "All portals built successfully!"
Write-Host "Release package ready at: $releaseDir"
Write-Host "You can now upload these folders directly to your web host (e.g. Hostinger, GoDaddy, HostGator cPanel File Manager)."
Write-Host "=================================="

Set-Location $baseDir
