import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPredeployApprovalGate } from '../../scripts/predeploy-approval-gate.mjs';
import { validateRecentTimestamp } from '../../scripts/lib/launch-gate-common.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DIGEST = `sha256:${'ab'.repeat(32)}`;

function baseEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    DEPLOYMENT_ENVIRONMENT: 'production',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: SHA,
    VALIDATED_ARTIFACT_DIGEST: DIGEST,
    AUTHORIZED_FOUNDER_EMAILS: 'rashid@bin-groups.com',
    LAUNCH_MODE: 'bank-pilot',
    LAUNCH_BANK_ONLY: '1',
    PREDEPLOY_BUILD_OK: 'true',
    PREDEPLOY_ADMIN_BUILD_OK: 'true',
    PREDEPLOY_FUNCTIONS_BUILD_OK: 'true',
    PREDEPLOY_RULES_OK: 'true',
    PREDEPLOY_FUNCTIONS_LOAD_OK: 'true',
    ...overrides,
  };
}

function writeIncidents(root, overrides = {}) {
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  writeFileSync(
    path.join(root, 'launch_package/production-incidents.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        activeIncidents: [],
        requiresRollback: false,
        rollbackReason: null,
        lastDeploymentFailed: false,
        lastDeploymentFailedAt: null,
        lastSuccessfulDeployment: null,
        lastSuccessfulCommitSha: null,
        updatedAt: new Date().toISOString(),
        updatedBy: 'operations',
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
}

function writeApproval(root, overrides = {}) {
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  writeFileSync(
    path.join(root, 'launch_package/predeploy-approval.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        commitSha: SHA,
        artifactDigest: DIGEST,
        releaseId: 'rel-test-1',
        approvedAt: new Date().toISOString(),
        approvedBy: 'rashid@bin-groups.com',
        approvedVia: 'github-environment-protection',
        githubEnvironment: 'production',
        launchMode: 'bank-pilot',
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
}

function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'predeploy-'));
  writeIncidents(root);
  writeApproval(root);
  return root;
}

describe('predeploy approval gate', () => {
  it('fails when production-incidents.json is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'predeploy-missing-inc-'));
    mkdirSync(path.join(root, 'launch_package'), { recursive: true });
    writeApproval(root);
    try {
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /Missing production-incidents/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on malformed approval JSON', () => {
    const root = freshRoot();
    try {
      writeFileSync(path.join(root, 'launch_package/predeploy-approval.json'), '{not-json');
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /malformed JSON/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects future timestamps', () => {
    const failures = [];
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    validateRecentTimestamp(future, 1000 * 60 * 60, 'approval.approvedAt', failures);
    assert.ok(failures.some((f) => /future/i.test(f)));
  });

  it('rejects stale timestamps', () => {
    const root = freshRoot();
    try {
      writeApproval(root, {
        approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /stale/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when authorized founder configuration is missing', () => {
    const root = freshRoot();
    try {
      const result = runPredeployApprovalGate({
        root,
        env: baseEnv({ AUTHORIZED_FOUNDER_EMAILS: '' }),
      });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /AUTHORIZED_FOUNDER_EMAILS/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects fake signature-based founder authorization', () => {
    const root = freshRoot();
    try {
      writeApproval(root, { signature: 'deadbeef-ca11-ab1e-f00d-c0ffeebaabe1' });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /signature/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects wrong commit SHA binding', () => {
    const root = freshRoot();
    try {
      writeApproval(root, { commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /commitSha/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects wrong artifact digest binding', () => {
    const root = freshRoot();
    try {
      writeApproval(root, { artifactDigest: `sha256:${'cd'.repeat(32)}` });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /artifactDigest/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on active P0/P1 incident', () => {
    const root = freshRoot();
    try {
      writeIncidents(root, {
        activeIncidents: [{ id: 'INC-1', severity: 'p0', status: 'open' }],
      });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /Active P0\/P1/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on rollback hold', () => {
    const root = freshRoot();
    try {
      writeIncidents(root, { requiresRollback: true, rollbackReason: 'bad deploy' });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /Rollback hold/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a predeploy build marker is missing or false', () => {
    const root = freshRoot();
    try {
      for (const key of [
        'PREDEPLOY_BUILD_OK',
        'PREDEPLOY_ADMIN_BUILD_OK',
        'PREDEPLOY_FUNCTIONS_BUILD_OK',
        'PREDEPLOY_RULES_OK',
        'PREDEPLOY_FUNCTIONS_LOAD_OK',
      ]) {
        const result = runPredeployApprovalGate({
          root,
          env: baseEnv({ [key]: 'false' }),
        });
        assert.equal(result.ok, false, key);
        assert.ok(result.failures.some((f) => f.includes(key)), key);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not require production-deployment.json', () => {
    const root = freshRoot();
    try {
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
      assert.equal(result.hardLaunchClaim, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid lastDeploymentFailedAt when last deployment failed', () => {
    const root = freshRoot();
    try {
      writeIncidents(root, {
        lastDeploymentFailed: true,
        lastDeploymentFailedAt: null,
      });
      const result = runPredeployApprovalGate({ root, env: baseEnv() });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /lastDeploymentFailedAt/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
