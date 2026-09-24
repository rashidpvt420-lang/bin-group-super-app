# Retired historical local release helper.
# Production and release builds must run through the repository CI/protected workflows.
Write-Error "REFUSED: build-all.ps1 is retired because it ignored build failures and used machine-local paths. Use the repository CI/build scripts."
exit 1
