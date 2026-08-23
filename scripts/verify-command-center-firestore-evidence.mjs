#!/usr/bin/env node

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const EXPECTED_PROJECT = 'bin-group-57c60';
const releaseSha = String(process.env.SOURCE_EVIDENCE_SHA || '').trim().toLowerCase();
const workflowRunId = String(process.env.SOURCE_EVIDENCE_RUN_ID || '').trim();

if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error('[command-center-evidence-verify] SOURCE_EVIDENCE_SHA must be a full lowercase SHA');
}
if (!/^\d+$/.test(workflowRunId)) {
  throw new Error('[command-center-evidence-verify] SOURCE_EVIDENCE_RUN_ID must be numeric');
}

const expectedGates = new Set([
  'ownerOnboardingFullPath',
  'ownerPaymentApproveReject',
  'tenantPhotoMaintenanceRequest',
  'technicianMissionLifecycle',
  'technicianGpsAndDeniedFallback',
  'brokerReferralCommissionLifecycle',
  'adminFreshLoginAndCorePages',
  'adminStaffProvisioning',
  'adminPaymentUnlockAudit',
  'firebaseAuth',
  'firebaseCloudMessaging',
]);
const expectedRoles = new Set(['owner', 'tenant', 'technician', 'broker', 'admin']);

if (!getApps().length) {
  initializeApp({ projectId: EXPECTED_PROJECT, credential: applicationDefault() });
}
const db = getFirestore();

const [gateSnapshot, smokeSnapshot] = await Promise.all([
  db.collection('launch_evidence').where('releaseSha', '==', releaseSha).get(),
  db.collection('signed_in_smoke_checks').where('releaseSha', '==', releaseSha).get(),
]);

const gates = gateSnapshot.docs
  .map((doc) => doc.data())
  .filter((record) => String(record.workflowRunId || '') === workflowRunId && record.source === 'github-actions' && record.status === 'passed');
const smokes = smokeSnapshot.docs
  .map((doc) => doc.data())
  .filter((record) => String(record.workflowRunId || '') === workflowRunId && record.source === 'github-actions' && record.status === 'passed');

for (const gateId of expectedGates) {
  if (!gates.some((record) => record.gateId === gateId)) {
    throw new Error(`[command-center-evidence-verify] missing published gate ${gateId}`);
  }
}
for (const role of expectedRoles) {
  if (!smokes.some((record) => record.role === role)) {
    throw new Error(`[command-center-evidence-verify] missing published signed-in smoke role ${role}`);
  }
}

console.log(JSON.stringify({
  status: 'verified',
  releaseSha,
  workflowRunId,
  passedGateCount: expectedGates.size,
  passedSmokeRoleCount: expectedRoles.size,
}, null, 2));
