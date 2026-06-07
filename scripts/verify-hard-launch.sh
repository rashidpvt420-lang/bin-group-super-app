#!/usr/bin/env bash
# BIN GROUP Hard-Launch Clearance Verification
# This script fails when a required launch gate fails.

set -Eeuo pipefail

PROJECT_ID="bin-group-57c60"
REPORT_DIR="artifacts/hard-launch-clearance"
REPORT_FILE="$REPORT_DIR/verification-$(date +%Y%m%d-%H%M%S).log"
FAILED_STEPS=()

mkdir -p "$REPORT_DIR"

run_required() {
  local name="$1"
  shift
  echo ""
  echo "=== REQUIRED: $name ==="
  echo "+ $*"
  if "$@"; then
    echo "PASS: $name"
  else
    local code=$?
    echo "FAIL: $name (exit $code)"
    FAILED_STEPS+=("$name")
  fi
}

run_optional_script() {
  local name="$1"
  echo ""
  echo "=== OPTIONAL: npm run $name ==="
  if npm run | grep -E "^[[:space:]]+${name}($|[[:space:]])" >/dev/null 2>&1; then
    npm run "$name" || echo "WARN: optional script failed: $name"
  else
    echo "WARN: optional script not found: $name"
  fi
}

run_required_script() {
  local name="$1"
  echo ""
  echo "=== REQUIRED SCRIPT: npm run $name ==="
  if npm run | grep -E "^[[:space:]]+${name}($|[[:space:]])" >/dev/null 2>&1; then
    if npm run "$name"; then
      echo "PASS: npm run $name"
    else
      local code=$?
      echo "FAIL: npm run $name (exit $code)"
      FAILED_STEPS+=("npm run $name")
    fi
  else
    echo "FAIL: required npm script missing: $name"
    FAILED_STEPS+=("missing npm script $name")
  fi
}

{
  echo "=== BIN GROUP HARD-LAUNCH CLEARANCE VERIFICATION ==="
  echo "Firebase project: $PROJECT_ID"
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Node: $(node --version 2>/dev/null || echo missing)"
  echo "npm: $(npm --version 2>/dev/null || echo missing)"
  echo "Firebase CLI: $(firebase --version 2>/dev/null || echo missing)"
  echo "Git branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

  run_required "dependencies install" npm install --legacy-peer-deps
  run_required "TypeScript compile" npx tsc --noEmit
  run_required "production build" npm run build
  run_required_script "lint"
  run_required_script "normalize:rules"

  echo ""
  echo "=== REQUIRED: Firebase security rules emulator tests ==="
  if firebase emulators:exec --only firestore --project "$PROJECT_ID" "node --test test/security-rules.test.js"; then
    echo "PASS: Firebase security rules emulator tests"
  else
    code=$?
    echo "FAIL: Firebase security rules emulator tests (exit $code)"
    FAILED_STEPS+=("Firebase security rules emulator tests")
  fi

  run_required_script "test:repo-hygiene"
  run_required_script "test:stability"
  run_optional_script "test:launch-clearance"
  run_optional_script "test:e2e"
  run_optional_script "test:playwright"

  echo ""
  echo "=== RESULT SUMMARY ==="
  if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
    echo "HARD-LAUNCH VERIFICATION: PASS"
  else
    echo "HARD-LAUNCH VERIFICATION: FAIL"
    printf '%s\n' "${FAILED_STEPS[@]}" | sed 's/^/- /'
  fi
} | tee "$REPORT_FILE"

if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
  exit 0
fi
exit 1
