import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const firebaseDeploy = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const liveSmoke = readFileSync('.github/workflows/live-role-smoke.yml', 'utf8');
const privilegedReview = readFileSync('.github/workflows/privileged-account-review-request.yml', 'utf8');
const privilegedCleanup = readFileSync('.github/workflows/owner-privileged-cleanup-command.yml', 'utf8');
const diagnostics = readFileSync('.github/workflows/firebase-production-failure-diagnostics.yml', 'utf8');

test('live evidence consumers are protected by hard-public-launch', () => {
  assert.match(liveSmoke, /live-evidence:[\s\S]*environment: hard-public-launch/);
  assert.match(firebaseDeploy, /deploy-firebase-production-stack:[\s\S]*environment: hard-public-launch/);
  assert.match(firebaseDeploy, /public-release-clearance:[\s\S]*environment: hard-public-launch/);
});

test('reviewed workflow YAML fixes remain in the corrected structure', () => {
  assert.match(privilegedReview, /\r?\n      - name: Reject unauthorized request visibly\r?\n        if: steps\.authorize\.outputs\.request_kind == 'invalid'\r?\n        shell: bash/);
  assert.match(privilegedReview, /\r?\n  export_play_certificate:\r?\n    name: Export public Android upload certificate\r?\n    needs: announce_play_certificate\r?\n    if: needs\.announce_play_certificate\.result == 'success'\r?\n    runs-on: ubuntu-latest/);
  assert.match(privilegedCleanup, /\r?\n      - name: Enforce destructive execution eligibility\r?\n        if: github\.event\.comment\.body == '\/bin-launch execute-privileged-cleanup'\r?\n        env:/);
  assert.match(privilegedCleanup, /\r?\n      - name: Execute and verify exact-SHA privileged cleanup\r?\n        if: github\.event\.comment\.body == '\/bin-launch execute-privileged-cleanup'\r?\n        id: cleanup/);
  assert.match(diagnostics, /uses: actions\/upload-artifact@v4/);
  assert.doesNotMatch(diagnostics, /actions\/upload-artifact@v7/);
});

test('generated .env.e2e files do not persist protected secrets or OTP mailbox values', () => {
  const envWriteBlock = firebaseDeploy.match(/run: \|\r?\n          set -euo pipefail[\s\S]*?node scripts\/verify-e2e-env\.mjs/)?.[0] || '';
  assert.match(envWriteBlock, /: > \.env\.e2e/);
  for (const forbidden of [
    'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
    'FIREBASE_APPCHECK_DEBUG_TOKEN',
    'VITE_FIREBASE_API_KEY',
    'E2E_ADMIN_PASSWORD',
    'E2E_OWNER_EMAIL',
    'E2E_OWNER_MAILBOX_EMAIL',
    'E2E_OWNER_MAILBOX_SENTINEL_MESSAGE_ID',
    'E2E_OWNER_PASSWORD',
    'E2E_BROKER_EMAIL',
    'E2E_BROKER_MAILBOX_EMAIL',
    'E2E_BROKER_MAILBOX_SENTINEL_MESSAGE_ID',
    'E2E_BROKER_PASSWORD',
  ]) {
    assert.doesNotMatch(envWriteBlock, new RegExp(`printf '${forbidden}=`), `${forbidden} must not be written to .env.e2e`);
  }
});

test('mailbox OAuth secrets are consumed only by the protected live-evidence step env', () => {
  const liveEvidenceJob = liveSmoke.match(/  live-evidence:[\s\S]*?  hard-public-launch-clearance:/)?.[0] || '';
  const topLevelEnv = liveSmoke.match(/\r?\nenv:\r?\n[\s\S]*?\r?\njobs:/)?.[0] || '';
  assert.match(liveEvidenceJob, /environment: hard-public-launch/);
  assert.match(liveEvidenceJob, /- name: Run every required live evidence suite[\s\S]*E2E_OWNER_MAILBOX_CLIENT_ID: \$\{\{ secrets\.E2E_OWNER_MAILBOX_CLIENT_ID \}\}/);
  assert.doesNotMatch(topLevelEnv, /E2E_OWNER_MAILBOX_CLIENT_ID: \$\{\{ secrets\./);
  assert.doesNotMatch(topLevelEnv, /E2E_BROKER_MAILBOX_REFRESH_TOKEN: \$\{\{ secrets\./);
});
