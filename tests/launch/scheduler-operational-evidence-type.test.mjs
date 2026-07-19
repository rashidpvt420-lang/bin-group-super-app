import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION } from '../../scripts/lib/launch-honesty.mjs';
import { REQUIRED_OPERATIONAL_GATES, validateOperationalReadinessReport } from '../../scripts/lib/hard-launch-gate.mjs';

const commitSha = 'a'.repeat(40);
const now = Date.parse('2026-07-19T12:00:00.000Z');
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
    const sourceRunId = String(654321 + index);
    return [key, {
      status: 'passed',
      commitSha,
      projectId: PRODUCTION.projectId,
      evidenceType: evidenceTypes[key],
      evidenceReference: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}#${key}`,
      artifactHash: (index + 1).toString(16).padStart(64, '0'),
      sourceProofHash: (index + 101).toString(16).padStart(64, '0'),
      sourceSystem: sourceSystems[key],
      observedAt: '2026-07-19T10:00:00.000Z',
      sourceWorkflowRunId: sourceRunId,
      workflowRunId: String(754321 + index),
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
  assert.ok(validateOperationalReadinessReport(invalid, commitSha, { now })
    .includes('renewalScheduler.evidenceType is not accepted for this gate'));
});
