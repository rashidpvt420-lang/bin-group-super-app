# Phase K — bank-only pilot launch gates
# Run from repo root with production .env.e2e and Firebase Admin credentials.

$env:LAUNCH_BANK_ONLY = '1'
npm run launch:fix-all 2>&1 | Tee-Object -FilePath launch_package/final-hard-launch/logs/launch-fix-all-bank-only.log
npm run launch:blockers 2>&1 | Tee-Object -FilePath launch_package/final-hard-launch/logs/launch-blockers-bank-only.log
npm run launch:status 2>&1 | Tee-Object -FilePath launch_package/final-hard-launch/logs/launch-status-bank-only.log

# Only if launch:status exits 0 and pilot GO:
# npm run launch:pilot:start
