import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readJsonStrict,
  validateDeploymentMetadata,
  validateIncidentDocument,
} from '../scripts/lib/hard-launch-control.mjs';

const now = Date.parse('2026-07-12T10:00:00.000Z');
const commitSha = 'a'.repeat(40);
const context = {
  now,
  commitSha,
  repository: 'rashidpvt420-lang/bin-group-super-app',
};

test('missing incident telemetry fails closed', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hard-launch-incidents-'));
  try {
    assert.throws(
      () => readJsonStrict(path.join(directory, 'production-incidents.json'), 'production-incidents.json'),
      /is missing/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('active incidents and rollback flags block release', () => {
  const activeErrors = validateIncidentDocument({
    schemaVersion: 1,
    activeIncidents: [{ id: 'INC-1', severity: 'P1', status: 'open' }],
    requiresRollback: false,
    lastDeploymentFailed: false,
    lastSuccessfulCommitSha: null,
  }, { now }).join('\n');
  assert.match(activeErrors, /active production incidents/);

  const rollbackErrors = validateIncidentDocument({
    schemaVersion: 1,
    activeIncidents: [],
    requiresRollback: true,
    rollbackReason: 'release hold',
    lastDeploymentFailed: false,
    lastSuccessfulCommitSha: null,
  }, { now }).join('\n');
  assert.match(rollbackErrors, /rollback is required/);
});

test('malformed failed-deployment timestamps fail closed', () => {
  const errors = validateIncidentDocument({
    schemaVersion: 1,
    activeIncidents: [],
    requiresRollback: false,
    lastDeploymentFailed: true,
    lastDeploymentFailedAt: 'not-a-date',
    lastSuccessfulCommitSha: null,
  }, { now }).join('\n');
  assert.match(errors, /valid ISO-8601/);
});

test('predeploy authorization does not require postdeploy metadata', () => {
  const source = readFileSync('scripts/hard-launch-predeploy-gate.mjs', 'utf8');
  assert.doesNotMatch(source, /production-deployment\.json/);
  assert.match(source, /hard-launch-authorization\.json/);
  assert.match(source, /production-incidents\.json/);
});

test('deployment metadata must match exact commit and all required components', () => {
  const valid = {
    status: 'passed',
    httpChecksOk: true,
    bundleVerified: true,
    hardLaunchClaim: false,
    deployedCommitSha: commitSha,
    deployedAt: new Date(now - 10 * 60_000).toISOString(),
    verifiedAt: new Date(now - 5 * 60_000).toISOString(),
    successfulComponents: ['hosting', 'firestoreRules', 'firestoreIndexes', 'storageRules', 'functions'],
    repository: context.repository,
    workflowRef: 'refs/heads/main',
  };
  assert.deepEqual(validateDeploymentMetadata(valid, context), []);

  const invalid = {
    ...valid,
    deployedCommitSha: 'b'.repeat(40),
    successfulComponents: ['hosting'],
  };
  const errors = validateDeploymentMetadata(invalid, context).join('\n');
  assert.match(errors, /does not match workflow SHA/);
  assert.match(errors, /missing successful component: functions/);
});

test('committed proof file is not a mutable founder approval switch', () => {
  const gates = readFileSync('launch_package/launch-proof-gates.json', 'utf8');
  assert.doesNotMatch(gates, /"hardLaunchApproved"/);
  assert.doesNotMatch(gates, /"founderAuthorization"/);
});

test('production workflow enforces correct hard-launch order', () => {
  const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const predeploy = workflow.indexOf('Enforce signed predeploy authorization');
  const deploy = workflow.indexOf('Deploy and verify Firebase production stack');
  const liveEvidence = workflow.indexOf('Run current-commit five-role business evidence');
  const decision = workflow.indexOf('Create signed hard-launch decision');
  assert.ok(predeploy >= 0 && deploy > predeploy);
  assert.ok(liveEvidence > deploy);
  assert.ok(decision > liveEvidence);
  assert.match(workflow, /VITE_FIREBASE_APPCHECK_DEBUG_TOKEN/);
  assert.match(workflow, /HARD_LAUNCH_APPROVAL_HMAC_KEY/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
});
