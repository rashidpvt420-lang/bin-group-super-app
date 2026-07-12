import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runPostdeployReleaseGate } from '../../scripts/postdeploy-release-gate.mjs';
import { PRODUCTION, sha256File } from '../../scripts/lib/launch-honesty.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DIGEST = `sha256:${'ab'.repeat(32)}`;

function baseEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    DEPLOYMENT_ENVIRONMENT: 'production',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: SHA,
    VALIDATED_ARTIFACT_DIGEST: DIGEST,
    LAUNCH_MODE: 'bank-pilot',
    POSTDEPLOY_ROUTES_OK: 'true',
    POSTDEPLOY_SMTP_OK: 'true',
    POSTDEPLOY_APPCHECK_OK: 'true',
    POSTDEPLOY_SMOKE_OK: 'true',
    POSTDEPLOY_BUSINESS_OK: 'true',
    POSTDEPLOY_AUDIT_OK: 'true',
    ...overrides,
  };
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

function writeIncidents(root) {
  mkdirSync(path.join(root, 'launch_package', 'artifacts'), { recursive: true });
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
        updatedAt: new Date().toISOString(),
        updatedBy: 'operations',
      },
      null,
      2,
    )}\n`,
  );
}

function writeDeployment(root, overrides = {}) {
  const now = new Date().toISOString();
  const doc = {
    status: 'passed',
    projectId: PRODUCTION.projectId,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
    deployedCommitSha: SHA,
    deployedAt: now,
    verifiedAt: now,
    httpChecksOk: true,
    bundleVerified: true,
    hardLaunchClaim: false,
    workflowRunId: '123',
    workflowRunAttempt: 1,
    workflowRef: 'refs/heads/main',
    repository: 'rashidpvt420-lang/bin-group-super-app',
    successfulComponents: ['hosting', 'firestoreRules', 'firestoreIndexes', 'storageRules', 'functions'],
    source: 'firebase-production-deploy-workflow',
    artifactDigest: DIGEST,
    ...overrides,
  };
  writeFileSync(path.join(root, 'launch_package/production-deployment.json'), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

function makeReport(specs, passed = 2) {
  return {
    stats: { expected: passed, unexpected: 0, skipped: 0, flaky: 0, interrupted: 0 },
    suites: specs.map((file, idx) => ({
      file,
      specs:
        idx === 0
          ? Array.from({ length: passed }, (_, i) => ({
              title: `t${i}`,
              file,
              tests: [{ status: 'passed', results: [{ status: 'passed' }] }],
            }))
          : [{ title: 'anchor', file, tests: [] }],
    })),
  };
}

function installPlaywrightRecord(root, key, specs, passed = 2) {
  const report = makeReport(specs, passed);
  const relative = `launch_package/artifacts/${key}.json`;
  writeFileSync(path.join(root, relative), `${JSON.stringify(report)}\n`);
  const hash = sha256File(path.join(root, relative));
  const now = new Date().toISOString();
  return {
    testName: key,
    suiteName: key,
    source: 'run-critical-evidence',
    executionGenerated: true,
    exitCode: 0,
    commitSha: SHA,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
    startedAt: now,
    finishedAt: now,
    passed,
    failed: 0,
    skipped: 0,
    artifactPath: relative,
    artifactHash: hash,
    expectedSpecs: specs,
    appCheckClean: true,
    hardLaunchClaim: false,
  };
}

function fullEvidence(root) {
  const suiteMap = {
    adminCredentialLogin: ['tests/e2e/business-admin.spec.ts'],
    businessOwner: ['tests/e2e/business-owner.spec.ts'],
    businessTenant: ['tests/e2e/business-tenant.spec.ts'],
    businessTechnician: ['tests/e2e/business-technician.spec.ts'],
    businessBroker: ['tests/e2e/business-broker.spec.ts'],
    businessGlobal: ['tests/e2e/business-global.spec.ts'],
    launchAuditLive: [
      'tests/e2e/launch-audit-public-routes.spec.ts',
      'tests/e2e/launch-audit-admin.spec.ts',
      'tests/e2e/launch-audit-owner.spec.ts',
      'tests/e2e/launch-audit-tenant.spec.ts',
      'tests/e2e/launch-audit-technician.spec.ts',
      'tests/e2e/launch-audit-broker.spec.ts',
      'tests/e2e/hard-launch-routes.spec.ts',
    ],
    appCheckAuthenticatedAccess: ['tests/e2e/business-owner.spec.ts'],
  };
  const records = Object.entries(suiteMap).map(([key, specs]) =>
    installPlaywrightRecord(root, key, specs, 2),
  );

  const deploy = writeDeployment(root);
  const deployHash = sha256File(path.join(root, 'launch_package/production-deployment.json'));
  const now = new Date().toISOString();
  for (const key of ['productionMainHosting', 'productionAdminHosting']) {
    records.push({
      testName: key,
      suiteName: 'production-deployment',
      source: 'run-critical-evidence',
      executionGenerated: true,
      exitCode: 0,
      commitSha: SHA,
      mainUrl: PRODUCTION.mainUrl,
      adminUrl: PRODUCTION.adminUrl,
      startedAt: now,
      finishedAt: now,
      passed: 1,
      failed: 0,
      skipped: 0,
      artifactPath: 'launch_package/production-deployment.json',
      artifactHash: deployHash,
      deploymentStatus: 'passed',
      projectId: PRODUCTION.projectId,
      deployedCommitSha: SHA,
      httpChecksOk: true,
      bundleVerified: true,
      hardLaunchClaim: false,
    });
  }

  records.push({
    testName: 'gate11ProductionSmoke',
    suiteName: 'gate11',
    source: 'gate11',
    executionGenerated: true,
    exitCode: 0,
    commitSha: SHA,
    mainUrl: PRODUCTION.mainUrl,
    adminUrl: PRODUCTION.adminUrl,
    startedAt: now,
    finishedAt: now,
    passed: 12,
    failed: 0,
    skipped: 0,
    artifactHash: createHash('sha256').update('gate11').digest('hex'),
    appCheckClean: true,
    hardLaunchClaim: false,
  });
  records.push({
    testName: 'businessWorkflows',
    suiteName: 'business',
    source: 'business',
    executionGenerated: true,
    exitCode: 0,
    commitSha: SHA,
    mainUrl: PRODUCTION.mainUrl,
    startedAt: now,
    finishedAt: now,
    passed: 9,
    failed: 0,
    skipped: 0,
    artifactHash: createHash('sha256').update('business').digest('hex'),
    appCheckClean: true,
    hardLaunchClaim: false,
  });
  records.push({
    testName: 'pilot_no_p0_p1',
    suiteName: 'pilot',
    source: 'pilot',
    executionGenerated: true,
    exitCode: 0,
    commitSha: SHA,
    startedAt: now,
    finishedAt: now,
    passed: 1,
    failed: 0,
    skipped: 0,
    artifactHash: createHash('sha256').update('pilot').digest('hex'),
    hardLaunchClaim: false,
  });

  writeFileSync(
    path.join(root, 'launch_package/launch-evidence-batch.json'),
    `${JSON.stringify({ records }, null, 2)}\n`,
  );
  return { records, deploy };
}

describe('postdeploy release gate', () => {
  it('fails when deployment metadata is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /production-deployment\.json missing/i.test(f)));
      assert.equal(result.hardLaunchClaim, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when deployment metadata is not workflow-generated', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    writeApproval(root);
    writeDeployment(root, { source: 'hand-edited' });
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /workflow/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails failed Gate 11 smoke', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    const batch = JSON.parse(
      readFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), 'utf8'),
    );
    const gate = batch.records.find((r) => r.testName === 'gate11ProductionSmoke');
    gate.passed = 11;
    gate.failed = 1;
    writeFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), `${JSON.stringify(batch)}\n`);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /Gate 11/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on App Check 403 contamination', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    const batch = JSON.parse(
      readFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), 'utf8'),
    );
    const owner = batch.records.find((r) => r.testName === 'businessOwner');
    owner.proof = 'HTTP 403 permission-denied from Firestore';
    delete owner.appCheckClean;
    writeFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), `${JSON.stringify(batch)}\n`);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /App Check/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails failed business workflows', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    const batch = JSON.parse(
      readFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), 'utf8'),
    );
    const biz = batch.records.find((r) => r.testName === 'businessWorkflows');
    biz.passed = 4;
    biz.failed = 5;
    writeFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), `${JSON.stringify(batch)}\n`);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /Business workflows/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails wrong artifact digest on deployment metadata', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    writeDeployment(root, { artifactDigest: `sha256:${'ff'.repeat(32)}` });
    // rewrite evidence deploy hash to match new file so only digest mismatch is tested via env compare
    const deployHash = sha256File(path.join(root, 'launch_package/production-deployment.json'));
    const batch = JSON.parse(
      readFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), 'utf8'),
    );
    for (const r of batch.records) {
      if (r.testName.startsWith('production')) r.artifactHash = deployHash;
    }
    writeFileSync(path.join(root, 'launch_package/launch-evidence-batch.json'), `${JSON.stringify(batch)}\n`);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /digest/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a postdeploy validation marker is missing or false', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-markers-'));
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    try {
      for (const key of [
        'POSTDEPLOY_ROUTES_OK',
        'POSTDEPLOY_SMTP_OK',
        'POSTDEPLOY_APPCHECK_OK',
        'POSTDEPLOY_SMOKE_OK',
        'POSTDEPLOY_BUSINESS_OK',
        'POSTDEPLOY_AUDIT_OK',
      ]) {
        const result = runPostdeployReleaseGate({
          root,
          env: baseEnv({ [key]: 'false' }),
          writeStatus: false,
        });
        assert.equal(result.ok, false, key);
        assert.ok(result.failures.some((f) => f.includes(key)), key);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when predeploy approval releaseId binding is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-release-'));
    writeIncidents(root);
    fullEvidence(root);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
      assert.equal(result.ok, false);
      assert.ok(result.failures.some((f) => /predeploy-approval/i.test(f)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes a valid complete release fixture without claiming hard launch', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'postdeploy-'));
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    try {
      const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: true });
      assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
      assert.equal(result.hardLaunchClaim, false);
      assert.equal(result.status.publicReleaseCleared, true);
      assert.equal(result.status.hardLaunchClaim, false);
      assert.equal(result.status.releaseId, 'rel-test-1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
