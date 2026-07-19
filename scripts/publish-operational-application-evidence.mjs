#!/usr/bin/env node

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { PRODUCTION, sha256File } from './lib/launch-honesty.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_WORKFLOW = 'Operational Application Evidence';
const EXPECTED_JOB = 'verify-and-publish';
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  console.error(`[publish-operational-application-evidence] FAIL — ${message}`);
  process.exit(1);
};
const validTime = (value) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};
const requiredText = (value, label, errors) => {
  if (!text(value)) errors.push(`${label} is required`);
};
const requiredHash = (value, label, errors) => {
  if (!/^[a-f0-9]{64}$/i.test(text(value))) errors.push(`${label} must be SHA-256`);
};

const manifests = Object.freeze({
  ownerPaymentActivation: {
    evidenceType: 'production-transaction',
    sourceSystem: 'Firebase payment activation transaction',
    reference: (proof) => `firestore://payment_transactions/${proof.evidence.paymentId}#contract=${proof.evidence.contractId}`,
    validate: (e, errors) => {
      requiredText(e.paymentId, 'paymentId', errors);
      requiredText(e.contractId, 'contractId', errors);
      requiredText(e.intakeId, 'intakeId', errors);
      requiredText(e.invoiceId, 'invoiceId', errors);
      requiredHash(e.ownerUidHash, 'ownerUidHash', errors);
      if (Number(e.propertyCount || 0) < 1) errors.push('propertyCount must be positive');
      if (Number(e.amountMinor || 0) <= 0 || e.currency !== 'AED') errors.push('AED activation amount is invalid');
      if (!validTime(e.paymentApprovedAt) || !validTime(e.contractApprovedAt) || !validTime(e.ownerApprovedAt)) errors.push('activation approval timestamps are invalid');
    },
  },
  paymentUnlockExactlyOnce: {
    evidenceType: 'production-transaction',
    sourceSystem: 'Firebase adminApprovePayment replay verifier',
    reference: (proof) => `firebase-callable://adminApprovePayment/${proof.evidence.paymentId}#idempotent-replay`,
    validate: (e, errors) => {
      requiredText(e.paymentId, 'paymentId', errors);
      requiredText(e.contractId, 'contractId', errors);
      requiredText(e.invoiceId, 'invoiceId', errors);
      requiredHash(e.ownerUidHash, 'ownerUidHash', errors);
      requiredHash(e.invoiceProofHash, 'invoiceProofHash', errors);
      requiredHash(e.replayActorUidHash, 'replayActorUidHash', errors);
      if (e.stateUnchanged !== true || Number(e.replayHttpStatus) !== 200) errors.push('payment replay was not safely idempotent');
      if (Number(e.approvalAuditCount) !== 1 || Number(e.invoiceCount) !== 1) errors.push('payment activation was not exactly once');
    },
  },
  tenantNotificationDelivery: {
    evidenceType: 'production-transaction',
    sourceSystem: 'Firebase notificationDelivery FCM trigger',
    reference: (proof) => `firestore://notifications/${proof.evidence.notificationId}#ticket=${proof.evidence.ticketId}`,
    validate: (e, errors) => {
      requiredText(e.notificationId, 'notificationId', errors);
      requiredText(e.ticketId, 'ticketId', errors);
      requiredText(e.ticketCollection, 'ticketCollection', errors);
      requiredHash(e.tenantUidHash, 'tenantUidHash', errors);
      requiredHash(e.propertyIdHash, 'propertyIdHash', errors);
      requiredHash(e.unitBindingHash, 'unitBindingHash', errors);
      requiredHash(e.photoEvidenceHash, 'photoEvidenceHash', errors);
      if (Number(e.pushTokenCount || 0) < 1 || Number(e.pushSuccessCount || 0) < 1 || Number(e.pushFailureCount || 0) !== 0) errors.push('FCM delivery counts are invalid');
      if (!validTime(e.pushAttemptedAt)) errors.push('pushAttemptedAt is invalid');
    },
  },
  brokerCommissionLockExactlyOnce: {
    evidenceType: 'production-transaction',
    sourceSystem: 'Firebase broker commission transaction and payment replay',
    reference: (proof) => `firestore://broker_commissions/${proof.evidence.commissionId}#contract=${proof.evidence.contractId}`,
    validate: (e, errors) => {
      requiredText(e.paymentId, 'paymentId', errors);
      requiredText(e.contractId, 'contractId', errors);
      requiredText(e.commissionId, 'commissionId', errors);
      requiredHash(e.brokerUidHash, 'brokerUidHash', errors);
      requiredHash(e.commissionStateHash, 'commissionStateHash', errors);
      requiredHash(e.replayActorUidHash, 'replayActorUidHash', errors);
      if (Number(e.commissionCount) !== 1 || e.stateUnchanged !== true || Number(e.replayHttpStatus) !== 200) errors.push('commission lock is not exactly-once and replay-safe');
    },
  },
  adminStaffClaims: {
    evidenceType: 'workflow-artifact',
    sourceSystem: 'Firebase Auth and staff registries',
    reference: (proof) => `firebase-auth://staff/${proof.evidence.staffUidHash}#least-privilege`,
    validate: (e, errors) => {
      requiredHash(e.staffUidHash, 'staffUidHash', errors);
      requiredHash(e.permissionsHash, 'permissionsHash', errors);
      if (e.role !== 'technician' || e.authDisabled !== false) errors.push('staff account must be an active technician');
      if (Number(e.staffRegistryCount) !== 4 || Number(e.creationAuditCount) !== 1) errors.push('staff registries or creation audit are incomplete');
      if (!validTime(e.createdAt)) errors.push('staff createdAt is invalid');
    },
  },
  renewalScheduler: {
    evidenceType: 'scheduler-run',
    sourceSystem: 'Firebase contract renewal watcher',
    reference: (proof) => `firestore://contract_renewal_watch/${proof.evidence.watchId}#source=${proof.evidence.sourceCollection}`,
    validate: (e, errors) => {
      requiredText(e.watchId, 'watchId', errors);
      requiredText(e.sourceCollection, 'sourceCollection', errors);
      requiredHash(e.sourceIdHash, 'sourceIdHash', errors);
      requiredHash(e.tenantBindingHash, 'tenantBindingHash', errors);
      requiredHash(e.pdfEvidenceHash, 'pdfEvidenceHash', errors);
      requiredText(e.renewalStatus, 'renewalStatus', errors);
      if (e.sourceDocumentExists !== true || !Number.isFinite(Number(e.daysRemaining))) errors.push('renewal source or daysRemaining is invalid');
      if (!validTime(e.expiryAt) || !validTime(e.generatedAt)) errors.push('renewal timeline timestamps are invalid');
      if (!text(e.schedulerRunIdHash) && !text(e.provenanceHash)) errors.push('scheduler provenance is required');
    },
  },
});

