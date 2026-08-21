#!/usr/bin/env node
import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { gitSha, PRODUCTION } from './lib/launch-honesty.mjs';
import {
  operationalReadinessPath,
  requiredOperationalGatesForPaymentPolicy,
  validateOperationalReadinessReport,
} from './lib/hard-launch-gate.mjs';

function timestampToIso(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  return '';
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const normalizeMethods = (value) => (
  Array.isArray(value)
    ? [...new Set(value.map(upper).filter(Boolean))].sort()
    : []
);

function canonicalPaymentConfigHash(source) {
  const approvedMethods = normalizeMethods(source.approvedMethods);
  const configuration = {
    version: text(source.version),
    effectiveAtMs: timestampToMillis(source.effectiveAt || source.updatedAt),
    legalBeneficiary: text(source.legalBeneficiary || source.beneficiaryName),
    bankName: text(source.bankName),
    accountNumber: text(source.accountNumber).replace(/\s+/g, ''),
    iban: upper(source.iban).replace(/\s+/g, ''),
    swiftBic: upper(source.swiftBic || source.swift || source.bic).replace(/\s+/g, ''),
    currency: upper(source.currency),
    officeLocation: text(source.officeLocation || source.cashOfficeLocation),
    approvedMethods,
  };
  return crypto.createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
}

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Operational hard-launch evidence may only be snapshotted by GitHub Actions.');
}
if (process.env.GITHUB_WORKFLOW !== 'Live Role Smoke Tests') {
  throw new Error('Operational readiness snapshot requires the protected Live Role Smoke Tests workflow.');
}
if (process.env.GITHUB_JOB !== 'hard-public-launch-clearance') {
  throw new Error('Operational readiness snapshot requires the protected hard-clearance job.');
}
if (process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Operational hard-launch evidence requires refs/heads/main.');
}
if (process.env.GITHUB_REPOSITORY !== 'rashidpvt420-lang/bin-group-super-app') {
  throw new Error('Unexpected GitHub repository.');
}

const root = process.cwd();
const commitSha = gitSha(root);
const expectedSha = String(process.env.HARD_LAUNCH_EXPECTED_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(expectedSha) || expectedSha !== commitSha) {
  throw new Error('HARD_LAUNCH_EXPECTED_SHA must equal the checked-out full main SHA.');
}

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) throw new Error(`Unexpected project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);

const [healthSnap, paymentConfigSnap] = await Promise.all([
  admin.firestore().doc('system_health/admin_summaries').get(),
  admin.firestore().doc('system_payment_config/current').get(),
]);
if (!healthSnap.exists) throw new Error('Canonical system_health/admin_summaries record does not exist.');
if (!paymentConfigSnap.exists) throw new Error('Canonical system_payment_config/current record does not exist.');

const source = healthSnap.data() || {};
const sourceGates = source.operationalEvidence && typeof source.operationalEvidence === 'object'
  ? source.operationalEvidence
  : {};
const paymentConfig = paymentConfigSnap.data() || {};
const paymentPolicy = text(paymentConfig.policy).toLowerCase();
const REQUIRED_OPERATIONAL_GATES = requiredOperationalGatesForPaymentPolicy(paymentPolicy);
const approvedPaymentMethods = normalizeMethods(paymentConfig.approvedMethods);
const paymentConfigHash = canonicalPaymentConfigHash(paymentConfig);

const gates = {};
for (const key of REQUIRED_OPERATIONAL_GATES) {
  const gate = sourceGates[key] || {};
  gates[key] = {
    status: String(gate.status || ''),
    commitSha: String(gate.commitSha || ''),
    projectId: String(gate.projectId || ''),
    evidenceType: String(gate.evidenceType || ''),
    evidenceReference: String(gate.evidenceReference || ''),
    artifactHash: String(gate.artifactHash || ''),
    sourceProofHash: String(gate.sourceProofHash || ''),
    sourceSystem: String(gate.sourceSystem || ''),
    observedAt: timestampToIso(gate.observedAt),
    sourceWorkflowRunId: String(gate.sourceWorkflowRunId || ''),
    workflowRunId: String(gate.workflowRunId || ''),
    githubRepository: String(gate.githubRepository || ''),
    verifiedBy: String(gate.verifiedBy || ''),
    verifiedAt: timestampToIso(gate.verifiedAt),
  };
}

const report = {
  schemaVersion: 1,
  status: 'passed',
  commitSha,
  projectId,
  source: 'firestore-system-health-admin-summaries',
  sourceDocument: 'system_health/admin_summaries',
  paymentPolicy,
  paymentConfigSourceDocument: 'system_payment_config/current',
  paymentConfigVersion: text(paymentConfig.version),
  paymentConfigHash,
  approvedPaymentMethods,
  bankTransferEnabled: paymentConfig.bankTransferEnabled === true,
  stripeEnabled: paymentConfig.stripeEnabled === true,
  gates,
  fetchedAt: new Date().toISOString(),
  generatedByWorkflow: true,
  githubRepository: process.env.GITHUB_REPOSITORY,
  githubRef: process.env.GITHUB_REF,
  githubRunId: String(process.env.GITHUB_RUN_ID || ''),
  githubRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || '1'),
};

const errors = validateOperationalReadinessReport(report, commitSha);
const output = operationalReadinessPath(root);
mkdirSync(path.dirname(output), { recursive: true });
if (errors.length) {
  report.status = 'failed';
  writeFileSync(output, `${JSON.stringify({ ...report, errors }, null, 2)}\n`);
  console.error('[operational-readiness] NO-GO');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `[operational-readiness] PASS policy=${paymentPolicy} gates=${REQUIRED_OPERATIONAL_GATES.length} paymentConfig=${report.paymentConfigVersion} hash=${paymentConfigHash.slice(0, 12)}…`,
);
console.log(`[operational-readiness] wrote ${output}`);