import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRODUCTION } from '../../scripts/lib/launch-honesty.mjs';
import { REQUIRED_OPERATIONAL_GATES, validateOperationalReadinessReport } from '../../scripts/lib/hard-launch-gate.mjs';

const commitSha = 'a'.repeat(40);
const now = Date.parse('2026-07-19T12:00:00.000Z');
const hash = (value) => createHash('sha256').update(value).digest('hex');

const evidenceTypes = Object.freeze({
  ownerPaymentActivation: 'production-transaction',
  paymentUnlockExactlyOnce: 'production-transaction',
  tenantNotificationDelivery: 'workflow-artifact',
  technicianPhysicalGpsEvidence: 'physical-device-report',
  brokerCommissionLockExactlyOnce: 'production-transaction',
  adminStaffClaims: 'workflow-artifact',
  stripeLiveBilling: 'production-transaction',
  appCheckEnforcement: 'workflow-artifact',
  privilegedAccessRotation: 'secret-rotation-record',
  brandedEmailDelivery: 'workflow-artifact',
  renewalScheduler: 'scheduler-run',
});

const sourceSystems = Object.freeze({
  ownerPaymentActivation: 'Firebase payment activation transaction',
  paymentUnlockExactlyOnce: 'Firebase adminApprovePayment replay verifier',
  tenantNotificationDelivery: 'Firebase notification FCM delivery',
  technicianPhysicalGpsEvidence: 'Physical device GPS evidence',
  brokerCommissionLockExactlyOnce: 'Firebase broker commission replay',
  adminStaffClaims: 'Firebase Auth staff registry',
  stripeLiveBilling: 'Stripe live payment webhook',
  appCheckEnforcement: 'Firebase App Check enforcement',
  privilegedAccessRotation: 'Google Secret Manager Firebase Authentication secret rotation',
  brandedEmailDelivery: 'SMTP branded email delivery',
  renewalScheduler: 'Firebase renewal watcher scheduler',
});

const report = () => ({
  schemaVersion: 1,
  status: 'passed',
  commitSha,
  projectId: PRODUCTION.projectId,
  source: 'firestore-system-health-admin-summaries',
  generatedByWorkflow: true,
  githubRepository: 'rashidpvt420-lang/bin-group-super-app',
  githubRef: 'refs/heads/main',
  githubRunId: '123456',
  gates: Object.fromEntries(REQUIRED_OPERATIONAL_GATES.map((key, index) => {
    const sourceWorkflowRunId = String(654321 + index);
    return [key, {
      status: 'passed',
      commitSha,
      projectId: PRODUCTION.projectId,
      evidenceType: evidenceTypes[key],
      evidenceReference: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceWorkflowRunId}`,
      artifactHash: hash(`artifact-${key}`),
      sourceProofHash: hash(`proof-${key}`),
      sourceSystem: sourceSystems[key],
      observedAt: '2026-07-19T10:00:00.000Z',
      sourceWorkflowRunId,
      workflowRunId: String(123456 + index),
      githubRepository: 'rashidpvt420-lang/bin-group-super-app',
      verifiedBy: 'workflow',
      verifiedAt: '2026-07-19T10:05:00.000Z',
    }];
  })),
});

test('renewal scheduler proof accepts scheduler-run evidence', () => {
  assert.deepEqual(validateOperationalReadinessReport(report(), commitSha, { now }), []);
});

test('unknown evidence classifications remain rejected', () => {
  const invalid = report();
  invalid.gates.renewalScheduler.evidenceType = 'manual-attestation';
  assert.ok(
    validateOperationalReadinessReport(invalid, commitSha, { now })
      .some((error) => error.includes('renewalScheduler.evidenceType is not accepted')),
  );
});
