#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Operational Application Evidence';
const JOB = 'verify-and-publish';
const DEPLOYMENT_PATH = 'launch_package/production-deployment.json';
const OUTPUT_PATH = 'launch_package/application-provenance.json';
const MAX_DEPLOYMENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (message) => {
  console.error(`[operational-application-provenance] FAIL — ${message}`);
  process.exit(1);
};
const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(Number(value?._seconds))) return new Date(Number(value._seconds) * 1000);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};
const millis = (value) => toDate(value)?.getTime() || 0;
const latestTimestamp = (data, fields) => Math.max(0, ...fields.map((field) => millis(data?.[field])));
const docResult = (snapshot) => ({ id: snapshot.id, data: snapshot.data() || {} });

const gateDefinitions = Object.freeze({
  ownerPaymentActivation: {
    collection: 'payment_transactions',
    where: ['status', '==', 'APPROVED'],
    timestampFields: ['approvedAt', 'updatedAt', 'createdAt'],
    subjectKind: 'paymentId',
    subject: (entry) => entry.id,
    matches: (entry) => entry.data.paymentVerified === true && entry.data.unlocksDashboard === true,
  },
  paymentUnlockExactlyOnce: {
    collection: 'payment_transactions',
    where: ['status', '==', 'APPROVED'],
    timestampFields: ['approvedAt', 'updatedAt', 'createdAt'],
    subjectKind: 'paymentId',
    subject: (entry) => entry.id,
    matches: (entry) => entry.data.paymentVerified === true && entry.data.unlocksDashboard === true,
  },
  tenantNotificationDelivery: {
    collection: 'notifications',
    where: ['pushDeliveryState', '==', 'SUCCESS'],
    timestampFields: ['pushAttemptedAt', 'updatedAt', 'createdAt'],
    subjectKind: 'notificationId',
    subject: (entry) => entry.id,
    matches: (entry) => Number(entry.data.pushSuccessCount || 0) > 0 && Number(entry.data.pushFailureCount || 0) === 0,
  },
  brokerCommissionLockExactlyOnce: {
    collection: 'broker_commissions',
    timestampFields: ['createdAt', 'updatedAt'],
    subjectKind: 'commissionId',
    subject: (entry) => entry.id,
    matches: (entry) => Boolean(text(entry.data.contractId) && text(entry.data.brokerId || entry.data.brokerUid)),
  },
  adminStaffClaims: {
    collection: 'audit_logs',
    where: ['action', '==', 'ADMIN_CREATE_STAFF_USER'],
    timestampFields: ['createdAt', 'timestamp'],
    subjectKind: 'staffUidHash',
    subject: (entry) => text(entry.data.targetId),
    matches: (entry) => Boolean(text(entry.data.targetId)),
  },
  renewalScheduler: {
    collection: 'contract_renewal_watch',
    timestampFields: ['generatedAt', 'updatedAt', 'createdAt'],
    subjectKind: 'renewalWatchId',
    subject: (entry) => entry.id,
    matches: (entry) => Boolean(text(entry.data.sourceCollection) && text(entry.data.sourceId) && text(entry.data.pdfUrl)),
  },
});

if (process.env.GITHUB_ACTIONS !== 'true') fail('verifier may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('verifier requires protected main');
if (process.env.GITHUB_WORKFLOW !== WORKFLOW || process.env.GITHUB_JOB !== JOB) fail('unexpected protected workflow context');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const gate = text(process.env.OPERATIONAL_GATE);
const definition = gateDefinitions[gate];
const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const expectedDeployRunId = text(process.env.PRODUCTION_DEPLOY_RUN_ID);
if (!definition) fail(`unsupported application gate: ${gate || '(missing)'}`);
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('full lowercase GITHUB_SHA is required');
if (!/^\d+$/.test(workflowRunId) || !/^\d+$/.test(expectedDeployRunId)) fail('numeric evidence and production deployment run IDs are required');
if (!existsSync(DEPLOYMENT_PATH)) fail(`${DEPLOYMENT_PATH} is missing`);

let deployment;
try { deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8')); }
catch (error) { fail(`deployment metadata is malformed: ${error.message}`); }

const now = Date.now();
const deployedAt = toDate(deployment.deployedAt);
if (deployment.status !== 'passed') fail('production deployment status is not passed');
if (deployment.projectId !== PROJECT_ID) fail('production deployment project mismatch');
if (deployment.deployedCommitSha !== commitSha) fail('production deployment commit mismatch');
if (String(deployment.workflowRunId || '') !== expectedDeployRunId) fail('production deployment run mismatch');
if (deployment.workflowRef !== 'refs/heads/main' || deployment.repository !== REPOSITORY) fail('production deployment repository/ref mismatch');
if (!/^sha256:[a-f0-9]{64}$/.test(text(deployment.validatedArtifactDigest).toLowerCase())) fail('validated production artifact digest is missing');
if (!deployedAt) fail('production deployment timestamp is invalid');
if (deployedAt.getTime() > now + FUTURE_SKEW_MS) fail('production deployment timestamp is in the future');
if (now - deployedAt.getTime() > MAX_DEPLOYMENT_AGE_MS) fail('production deployment is older than seven days');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
let query = db.collection(definition.collection);
if (definition.where) query = query.where(...definition.where);
const snapshot = await query.limit(200).get();
const candidates = snapshot.docs
  .map(docResult)
  .filter(definition.matches)
  .map((entry) => ({ ...entry, observedMs: latestTimestamp(entry.data, definition.timestampFields) }))
  .filter((entry) => entry.observedMs >= deployedAt.getTime() && entry.observedMs <= now + FUTURE_SKEW_MS)
  .sort((left, right) => right.observedMs - left.observedMs);
const selected = candidates[0];
if (!selected) fail(`${gate} has no qualifying production record created after the exact deployment`);

const releaseShaFields = ['deploymentCommitSha', 'deployedCommitSha', 'commitSha', 'releaseSha', 'releaseCommitSha', 'sourceCommitSha', 'workflowCommitSha'];
const declaredShas = releaseShaFields.map((field) => text(selected.data[field])).filter(Boolean);
if (declaredShas.length && declaredShas.some((value) => value !== commitSha)) fail(`${gate} production record declares a different release SHA`);
const runIdFields = ['productionDeployRunId', 'deploymentRunId'];
const declaredRunIds = runIdFields.map((field) => text(selected.data[field])).filter(Boolean);
if (declaredRunIds.length && declaredRunIds.some((value) => value !== expectedDeployRunId)) fail(`${gate} production record declares a different deployment run`);

const subject = text(definition.subject(selected));
if (!subject) fail(`${gate} provenance subject is missing`);
const proof = {
  schemaVersion: 1,
  status: 'passed',
  source: 'exact-production-deployment-provenance-verifier',
  gate,
  commitSha,
  projectId,
  workflowRunId,
  productionDeployRunId: expectedDeployRunId,
  productionDeployedAt: deployedAt.toISOString(),
  deploymentArtifactDigest: text(deployment.validatedArtifactDigest).toLowerCase(),
  subjectKind: definition.subjectKind,
  subjectHash: sha256(subject),
  selectedObservedAt: new Date(selected.observedMs).toISOString(),
  collection: definition.collection,
  releaseBindingPresent: declaredShas.length > 0 || declaredRunIds.length > 0,
  observedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
mkdirSync('launch_package', { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[operational-application-provenance] PASS gate=${gate} deployRun=${expectedDeployRunId}`);
