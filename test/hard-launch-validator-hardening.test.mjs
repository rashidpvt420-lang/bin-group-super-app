import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_OPERATIONAL_GATES,
  validateOperationalReadinessReport,
  validatePilotIncidentReport,
  validateProtectedHardLaunchWorkflowContext,
} from '../scripts/lib/hard-launch-gate.mjs';
import { getAuthorizedApprovers } from '../scripts/lib/authorized-approvers.mjs';
import { PRODUCTION } from '../scripts/lib/launch-honesty.mjs';

const commitSha = 'a'.repeat(40);
const now = Date.parse('2026-07-19T12:00:00.000Z');
const env = {
  AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,release-admin',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW: 'Live Role Smoke Tests',
  GITHUB_JOB: 'hard-public-launch-clearance',
  GITHUB_RUN_ID: '123456',
  GITHUB_SHA: commitSha,
  GITHUB_ACTOR: 'rashidpvt420-lang',
};

const sourceSystems = {
  ownerPaymentActivation: 'Firebase payment activation transaction',
  paymentUnlockExactlyOnce: 'Firebase adminApprovePayment replay verifier',
  tenantNotificationDelivery: 'Firebase notificationDelivery FCM trigger',
  technicianPhysicalGpsEvidence: 'Firebase technician lifecycle, device binding and Cloud Storage',
  brokerCommissionLockExactlyOnce: 'Firebase broker commission transaction and payment replay',
  adminStaffClaims: 'Firebase Auth and staff registries',
  stripeLiveBilling: 'stripe-live-api-and-webhook',
  appCheckEnforcement: 'Firebase App Check enforcement',
  privilegedAccessRotation: 'Google Secret Manager and Firebase Authentication',
  brandedEmailDelivery: 'Postmark email delivery',
  renewalScheduler: 'Firebase contract renewal watcher',
};
const evidenceTypes = {
  ownerPaymentActivation: 'production-transaction',
  paymentUnlockExactlyOnce: 'production-transaction',
  tenantNotificationDelivery: 'production-transaction',
  technicianPhysicalGpsEvidence: 'physical-device-report',
  brokerCommissionLockExactlyOnce: 'production-transaction',
  adminStaffClaims: 'workflow-artifact',
  stripeLiveBilling: 'production-transaction',
  appCheckEnforcement: 'workflow-artifact',
  privilegedAccessRotation: 'secret-rotation-record',
  brandedEmailDelivery: 'workflow-artifact',
  renewalScheduler: 'scheduler-run',
};

function validOperational() {
  const gates = {};
  REQUIRED_OPERATIONAL_GATES.forEach((key, index) => {
    const sourceRun = String(700000 + index);
    gates[key] = {
      status: 'passed',
      commitSha,
      projectId: PRODUCTION.projectId,
      evidenceType: evidenceTypes[key],
      evidenceReference: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRun}#${key}`,
      artifactHash: (index + 1).toString(16).padStart(64, '0'),
      sourceProofHash: (index + 101).toString(16).padStart(64, '0'),
      sourceSystem: sourceSystems[key],
      observedAt: '2026-07-19T10:00:00.000Z',
      sourceWorkflowRunId: sourceRun,
      workflowRunId: String(800000 + index),
      githubRepository: 'rashidpvt420-lang/bin-group-super-app',
      verifiedBy: 'workflow',
      verifiedAt: '2026-07-19T10:05:00.000Z',
    };
  });
  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    source: 'firestore-system-health-admin-summaries',
    generatedByWorkflow: true,
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: '999999',
    gates,
  };
}

