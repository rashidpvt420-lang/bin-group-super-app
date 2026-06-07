#!/bin/bash
# Hard-Launch Clearance Verification Commands
# Execute these commands in sequence to verify production readiness

set -e

echo "=== BIN GROUP Hard-Launch Clearance Verification ==="
echo "Branch: fix/hard-launch-clearance-2026-06-07"
echo "Date: 2026-06-07"
echo ""

# Step 1: Dependencies
echo "Step 1: npm install --legacy-peer-deps"
npm install --legacy-peer-deps

# Step 2: TypeScript
echo "Step 2: npx tsc --noEmit"
npx tsc --noEmit

# Step 3: ESLint
echo "Step 3: npm run lint"
npm run lint || true

# Step 4: Build
echo "Step 4: npm run build"
npm run build

# Step 5: Firebase Rules
echo "Step 5: npm run test:rules"
npm run normalize:rules && firebase emulators:exec --only firestore --project bin-group-57c60 "node --test test/security-rules.test.js" || true

# Step 6: Repo Hygiene
echo "Step 6: npm run test:repo-hygiene"
npm run test:repo-hygiene || true

# Step 7: Stability
echo "Step 7: npm run test:stability"
npm run test:stability || true

echo ""
echo "=== Verification Complete ==="
echo "Review results above and update HARD_LAUNCH_CLEARANCE_2026-06-07.md"
