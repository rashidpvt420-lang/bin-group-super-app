#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
  const index = workflow.indexOf(snippet);
  assert.ok(index >= 0, `workflow missing expected snippet: ${snippet}`);
  return workflow.slice(0, index).split(/\r?\n/).length;
}

function runIncidentsProducer(env) {
  const directory = mkdtempSync(path.join(tmpdir(), 'incidents-producer-'));
  const result = spawnSync(process.execPath, [producerScript], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, ...env },
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
  INCIDENT_EVIDENCE_REFS: 'ops://ticket/INC-REVIEW-1',
};

test('runtime incident attestation is produced before every release consumer', () => {
  const producer = lineOf('Create run-bound incident attestation');
  const hmacGate = lineOf('Enforce signed authorization and clear incidents');
  const splitGate = lineOf('Run protected predeploy approval gate');
  const publicGate = lineOf('Run final public postdeploy gate');
  assert.ok(producer < hmacGate);
  assert.ok(producer < splitGate);
  assert.ok(producer < publicGate);
  assert.match(workflow, /npm run hard-launch:incidents/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{\s*secrets\.AUTHORIZED_FOUNDER_ACTORS/);
});

test('incident producer fails closed for missing, unauthorized, and contradictory input', () => {
  const cases = [
    { override: { INCIDENT_ATTESTATION: '' }, match: /INCIDENT_ATTESTATION is required/i },
    { override: { GITHUB_ACTIONS: 'false' }, match: /GITHUB_ACTIONS must equal true/i },
    { override: { GITHUB_ACTOR: 'unauthorized' }, match: /not authorized/i },
    { override: { INCIDENT_ACTIVE_JSON: '{' }, match: /not valid JSON/i },
    {
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
        INCIDENT_ACTIVE_JSON: JSON.stringify([{ id: 'INC-1', severity: 'P1', status: 'open' }]),
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
  ];

  for (const item of cases) {
    const { directory, result } = runIncidentsProducer({
      ...baseProducerEnv,
      ...item.override,
    });
    try {
      assert.notEqual(result.status, 0, `expected failure for ${item.match}`);
      assert.match(String(result.stderr || ''), item.match);
      assert.equal(existsSync(path.join(directory, 'launch_package/production-incidents.json')), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('clear incident attestation creates a run-bound non-launch artifact', () => {
  const { directory, result } = runIncidentsProducer(baseProducerEnv);
  try {
    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(
      readFileSync(path.join(directory, 'launch_package/production-incidents.json'), 'utf8'),
    );
    assert.equal(document.source, 'protected-workflow-dispatch-attestation');
    assert.equal(document.commitSha, baseProducerEnv.GITHUB_SHA);
    assert.equal(document.workflowRunId, baseProducerEnv.GITHUB_RUN_ID);
    assert.equal(document.workflowRunAttempt, 1);
    assert.equal(document.repository, baseProducerEnv.GITHUB_REPOSITORY);
    assert.equal(document.hardLaunchClaim, false);
    assert.deepEqual(document.activeIncidents, []);
    assert.equal(document.requiresRollback, false);
    assert.ok(document.evidenceReferences.length > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('static green incident fixture is absent and runtime path is ignored', () => {
  assert.equal(existsSync(path.join(root, 'launch_package/production-incidents.json')), false);
  assert.match(gitignore, /^launch_package\/production-incidents\.json$/m);
});

test('one protected job performs predeploy, deploy, same-run verification, and evidence in order', () => {
  const hmacGate = lineOf('Enforce signed authorization and clear incidents');
  const digest = lineOf('Compute validated artifact digest');
  const splitGate = lineOf('Run protected predeploy approval gate');
  const deploy = lineOf('Deploy and verify Firebase production stack');
  const sameRun = lineOf('Verify same-run deployment artifact binding');
  const envProof = lineOf('Verify five-role and App Check environment');
  const evidence = lineOf('Record deployment and five-role evidence');
  const pilot = lineOf('Evaluate pilot eligibility');
  assert.ok(hmacGate < digest);
  assert.ok(digest < splitGate);
  assert.ok(splitGate < deploy);
  assert.ok(deploy < sameRun);
  assert.ok(sameRun < envProof);
  assert.ok(envProof < evidence);
  assert.ok(evidence < pilot);
  assert.equal((workflow.match(/node scripts\/deploy-firebase-production\.mjs/g) || []).length, 1);
  assert.doesNotMatch(workflow, /download-artifact/);
});

test('same-run deployment verifier is mandatory and receives release bindings', () => {
  assert.ok(existsSync(verifierScript));
  assert.match(workflow, /node scripts\/verify-same-run-deployment-artifact\.mjs/);
  const verifier = readFileSync(verifierScript, 'utf8');
  for (const binding of [
    'deployment repository',
    'deployment workflowRef',
    'deployment workflowRunId',
    'deployment workflowRunAttempt',
    'deployment artifactDigest',
    'deployment status',
  ]) {
    assert.ok(verifier.includes(binding), `verifier missing binding: ${binding}`);
  }
  assert.match(workflow, /RELEASE_ID:\s*\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(workflow, /VALIDATED_ARTIFACT_DIGEST:\s*\$\{\{\s*steps\.artifact_digest\.outputs\.digest\s*\}\}/);
});

test('bank-pilot decision stays provisional and public decision follows every postdeploy proof', () => {
  const pilot = lineOf('Evaluate pilot eligibility');
  const bankDecision = lineOf('Create bank-pilot signed decision');
  const routes = lineOf('Verify production routes for public mode');
  const smtp = lineOf('Verify SMTP live delivery for public mode');
  const appCheck = lineOf('Verify App Check registration for public mode');
  const smoke = lineOf('Record authenticated Gate 11 evidence for public mode');
  const business = lineOf('Aggregate business evidence for public mode');
  const publicGate = lineOf('Run final public postdeploy gate');
  const publicDecision = lineOf('Create final public signed decision');
  const finalStatus = lineOf('Verify final hard-launch status');
  assert.ok(pilot < bankDecision);
  assert.ok(pilot < routes && routes < smtp && smtp < appCheck);
  assert.ok(appCheck < smoke && smoke < business && business < publicGate);
  assert.ok(publicGate < publicDecision && publicDecision < finalStatus);
  const bankBlock = workflow.slice(
    workflow.indexOf('      - name: Create bank-pilot signed decision'),
    workflow.indexOf('      - name: Verify production routes for public mode'),
  );
  assert.match(bankBlock, /POSTDEPLOY_RELEASE_CLEARED:\s*'false'/);
  const publicBlock = workflow.slice(
    workflow.indexOf('      - name: Create final public signed decision'),
    workflow.indexOf('      - name: Verify final hard-launch status'),
  );
  assert.match(publicBlock, /POSTDEPLOY_RELEASE_CLEARED:\s*\$\{\{\s*steps\.public_gate\.outputs\.cleared\s*\}\}/);
});

test('production workflow has no synthetic success or public-claim bypass', () => {
  assert.doesNotMatch(workflow, /--exit-code\s+0/);
  assert.doesNotMatch(workflow, /hardLaunchClaim:\s*true/);
  assert.doesNotMatch(workflow, /echo\s+['"]?true['"]?\s*>\s*launch_package\/production-deployment\.json/);
  assert.match(workflow, /deploy-firebase-production\.mjs/);
  assert.match(workflow, /hard-launch:status/);
});
