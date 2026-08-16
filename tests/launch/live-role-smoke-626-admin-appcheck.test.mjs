import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assertProtectedProductionContext } from '../../scripts/resolve-admin-app-check-site-key.mjs';

const ensureSource = readFileSync(
  new URL('../../scripts/ensure-appcheck.mjs', import.meta.url),
  'utf8',
);

const liveEvidenceEnvironment = (overrides = {}) => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_WORKFLOW: 'Live Role Smoke Tests',
  GITHUB_JOB: 'live-evidence',
  DEPLOYMENT_ENVIRONMENT: 'production',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'b'.repeat(40),
  GCP_PROJECT_ID: 'bin-group-57c60',
  GITHUB_ENV: '/tmp/github-env',
  VITE_APP_CHECK_SITE_KEY: 'public_site_key_123456789012345678901',
  FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: '',
  ...overrides,
});

test('canonical Admin Enterprise resolver accepts only the protected Live Role evidence job', () => {
  assert.doesNotThrow(() => assertProtectedProductionContext(liveEvidenceEnvironment()));

  for (const overrides of [
    { GITHUB_JOB: 'scheduled-public-smoke' },
    { GITHUB_WORKFLOW: 'Live Role Smoke Lookalike' },
    { DEPLOYMENT_ENVIRONMENT: '' },
    { GITHUB_REF: 'refs/heads/feature' },
  ]) {
    assert.throws(
      () => assertProtectedProductionContext(liveEvidenceEnvironment(overrides)),
      /protected production context required/,
    );
  }
});

test('App Check guard resolves canonical Admin Enterprise config before downstream evidence', () => {
  const workflowGuard = ensureSource.indexOf(
    "process.env.GITHUB_WORKFLOW === 'Live Role Smoke Tests'",
  );
  const jobGuard = ensureSource.indexOf("process.env.GITHUB_JOB === 'live-evidence'");
  const resolverImport = ensureSource.indexOf('resolveAdminAppCheckSiteKey');
  const resolverCall = ensureSource.indexOf('await resolveAdminAppCheckSiteKey()', resolverImport);
  const successExit = ensureSource.lastIndexOf('process.exit(0)');

  assert.ok(workflowGuard >= 0, 'Live Role Smoke workflow must be explicitly guarded');
  assert.ok(jobGuard > workflowGuard, 'live-evidence job must be explicitly guarded');
  assert.ok(resolverImport > jobGuard, 'canonical resolver must be loaded only after protected guards');
  assert.ok(resolverCall > resolverImport && resolverCall < successExit,
    'canonical Admin Enterprise App Check resolution must occur before the guard exits successfully');
  assert.doesNotMatch(
    ensureSource,
    /REACT_APP_APP_CHECK_SITE_KEY\s*=\s*process\.env\.VITE_APP_CHECK_SITE_KEY/,
    'Admin Enterprise App Check must never fall back to the public site key',
  );
});
