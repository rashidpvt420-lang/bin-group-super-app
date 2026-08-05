import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertProtectedProductionContext,
  extractEnterpriseSiteKey,
  resolveAdminAppCheckSiteKey,
} from '../../scripts/resolve-admin-app-check-site-key.mjs';

const CONFIG_NAME =
  'projects/123413252227/apps/1:123413252227:web:285cb53bc26626d699f3b6/recaptchaEnterpriseConfig';
const ENTERPRISE_SITE_KEY = 'enterprise_admin_site_key_123456789012345';
const PUBLIC_SITE_KEY = 'public_site_key_123456789012345678901';

const productionEnvironment = (githubEnvironmentPath, overrides = {}) => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_WORKFLOW: 'Firebase Production Deploy',
  GITHUB_JOB: 'deploy-firebase-production-stack',
  DEPLOYMENT_ENVIRONMENT: 'production',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  GCP_PROJECT_ID: 'bin-group-57c60',
  GITHUB_ENV: githubEnvironmentPath,
  VITE_APP_CHECK_SITE_KEY: PUBLIC_SITE_KEY,
  FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: '',
  ...overrides,
});

test('resolver accepts only the exact protected production context', () => {
  const valid = productionEnvironment('/tmp/github-env');
  assert.doesNotThrow(() => assertProtectedProductionContext(valid));

  for (const overrides of [
    { GITHUB_WORKFLOW: 'Lookalike Deploy' },
    { GITHUB_JOB: 'validate-production-build' },
    { DEPLOYMENT_ENVIRONMENT: '' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_SHA: 'short' },
    { GCP_PROJECT_ID: 'wrong-project' },
  ]) {
    assert.throws(
      () => assertProtectedProductionContext(productionEnvironment('/tmp/github-env', overrides)),
      /protected production context required/,
    );
  }
});

test('resolver rejects a config for another Firebase app or a public-key collision', () => {
  assert.throws(
    () => extractEnterpriseSiteKey({ name: `${CONFIG_NAME}-other`, siteKey: ENTERPRISE_SITE_KEY }),
    /wrong app/,
  );
  assert.throws(
    () => extractEnterpriseSiteKey({ name: CONFIG_NAME, siteKey: PUBLIC_SITE_KEY }, PUBLIC_SITE_KEY),
    /must remain isolated/,
  );
});

test('authenticated Firebase config resolution exports both downstream names without logging the key', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-app-check-config-'));
  const githubEnvironmentPath = path.join(directory, 'github-env');
  let request;
  const originalLog = console.log;
  const logs = [];
  console.log = (message) => logs.push(String(message));

  try {
    const result = await resolveAdminAppCheckSiteKey({
      env: productionEnvironment(githubEnvironmentPath),
      requestConfig: async (details) => {
        request = details;
        return { name: CONFIG_NAME, siteKey: ENTERPRISE_SITE_KEY };
      },
    });

    assert.equal(result.source, 'firebase-app-check-api');
    assert.equal(request.configName, CONFIG_NAME);
    assert.equal(
      request.url,
      `https://firebaseappcheck.googleapis.com/v1/${CONFIG_NAME}`,
    );
    const exported = readFileSync(githubEnvironmentPath, 'utf8');
    assert.match(exported, new RegExp(`^FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY=${ENTERPRISE_SITE_KEY}$`, 'm'));
    assert.match(exported, new RegExp(`^REACT_APP_APP_CHECK_SITE_KEY=${ENTERPRISE_SITE_KEY}$`, 'm'));
    assert.equal(logs.some((entry) => entry.includes(ENTERPRISE_SITE_KEY)), false);
  } finally {
    console.log = originalLog;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('configured protected value bypasses the API and remains validated', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-app-check-secret-'));
  const githubEnvironmentPath = path.join(directory, 'github-env');
  let requested = false;
  try {
    const result = await resolveAdminAppCheckSiteKey({
      env: productionEnvironment(githubEnvironmentPath, {
        FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: ENTERPRISE_SITE_KEY,
      }),
      requestConfig: async () => {
        requested = true;
        throw new Error('must not request');
      },
    });
    assert.equal(result.source, 'protected-environment');
    assert.equal(requested, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