if (process.env.GITHUB_ACTIONS !== 'true') fail('publisher may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('publisher requires the protected main repository');
if (process.env.GITHUB_WORKFLOW !== EXPECTED_WORKFLOW || process.env.GITHUB_JOB !== EXPECTED_JOB) fail('publisher requires the protected application evidence job');
if (process.env.GITHUB_ACTOR !== 'rashidpvt420-lang') fail('only the authorized founder may publish application evidence');

const gate = text(process.env.OPERATIONAL_GATE);
const manifest = manifests[gate];
if (!manifest) fail(`unsupported application gate: ${gate || '(missing)'}`);
const commitSha = text(process.env.GITHUB_SHA);
const runId = text(process.env.GITHUB_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(runId)) fail('exact SHA and numeric workflow run ID are required');

let proof;
try { proof = JSON.parse(readFileSync('launch_package/application-proof.json', 'utf8')); }
catch (error) { fail(`proof file missing or malformed: ${error.message}`); }
const errors = [];
if (proof.schemaVersion !== 1 || proof.status !== 'passed' || proof.source !== 'operational-application-production-verifier') errors.push('proof envelope is invalid');
if (proof.gate !== gate || proof.commitSha !== commitSha || proof.projectId !== PRODUCTION.projectId || proof.repository !== EXPECTED_REPOSITORY || text(proof.workflowRunId) !== runId) errors.push('proof workflow/commit binding mismatch');
if (!proof.evidence || typeof proof.evidence !== 'object') errors.push('proof evidence is missing');
else manifest.validate(proof.evidence, errors);
const observedAt = validTime(proof.observedAt);
if (!observedAt) errors.push('proof observedAt is invalid');
if (errors.length) {
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  fail(`${gate} proof validation failed`);
}

const artifactHash = sha256File('launch_package/application-proof.json');
const sourceProofHash = sha256(JSON.stringify(proof.evidence));
const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const record = {
  status: 'passed',
  commitSha,
  projectId,
  evidenceType: manifest.evidenceType,
  evidenceReference: manifest.reference(proof),
  artifactHash,
  sourceProofHash,
  sourceSystem: manifest.sourceSystem,
  observedAt: admin.firestore.Timestamp.fromDate(observedAt),
  sourceWorkflowRunId: runId,
  workflowRunId: runId,
  verifiedBy: 'workflow',
  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
};
const ref = admin.firestore().doc('system_health/admin_summaries');
await admin.firestore().runTransaction(async (transaction) => {
  const snapshot = await transaction.get(ref);
  const current = snapshot.data() || {};
  transaction.set(ref, {
    operationalEvidence: {
      ...(current.operationalEvidence && typeof current.operationalEvidence === 'object' ? current.operationalEvidence : {}),
      [gate]: record,
    },
    operationalEvidenceCommitSha: commitSha,
    operationalEvidenceProjectId: projectId,
    operationalEvidenceLastWorkflowRunId: runId,
    operationalEvidenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});
console.log(`[publish-operational-application-evidence] PASS gate=${gate} artifact=${artifactHash.slice(0, 12)}…`);
