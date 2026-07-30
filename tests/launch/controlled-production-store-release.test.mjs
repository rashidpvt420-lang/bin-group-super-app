import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/controlled-production-store-release.yml', 'utf8');
const compatibilityContract = readFileSync('scripts/apply-phase1-manual-public-launch-policy.mjs', 'utf8');
const runbook = readFileSync('docs/CONTROLLED_PRODUCTION_STORE_RELEASE.md', 'utf8');

test('controlled production store release is exact-SHA and deployment-evidence bound', () => {
  assert.match(workflow, /expected_commit_sha:/);
  assert.match(workflow, /production_deployment_run_id:/);
  assert.match(workflow, /RELEASE_CONTROLLED_PRODUCTION_TO_STORES/);
  assert.match(workflow, /production-deployment-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /\.status == "passed"/);
  assert.match(workflow, /bin-group-57c60/);
  assert.match(workflow, /\.hardLaunchClaim != true/);
  assert.match(workflow, /test:launch-honesty/);
  assert.match(workflow, /test:mobile-store-readiness/);
});

test('store release dispatches existing signed Android and iOS workflows', () => {
  assert.match(workflow, /android-store-release\.yml\/dispatches/);
  assert.match(workflow, /ios-app-store-release\.yml\/dispatches/);
  assert.match(workflow, /BUILD_SIGNED_ANDROID_AAB_BIN_GROUP/);
  assert.match(workflow, /BUILD_SIGNED_IOS_IPA_BIN_GROUP/);
  assert.match(workflow, /upload_to_testflight/);
});

test('store distribution remains separate from commercial public activation', () => {
  assert.match(runbook, /PRODUCTION_DISTRIBUTION_READY/);
  assert.match(runbook, /COMMERCIAL_PUBLIC_ACTIVATION_READY/);
  assert.match(runbook, /Stripe and Bank Transfer remain disabled/);
  assert.match(runbook, /friends, family and approved operational users/);
  assert.doesNotMatch(workflow, /hardLaunchClaim:\s*true/);
});

test('retired Phase 1 generator is non-mutating but preserves payment proof semantics', () => {
  assert.match(compatibilityContract, /intentionally performs no repository mutation/);
  assert.match(compatibilityContract, /const paymentProofOk = paymentPolicy === 'phase1-manual'/);
  assert.match(compatibilityContract, /paymentPolicy === 'phase2-stripe' && stripeLiveProof\?\.status === 'passed'/);
  assert.match(compatibilityContract, /launchMode === 'public' && postdeployCleared && paymentProofOk/);
  assert.match(compatibilityContract, /process\.exit\(1\)/);
});
