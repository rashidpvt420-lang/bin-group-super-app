#!/usr/bin/env node
/**
 * Semantic regressions for firebase-production-deploy.yml coherence.
 * Asserts producer/consumer ordering, deploy invocation, and fail-closed bindings —
 * not fragile step-id-only checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/firebase-production-deploy.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const producerScript = path.join(root, 'scripts/create-production-incidents-attestation.mjs');
const verifierScript = path.join(root, 'scripts/verify-same-run-deployment-artifact.mjs');
const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');

function lineOf(snippet) {
  const idx = workflow.indexOf(snippet);
  assert.ok(idx >= 0, `workflow missing expected snippet: ${snippet}`);
  return workflow.slice(0, idx).split(/\r?\n/).length;
}

function runIncidentsProducer(env) {
  const directory = mkdtempSync(path.join(tmpdir(), 'incidents-producer-'));
  const result = spawnSync(process.execPath, [producerScript], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
  return { directory, result };
}

const baseProducerEnv = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '991122',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_ACTOR: 'founder-actor',
  GITHUB_WORKFLOW: 'Firebase Production Deploy',
  AUTHORIZED_FOUNDER_ACTORS: 'founder-actor,backup-founder',
  INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
  INCIDENT_ACTIVE_JSON: '[]',
  INCIDENT_REQUIRES_ROLLBACK: 'false',
  INCIDENT_ROLLBACK_REASON: '',
  INCIDENT_LAST_DEPLOYMENT_FAILED: 'false',
  INCIDENT_LAST_DEPLOYMENT_FAILED_AT: '',
  INCIDENT_EVIDENCE_REFS: 'ops://ticket/INC-REVIEW-1,https://example.invalid/evidence/1',
};

test('incident artifact producer precedes every consumer in the workflow', () => {
  const producer = lineOf('Create production incidents artifact from protected workflow attestation');
  const hmacPredeploy = lineOf('Enforce signed predeploy authorization');
  const splitPredeploy = lineOf('Predeploy approval gate');
  const postdeploy = lineOf('Postdeploy release gate');
  assert.ok(producer < hmacPredeploy, 'incidents must be produced before HMAC predeploy');
  assert.ok(producer < splitPredeploy, 'incidents must be produced before split predeploy gate');
  assert.ok(producer < postdeploy, 'incidents must be produced before postdeploy (same workflow)');
  assert.match(workflow, /create-production-incidents-attestation\.mjs/);
  const producerBlock = workflow.slice(
    workflow.indexOf(
      '      - name: Create production incidents artifact from protected workflow attestation',
    ),
    workflow.indexOf('      - name: Create signed founder authorization'),
  );
  assert.match(
    producerBlock,
    /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{\s*secrets\.AUTHORIZED_FOUNDER_ACTORS\s*\}\}/,
  );
});

test('missing incident source fails closed', () => {
  const { directory, result } = runIncidentsProducer({
    ...baseProducerEnv,
    INCIDENT_ATTESTATION: '',
  });
  try {
    assert.notEqual(result.status, 0);
    assert.match(String(result.stderr || ''), /INCIDENT_ATTESTATION is required/i);
    assert.equal(existsSync(path.join(directory, 'launch_package/production-incidents.json')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed and incomplete incident attestations fail closed', () => {
  const cases = [
    {
      override: { GITHUB_ACTIONS: 'false' },
      match: /GITHUB_ACTIONS must equal true/i,
    },
    {
      override: { GITHUB_REPOSITORY: 'other/repository' },
      match: /GITHUB_REPOSITORY must equal/i,
    },
    {
      override: { GITHUB_RUN_ATTEMPT: '' },
      match: /GITHUB_RUN_ATTEMPT is required/i,
    },
    {
      override: { GITHUB_ACTOR: 'unauthorized-actor' },
      match: /not authorized/i,
    },
    {
      override: { INCIDENT_ACTIVE_JSON: '{' },
      match: /not valid JSON/i,
    },
    {
      override: { INCIDENT_EVIDENCE_REFS: '   ' },
      match: /INCIDENT_EVIDENCE_REFS/i,
    },
    {
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
        INCIDENT_ACTIVE_JSON: JSON.stringify([{ id: 'x', severity: 'p1', status: 'open' }]),
      },
      match: /CLEAR attestation forbids/i,
    },
    {
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_ACTIVE_JSON: '[]',
        INCIDENT_REQUIRES_ROLLBACK: 'false',
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'false',
      },
      match: /WITH_HOLDS attestation requires/i,
    },
    {
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'true',
        INCIDENT_LAST_DEPLOYMENT_FAILED_AT: '2020-01-01T00:00:00.000Z',
      },
      match: /CLEAR attestation forbids/i,
    },
    {
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'true',
        INCIDENT_LAST_DEPLOYMENT_FAILED_AT: new Date(
          Date.now() - 5 * 60 * 1000,
        ).toISOString(),
      },
      match: /30-minute retry cooling period/i,
    },
    {
      override: {
        INCIDENT_REQUIRES_ROLLBACK: 'true',
        INCIDENT_ROLLBACK_REASON: '',
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_ACTIVE_JSON: '[]',
      },
      match: /INCIDENT_ROLLBACK_REASON/i,
    },
  ];

  for (const item of cases) {
    const { directory, result } = runIncidentsProducer({
      ...baseProducerEnv,
      ...item.override,
    });
    try {
      assert.notEqual(result.status, 0, `expected fail for ${item.match}`);
      assert.match(String(result.stderr || ''), item.match);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('stale and future incident records fail closed in split gate validator', async () => {
  const { checkProductionIncidents } = await import('../../scripts/lib/launch-gate-common.mjs');
  const directory = mkdtempSync(path.join(tmpdir(), 'incidents-stale-'));
  mkdirSync(path.join(directory, 'launch_package'), { recursive: true });
  try {
    writeFileSync(
      path.join(directory, 'launch_package/production-incidents.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        activeIncidents: [],
        requiresRollback: false,
        lastDeploymentFailed: false,
        updatedAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'ops',
      })}\n`,
    );
    const staleFailures = [];
    checkProductionIncidents(staleFailures, { root: directory, now: Date.now(), env: {} });
    assert.ok(staleFailures.some((f) => /stale|too old|updatedAt/i.test(f)));

    writeFileSync(
      path.join(directory, 'launch_package/production-incidents.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        activeIncidents: [],
        requiresRollback: false,
        lastDeploymentFailed: false,
        updatedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updatedBy: 'ops',
      })}\n`,
    );
    const futureFailures = [];
    checkProductionIncidents(futureFailures, { root: directory, now: Date.now(), env: {} });
    assert.ok(futureFailures.some((f) => /future/i.test(f)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('blocking P0/P1 and rollback holds are written truthfully and rejected by split gate validator', async () => {
  const { checkProductionIncidents } = await import('../../scripts/lib/launch-gate-common.mjs');
  const { directory, result } = runIncidentsProducer({
    ...baseProducerEnv,
    INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
    INCIDENT_ACTIVE_JSON: JSON.stringify([
      { id: 'INC-9', severity: 'P0', status: 'open', detectedAt: new Date().toISOString() },
    ]),
    INCIDENT_REQUIRES_ROLLBACK: 'true',
    INCIDENT_ROLLBACK_REASON: 'manual hold',
  });
  try {
    assert.equal(result.status, 0, result.stderr);
    const failures = [];
    checkProductionIncidents(failures, {
      root: directory,
      now: Date.now(),
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_SHA: baseProducerEnv.GITHUB_SHA,
        GITHUB_REPOSITORY: baseProducerEnv.GITHUB_REPOSITORY,
        GITHUB_RUN_ID: baseProducerEnv.GITHUB_RUN_ID,
        GITHUB_REF: baseProducerEnv.GITHUB_REF,
      },
    });
    assert.ok(failures.some((f) => /P0\/P1|Active P0/i.test(f)));
    assert.ok(failures.some((f) => /Rollback hold/i.test(f)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('committed static green incidents without attestation source are rejected in CI', async () => {
  const { checkProductionIncidents } = await import('../../scripts/lib/launch-gate-common.mjs');
  const directory = mkdtempSync(path.join(tmpdir(), 'incidents-static-'));
  mkdirSync(path.join(directory, 'launch_package'), { recursive: true });
  try {
    writeFileSync(
      path.join(directory, 'launch_package/production-incidents.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        activeIncidents: [],
        requiresRollback: false,
        lastDeploymentFailed: false,
        updatedAt: new Date().toISOString(),
        updatedBy: 'operations',
      })}\n`,
    );
    const failures = [];
    checkProductionIncidents(failures, {
      root: directory,
      now: Date.now(),
      env: { GITHUB_ACTIONS: 'true', GITHUB_SHA: 'a'.repeat(40) },
    });
    assert.ok(failures.some((f) => /protected-workflow-dispatch-attestation|static committed/i.test(f)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('static production incident fixture is deleted and runtime path is ignored', () => {
  assert.equal(
    existsSync(path.join(root, 'launch_package/production-incidents.json')),
    false,
  );
  assert.match(
    gitignore,
    /^launch_package\/production-incidents\.json$/m,
  );
});

test('clear incident attestation produces a bound runtime artifact', () => {
  const { directory, result } = runIncidentsProducer(baseProducerEnv);
  try {
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(
      readFileSync(path.join(directory, 'launch_package/production-incidents.json'), 'utf8'),
    );
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.source, 'protected-workflow-dispatch-attestation');
    assert.equal(doc.commitSha, baseProducerEnv.GITHUB_SHA);
    assert.equal(doc.workflowRunId, baseProducerEnv.GITHUB_RUN_ID);
    assert.equal(doc.workflowRunAttempt, 1);
    assert.equal(doc.repository, baseProducerEnv.GITHUB_REPOSITORY);
    assert.equal(doc.hardLaunchClaim, false);
    assert.deepEqual(doc.activeIncidents, []);
    assert.equal(doc.requiresRollback, false);
    assert.ok(Array.isArray(doc.evidenceReferences) && doc.evidenceReferences.length >= 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('deploy implementation is invoked exactly once after predeploy gates', () => {
  const matches = workflow.match(/node scripts\/deploy-firebase-production\.mjs/g) || [];
  assert.equal(matches.length, 1, 'deploy-firebase-production.mjs must be invoked exactly once');
  const predeploy = lineOf('Predeploy approval gate');
  const hmacPredeploy = lineOf('Enforce signed predeploy authorization');
  const deploy = lineOf('Deploy and verify Firebase production stack');
  const liveEvidence = lineOf('Run current-commit five-role business evidence');
  const upload = lineOf('Upload production deployment metadata after verification');
  assert.ok(hmacPredeploy < deploy);
  assert.ok(predeploy < deploy);
  assert.ok(deploy < liveEvidence);
  assert.ok(deploy < upload);
});

test('no deployment artifact is downloaded before it is produced in the deploy job', () => {
  const deployJobMatch = workflow.match(
    /deploy-firebase-production-stack:[\s\S]*?(?=\n  public-release-clearance:)/,
  );
  assert.ok(deployJobMatch, 'deploy job block missing');
  const deployJob = deployJobMatch[0];
  assert.doesNotMatch(deployJob, /download-artifact/);
  assert.match(deployJob, /Upload production deployment metadata after verification/);
  assert.match(deployJob, /Deploy and verify Firebase production stack/);
});

test('deployment metadata is uploaded only after deploy verification', () => {
  const deploy = lineOf('Deploy and verify Firebase production stack');
  const verify = lineOf(
    'Verify production deployment metadata and same-run bindings after deploy',
  );
  const upload = lineOf('Upload production deployment metadata after verification');
  assert.ok(deploy < verify);
  assert.ok(verify < upload);
});

test('postdeploy download is bound to current workflow run and SHA', () => {
  assert.match(workflow, /Verify downloaded deployment artifact is bound to this run and SHA/);
  assert.match(workflow, /node scripts\/verify-same-run-deployment-artifact\.mjs/);
  assert.match(
    workflow,
    /VALIDATED_ARTIFACT_DIGEST:\s*\$\{\{\s*needs\.deploy-firebase-production-stack\.outputs\.validated_artifact_digest\s*\}\}/,
  );
  assert.match(workflow, /RELEASE_ID:\s*\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.ok(existsSync(verifierScript));
  assert.match(workflow, /needs:\s*deploy-firebase-production-stack/);
});

test('protected lifecycle preserves provisional and final decision ordering', () => {
  const producer = lineOf(
    'Create production incidents artifact from protected workflow attestation',
  );
  const authorization = lineOf('Create signed founder authorization');
  const hmacPredeploy = lineOf('Enforce signed predeploy authorization');
  const digest = lineOf('Compute validated artifact digest');
  const approval = lineOf('Predeploy approval gate');
  const deploy = lineOf('Deploy and verify Firebase production stack');
  const deploymentVerification = lineOf(
    'Verify production deployment metadata and same-run bindings after deploy',
  );
  const liveEvidence = lineOf('Run current-commit five-role business evidence');
  const provisionalDecision = lineOf('Create signed hard-launch decision');
  const upload = lineOf('Upload production deployment metadata after verification');
  const publicRelease = lineOf('public-release-clearance:');
  const downloadedVerifier = lineOf(
    'Verify downloaded deployment artifact is bound to this run and SHA',
  );
  const postdeployGate = lineOf('Postdeploy release gate');
  const finalDecision = lineOf(
    'Create signed hard-launch decision after postdeploy clearance',
  );

  assert.ok(producer < authorization);
  assert.ok(authorization < hmacPredeploy);
  assert.ok(hmacPredeploy < digest);
  assert.ok(digest < approval);
  assert.ok(approval < deploy);
  assert.ok(deploy < deploymentVerification);
  assert.ok(deploymentVerification < liveEvidence);
  assert.ok(liveEvidence < provisionalDecision);
  assert.ok(provisionalDecision < upload);
  assert.ok(upload < publicRelease);
  assert.ok(publicRelease < downloadedVerifier);
  assert.ok(downloadedVerifier < postdeployGate);
  assert.ok(postdeployGate < finalDecision);

  const provisionalBlock = workflow.slice(
    workflow.indexOf('      - name: Create signed hard-launch decision\n'),
    workflow.indexOf('      - name: Upload production deployment metadata after verification'),
  );
  assert.match(provisionalBlock, /POSTDEPLOY_RELEASE_CLEARED:\s*'false'/);

  const finalBlock = workflow.slice(
    workflow.indexOf(
      '      - name: Create signed hard-launch decision after postdeploy clearance',
    ),
    workflow.indexOf('      - name: Upload public release clearance artifact'),
  );
  assert.match(
    finalBlock,
    /POSTDEPLOY_RELEASE_CLEARED:\s*\$\{\{\s*steps\.postdeploy_gate\.outputs\.cleared\s*\}\}/,
  );
});

test('same-run verifier uses required bindings without fail-open field checks', () => {
  const verifier = readFileSync(verifierScript, 'utf8');
  for (const binding of [
    'deployment repository',
    'deployment workflowRef',
    'deployment workflowRunId',
    'deployment workflowRunAttempt',
    'deployment artifactDigest',
    'deployment status',
  ]) {
    assert.match(verifier, new RegExp(binding));
  }
  assert.doesNotMatch(
    workflow,
    /if\s*\(\s*doc\.repository\s*&&\s*String\(doc\.repository\)/,
  );
  assert.doesNotMatch(
    workflow,
    /validatedArtifactDigest\|\|''/,
  );
});

test('deployment failure prevents evidence and release jobs by job dependency and step order', () => {
  assert.match(workflow, /public-release-clearance:[\s\S]*needs:\s*deploy-firebase-production-stack/);
  const liveEvidence = lineOf('Run current-commit five-role business evidence');
  const deploy = lineOf('Deploy and verify Firebase production stack');
  assert.ok(liveEvidence > deploy);
});

test('bank-pilot does not claim public launch; public mode requires Stripe live proof', () => {
  const decision = readFileSync(path.join(root, 'scripts/hard-launch-decision-gate.mjs'), 'utf8');
  assert.match(decision, /bank-pilot-no-public-claim/);
  assert.match(decision, /POSTDEPLOY_STRIPE_LIVE_OK/);
  assert.match(decision, /public-awaiting-postdeploy-clearance|postdeploy release clearance/);
  assert.match(workflow, /LAUNCH_MODE:\s*\$\{\{\s*inputs\.launch_mode\s*\}\}/);
  assert.match(
    decision,
    /launchMode === 'public' && postdeployCleared && stripeLiveOk/,
  );
});

test('no manual or synthetic evidence bypass exists in production workflow', () => {
  assert.doesNotMatch(workflow, /--exit-code\s+0/);
  assert.doesNotMatch(workflow, /hardLaunchClaim:\s*true/);
  assert.doesNotMatch(workflow, /echo\s+['\"]?true['\"]?\s*>\s*launch_package\/production-deployment\.json/);
  assert.match(workflow, /deploy-firebase-production\.mjs/);
});
