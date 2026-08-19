import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertProtectedProductionContext } from '../../scripts/resolve-admin-app-check-site-key.mjs';

const read = (path) => readFileSync(path, 'utf8');
const resolver = read('scripts/resolve-admin-app-check-site-key.mjs');
const ensureAppCheck = read('scripts/ensure-appcheck.mjs');
const adminWorkflow = read('.github/workflows/admin-production-evidence.yml');

const protectedEnv = (overrides = {}) => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_WORKFLOW: 'Admin Production Evidence',
  GITHUB_JOB: 'admin-operational-evidence',
  DEPLOYMENT_ENVIRONMENT: 'production',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  GCP_PROJECT_ID: 'bin-group-57c60',
  GITHUB_ENV: '/tmp/github-env',
  ...overrides,
});

test('Admin Production Evidence is an explicitly approved protected resolver context', () => {
  assert.doesNotThrow(() => assertProtectedProductionContext(protectedEnv()));
  assert.doesNotThrow(() => assertProtectedProductionContext(protectedEnv({
    GITHUB_WORKFLOW: 'Live Role Smoke Tests',
    GITHUB_JOB: 'live-evidence',
  })));
  assert.doesNotThrow(() => assertProtectedProductionContext(protectedEnv({
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'deploy-firebase-production-stack',
  })));

  for (const [label, overrides] of [
    ['wrong job', { GITHUB_JOB: 'scheduled-public-smoke' }],
    ['wrong branch', { GITHUB_REF: 'refs/heads/release-test' }],
    ['non-production', { DEPLOYMENT_ENVIRONMENT: 'staging' }],
    ['wrong project', { GCP_PROJECT_ID: 'other-project' }],
    ['invalid SHA', { GITHUB_SHA: 'not-a-sha' }],
    ['missing GitHub env file', { GITHUB_ENV: '' }],
  ]) {
    assert.throws(
      () => assertProtectedProductionContext(protectedEnv(overrides)),
      /protected production context required/,
      label,
    );
  }
});

test('resolver and App Check verifier retain explicit protected workflow/job allowlists', () => {
  assert.match(resolver, /Firebase Production Deploy', job: 'deploy-firebase-production-stack/);
  assert.match(resolver, /Live Role Smoke Tests', job: 'live-evidence/);
  assert.match(resolver, /Admin Production Evidence', job: 'admin-operational-evidence/);
  assert.match(resolver, /PROTECTED_WORKFLOW_JOBS\.some/);

  assert.match(ensureAppCheck, /process\.env\.DEPLOYMENT_ENVIRONMENT === 'production'/);
  assert.match(ensureAppCheck, /process\.env\.GITHUB_REF === 'refs\/heads\/main'/);
  assert.match(ensureAppCheck, /Live Role Smoke Tests'[\s\S]*live-evidence/);
  assert.match(ensureAppCheck, /Admin Production Evidence'[\s\S]*admin-operational-evidence/);
  assert.match(ensureAppCheck, /resolveAdminAppCheckSiteKey/);
});

test('Admin evidence supplies hosted Firebase verifier inputs before the operational suite', () => {
  for (const required of [
    'VITE_GOOGLE_MAPS_API_KEY:',
    'VITE_FIREBASE_API_KEY:',
    'VITE_FIREBASE_APP_ID:',
    'VITE_FIREBASE_MESSAGING_SENDER_ID:',
    'VITE_FIREBASE_VAPID_KEY:',
    "REACT_APP_ENABLE_FIREBASE_APPCHECK: 'true'",
    'REACT_APP_FIREBASE_API_KEY:',
    'REACT_APP_ADMIN_FIREBASE_APP_ID: 1:123413252227:web:285cb53bc26626d699f3b6',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID:',
    'DEPLOYMENT_ENVIRONMENT: production',
    'environment: production',
  ]) {
    assert.ok(adminWorkflow.includes(required), `missing Admin verifier environment: ${required}`);
  }

  const verifyIndex = adminWorkflow.indexOf('node scripts/verify-e2e-env.mjs');
  const appCheckIndex = adminWorkflow.indexOf('node scripts/ensure-appcheck.mjs');
  const evidenceIndex = adminWorkflow.indexOf('node scripts/run-critical-evidence.mjs --suite adminCredentialLogin');
  assert.ok(verifyIndex >= 0 && appCheckIndex > verifyIndex, 'App Check validation must follow E2E env validation');
  assert.ok(evidenceIndex > appCheckIndex, 'Admin evidence suite must run only after App Check resolution');
});