function validIncident() {
  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    pilotStartedAt: '2026-07-18T09:00:00.000Z',
    pilotCompletedAt: '2026-07-19T10:00:00.000Z',
    openP0: 0,
    openP1: 0,
    rollbackPlanVerified: true,
    monitoringVerified: true,
    incidentConfirmationVerified: true,
    rollbackConfirmationVerified: true,
    incidentReference: 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/1',
    rollbackReference: 'https://github.com/rashidpvt420-lang/bin-group-super-app/blob/main/README.md',
    monitoringReference: 'https://console.cloud.google.com/monitoring',
    approvedBy: 'rashidpvt420-lang',
    generatedByWorkflow: true,
    source: 'hard-public-launch-clearance-workflow',
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: '123456',
  };
}

test('authorized approvers come only from protected configuration', () => {
  assert.deepEqual(getAuthorizedApprovers(env), ['rashidpvt420-lang', 'release-admin']);
  assert.deepEqual(getAuthorizedApprovers({}), []);
  assert.throws(() => getAuthorizedApprovers({ AUTHORIZED_FOUNDER_ACTORS: 'bad actor!' }), /Invalid authorized/);
});

test('protected validator context requires exact repository, workflow, actor, run and SHA', () => {
  assert.deepEqual(validateProtectedHardLaunchWorkflowContext(env), []);
  const bad = { ...env, GITHUB_SHA: 'x'.repeat(40), GITHUB_ACTOR: 'intruder' };
  const errors = validateProtectedHardLaunchWorkflowContext(bad);
  assert.ok(errors.some((error) => /40-character GITHUB_SHA/i.test(error)));
  assert.ok(errors.some((error) => /not authorized/i.test(error)));
});

test('operational report enforces HTTPS references, gate types, source systems and namespace-safe uniqueness', () => {
  assert.deepEqual(validateOperationalReadinessReport(validOperational(), commitSha, { now, env }), []);

  const reused = validOperational();
  reused.gates.paymentUnlockExactlyOnce.artifactHash = reused.gates.ownerPaymentActivation.artifactHash;
  const reusedErrors = validateOperationalReadinessReport(reused, commitSha, { now, env });
  assert.ok(reusedErrors.some((error) => /artifactHash is already used/i.test(error)));

  const sameGateNamespaces = validOperational();
  sameGateNamespaces.gates.ownerPaymentActivation.sourceProofHash = sameGateNamespaces.gates.ownerPaymentActivation.artifactHash;
  assert.equal(
    validateOperationalReadinessReport(sameGateNamespaces, commitSha, { now, env })
      .some((error) => /already used/i.test(error)),
    false,
  );

  const bad = validOperational();
  bad.gates.stripeLiveBilling.evidenceReference = 'http://example.com/proof';
  bad.gates.stripeLiveBilling.sourceSystem = 'Firebase generic';
  bad.gates.technicianPhysicalGpsEvidence.evidenceType = 'workflow-artifact';
  const errors = validateOperationalReadinessReport(bad, commitSha, { now, env });
  assert.ok(errors.some((error) => /approved evidence host/i.test(error)));
  assert.ok(errors.some((error) => /stripeLiveBilling.sourceSystem/i.test(error)));
  assert.ok(errors.some((error) => /technicianPhysicalGpsEvidence.evidenceType/i.test(error)));
});

test('operational chronology and pilot freshness fail closed', () => {
  const operational = validOperational();
  operational.gates.appCheckEnforcement.observedAt = '2026-07-19T10:10:00.000Z';
  assert.ok(validateOperationalReadinessReport(operational, commitSha, { now, env })
    .some((error) => /observedAt cannot occur after verifiedAt/i.test(error)));

  const stale = validIncident();
  stale.pilotStartedAt = '2026-06-01T00:00:00.000Z';
  stale.pilotCompletedAt = '2026-06-02T00:00:00.000Z';
  assert.ok(validatePilotIncidentReport(stale, commitSha, { now, env })
    .some((error) => /max freshness exceeded/i.test(error)));
});

test('direct validator refuses invalid workflow context before reading artifacts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hard-launch-cli-'));
  try {
    const script = fileURLToPath(new URL('../scripts/lib/hard-launch-gate.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...env, GITHUB_SHA: 'not-a-sha' },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /protected workflow context failed/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
