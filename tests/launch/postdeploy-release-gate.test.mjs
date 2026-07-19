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
    GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
    GITHUB_RUN_ID: '123',
    AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,test-actor',
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
        source: 'protected-workflow-dispatch-attestation',
        repository: 'rashidpvt420-lang/bin-group-super-app',
        commitSha: SHA,
        ref: 'refs/heads/main',
        workflowRunId: '123',
        workflowRunAttempt: 1,
        actor: 'test-actor',
        evidenceReferences: ['https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/123'],
        activeIncidents: [],
        requiresRollback: false,
        rollbackReason: null,
        lastDeploymentFailed: false,
        lastDeploymentFailedAt: null,
        updatedAt: new Date().toISOString(),
        updatedBy: 'test-actor',
      },
      null,
      2,
    )}\n`,
  );
}

function writePilotIncident(root, overrides = {}) {
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  const completedAt = new Date(Date.now() - 60 * 60 * 1000);
  const startedAt = new Date(completedAt.getTime() - 25 * 60 * 60 * 1000);
  writeFileSync(
    path.join(root, 'launch_package/pilot-incident-report.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: 'passed',
        commitSha: SHA,
        projectId: PRODUCTION.projectId,
        pilotStartedAt: startedAt.toISOString(),
        pilotCompletedAt: completedAt.toISOString(),
        openP0: 0,
        openP1: 0,
        rollbackPlanVerified: true,
        monitoringVerified: true,
        incidentConfirmationVerified: true,
        rollbackConfirmationVerified: true,
        incidentReference: 'https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/456',
        rollbackReference: 'https://console.firebase.google.com/project/bin-group-57c60/overview',
        monitoringReference: 'https://console.cloud.google.com/monitoring?project=bin-group-57c60',
        approvedBy: 'rashidpvt420-lang',
        generatedAt: new Date().toISOString(),
        generatedByWorkflow: true,
        source: 'hard-public-launch-clearance-workflow',
        githubRepository: 'rashidpvt420-lang/bin-group-super-app',
        githubRef: 'refs/heads/main',
        githubRunId: '456',
        githubRunAttempt: '1',
        hardLaunchClaim: false,
        ...overrides,
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
  writeFileSync(
    path.join(root, 'launch_package/production-deployment.json'),
    `${JSON.stringify(doc, null, 2)}\n`,
  );
  return doc;
}

function makeReport(specs, passed = 2) {
  return {
    stats: { expected: passed, unexpected: 0, skipped: 0, flaky: 0, interrupted: 0 },
    suites: specs.map((file, index) => ({
      file,
      specs: index === 0
        ? Array.from({ length: passed }, (_, testIndex) => ({
            title: `t${testIndex}`,
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
    artifactHash: sha256File(path.join(root, relative)),
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

function withRoot(prefix, callback) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('postdeploy release gate', () => {
  it('fails when deployment metadata is missing', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /production-deployment\.json missing/i.test(failure)));
    assert.equal(result.hardLaunchClaim, false);
  }));

  it('fails when deployment metadata is not workflow-generated', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    writeDeployment(root, { source: 'hand-edited' });
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /workflow/i.test(failure)));
  }));

  it('fails failed Gate 11 smoke', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    writePilotIncident(root);
    const batchPath = path.join(root, 'launch_package/launch-evidence-batch.json');
    const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
    const gate = batch.records.find((record) => record.testName === 'gate11ProductionSmoke');
    gate.passed = 11;
    gate.failed = 1;
    writeFileSync(batchPath, `${JSON.stringify(batch)}\n`);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /Gate 11/i.test(failure)));
  }));

  it('fails on App Check 403 contamination', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    const batchPath = path.join(root, 'launch_package/launch-evidence-batch.json');
    const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
    const owner = batch.records.find((record) => record.testName === 'businessOwner');
    owner.proof = 'HTTP 403 permission-denied from Firestore';
    delete owner.appCheckClean;
    writeFileSync(batchPath, `${JSON.stringify(batch)}\n`);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /App Check/i.test(failure)));
  }));

  it('fails failed business workflows', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    const batchPath = path.join(root, 'launch_package/launch-evidence-batch.json');
    const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
    const business = batch.records.find((record) => record.testName === 'businessWorkflows');
    business.passed = 4;
    business.failed = 5;
    writeFileSync(batchPath, `${JSON.stringify(batch)}\n`);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /Business workflows/i.test(failure)));
  }));

  it('fails wrong artifact digest on deployment metadata', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    writeDeployment(root, { artifactDigest: `sha256:${'ff'.repeat(32)}` });
    const deployHash = sha256File(path.join(root, 'launch_package/production-deployment.json'));
    const batchPath = path.join(root, 'launch_package/launch-evidence-batch.json');
    const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
    for (const record of batch.records) {
      if (record.testName.startsWith('production')) record.artifactHash = deployHash;
    }
    writeFileSync(batchPath, `${JSON.stringify(batch)}\n`);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /digest/i.test(failure)));
  }));

  it('fails when a postdeploy validation marker is missing or false', () => withRoot('postdeploy-markers-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
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
      assert.ok(result.failures.some((failure) => failure.includes(key)), key);
    }
  }));

  it('fails when predeploy approval releaseId binding is missing', () => withRoot('postdeploy-release-', (root) => {
    writeIncidents(root);
    fullEvidence(root);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: false });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => /predeploy-approval/i.test(failure)));
  }));

  it('passes a valid complete release fixture without claiming hard launch', () => withRoot('postdeploy-', (root) => {
    writeIncidents(root);
    writeApproval(root);
    fullEvidence(root);
    writePilotIncident(root);
    const result = runPostdeployReleaseGate({ root, env: baseEnv(), writeStatus: true });
    assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
    assert.equal(result.hardLaunchClaim, false);
    assert.equal(result.status.publicReleaseCleared, true);
    assert.equal(result.status.hardLaunchClaim, false);
    assert.equal(result.status.releaseId, 'rel-test-1');
  }));
});
