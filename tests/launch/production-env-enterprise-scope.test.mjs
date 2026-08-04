import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = fileURLToPath(
  new URL('../../scripts/write-production-env.mjs', import.meta.url),
);
const VALIDATION_ONLY_ENTERPRISE_SITE_KEY =
  'BIN_GROUP_VALIDATION_ONLY_ENTERPRISE_SITE_KEY';

const baseEnvironment = Object.freeze({
  VITE_APP_CHECK_SITE_KEY: 'public-app-check-site-key-for-test',
  VITE_FIREBASE_API_KEY: 'firebase-api-key-for-test',
  VITE_FIREBASE_APP_ID: '1:123413252227:web:publicapptest',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123413252227',
  VITE_FIREBASE_VAPID_KEY: 'vapid-key-for-test',
});

const runWriter = (overrides = {}) => {
  const workingDirectory = mkdtempSync(
    path.join(tmpdir(), 'bin-production-env-scope-'),
  );
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: workingDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...baseEnvironment,
      FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: '',
      GITHUB_ACTIONS: '',
      GITHUB_WORKFLOW: '',
      GITHUB_JOB: '',
      DEPLOYMENT_ENVIRONMENT: '',
      ...overrides,
    },
  });

  return {
    workingDirectory,
    result,
    cleanup: () => rmSync(workingDirectory, { recursive: true, force: true }),
  };
};

test('exact Firebase production validation job may compile with a non-deployable Enterprise placeholder', () => {
  const execution = runWriter({
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'validate-production-build',
  });

  try {
    assert.equal(execution.result.status, 0, execution.result.stderr);
    const adminEnvironment = readFileSync(
      path.join(execution.workingDirectory, 'apps/admin-panel/.env.production'),
      'utf8',
    );
    assert.match(
      adminEnvironment,
      new RegExp(`^REACT_APP_APP_CHECK_SITE_KEY=${VALIDATION_ONLY_ENTERPRISE_SITE_KEY}$`, 'm'),
    );
    assert.match(execution.result.stderr, /non-deployable Enterprise App Check placeholder/);
    assert.match(execution.result.stdout, /validation-only environment files created/);
  } finally {
    execution.cleanup();
  }
});

test('production deployment context still fails closed without the protected Enterprise key', () => {
  const execution = runWriter({
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'deploy-firebase-production-stack',
    DEPLOYMENT_ENVIRONMENT: 'production',
  });

  try {
    assert.notEqual(execution.result.status, 0);
    assert.match(
      `${execution.result.stdout}\n${execution.result.stderr}`,
      /missing or malformed values: FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY/,
    );
  } finally {
    execution.cleanup();
  }
});

test('production deployment writes only the supplied protected Enterprise key', () => {
  const protectedEnterpriseKey = 'enterprise-site-key-from-protected-environment';
  const execution = runWriter({
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'deploy-firebase-production-stack',
    DEPLOYMENT_ENVIRONMENT: 'production',
    FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: protectedEnterpriseKey,
  });

  try {
    assert.equal(execution.result.status, 0, execution.result.stderr);
    const adminEnvironment = readFileSync(
      path.join(execution.workingDirectory, 'apps/admin-panel/.env.production'),
      'utf8',
    );
    assert.match(
      adminEnvironment,
      new RegExp(`^REACT_APP_APP_CHECK_SITE_KEY=${protectedEnterpriseKey}$`, 'm'),
    );
    assert.doesNotMatch(adminEnvironment, new RegExp(VALIDATION_ONLY_ENTERPRISE_SITE_KEY));
    assert.match(execution.result.stdout, /production environment files created/);
  } finally {
    execution.cleanup();
  }
});

test('a lookalike workflow or job cannot activate the validation-only exception', () => {
  for (const overrides of [
    {
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Firebase Production Deploy',
      GITHUB_JOB: 'validate-production-build-copy',
    },
    {
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Untrusted Deploy',
      GITHUB_JOB: 'validate-production-build',
    },
    {
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Firebase Production Deploy',
      GITHUB_JOB: 'validate-production-build',
      DEPLOYMENT_ENVIRONMENT: 'production',
    },
  ]) {
    const execution = runWriter(overrides);
    try {
      assert.notEqual(execution.result.status, 0);
      assert.match(
        `${execution.result.stdout}\n${execution.result.stderr}`,
        /FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY/,
      );
    } finally {
      execution.cleanup();
    }
  }
});
