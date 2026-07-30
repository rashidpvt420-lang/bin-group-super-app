#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const EXPECTED_BENEFICIARY = 'BIN GROUP L.L.C - S.P.C';
const EXPECTED_METHODS = ['CASH', 'CHEQUE'];
const OFFICE_LOCATION = 'BIN GROUP Headquarters, Al Ain, UAE (appointment required)';
const OUTPUT_PATH = path.resolve('launch_package/phase1-manual-payment-config-bootstrap.json');
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const timestampMs = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const hashConfiguration = (configuration) => crypto.createHash('sha256').update(JSON.stringify(configuration)).digest('hex');

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Phase 1 payment configuration bootstrap requires protected GitHub Actions on refs/heads/main.');
}
if (text(process.env.DEPLOYMENT_ENVIRONMENT).toLowerCase() !== 'production') {
  throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
}
if (text(process.env.PAYMENT_POLICY).toLowerCase() !== 'phase1-manual') {
  throw new Error('PAYMENT_POLICY must equal phase1-manual.');
}

const commitSha = text(process.env.GITHUB_SHA);
const repository = text(process.env.GITHUB_REPOSITORY);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const workflowRunAttempt = text(process.env.GITHUB_RUN_ATTEMPT) || '1';
if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('GITHUB_SHA must be a full lowercase SHA.');
if (!repository || !workflowRunId) throw new Error('GitHub workflow provenance is required.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) throw new Error(`Payment configuration bootstrap must run against ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const db = admin.firestore();
const ref = db.collection('system_payment_config').doc('current');
const version = `phase1-manual-${commitSha.slice(0, 12)}`;

let changed = false;
await db.runTransaction(async (transaction) => {
  const snapshot = await transaction.get(ref);
  const current = snapshot.data() || {};
  const methods = Array.isArray(current.approvedMethods)
    ? [...new Set(current.approvedMethods.map(upper).filter(Boolean))].sort()
    : [];
  const alreadyCurrent = snapshot.exists
    && upper(current.status) === 'ACTIVE'
    && text(current.version) === version
    && text(current.legalBeneficiary || current.beneficiaryName) === EXPECTED_BENEFICIARY
    && upper(current.currency) === 'AED'
    && text(current.officeLocation || current.cashOfficeLocation) === OFFICE_LOCATION
    && JSON.stringify(methods) === JSON.stringify([...EXPECTED_METHODS].sort())
    && current.bankTransferEnabled !== true
    && current.stripeEnabled !== true;

  if (alreadyCurrent) return;
  changed = true;
  const now = admin.firestore.FieldValue.serverTimestamp();
  transaction.set(ref, {
    status: 'ACTIVE',
    policy: 'phase1-manual',
    version,
    legalBeneficiary: EXPECTED_BENEFICIARY,
    beneficiaryName: EXPECTED_BENEFICIARY,
    bankName: '',
    accountNumber: '',
    iban: '',
    swiftBic: '',
    currency: 'AED',
    officeLocation: OFFICE_LOCATION,
    cashOfficeLocation: OFFICE_LOCATION,
    approvedMethods: EXPECTED_METHODS,
    bankTransferEnabled: false,
    stripeEnabled: false,
    source: 'protected-firebase-production-deploy',
    sourceCommitSha: commitSha,
    workflowRunId,
    workflowRunAttempt,
    effectiveAt: now,
    updatedAt: now,
    ...(snapshot.exists ? {} : { createdAt: now }),
    hardLaunchClaim: false,
  }, { merge: true });
});

const verified = await ref.get();
if (!verified.exists) throw new Error('Production payment configuration was not persisted.');
const value = verified.data() || {};
const approvedMethods = Array.isArray(value.approvedMethods)
  ? [...new Set(value.approvedMethods.map(upper).filter(Boolean))].sort()
  : [];
const configuration = {
  version: text(value.version),
  effectiveAtMs: timestampMs(value.effectiveAt || value.updatedAt),
  legalBeneficiary: text(value.legalBeneficiary || value.beneficiaryName),
  bankName: '',
  accountNumber: '',
  iban: '',
  swiftBic: '',
  currency: upper(value.currency),
  officeLocation: text(value.officeLocation || value.cashOfficeLocation),
  approvedMethods,
};
if (upper(value.status) !== 'ACTIVE') throw new Error('Production payment configuration is not ACTIVE after bootstrap.');
if (configuration.version !== version || !configuration.effectiveAtMs) throw new Error('Production payment configuration version/effective timestamp is invalid.');
if (configuration.legalBeneficiary !== EXPECTED_BENEFICIARY) throw new Error('Production payment beneficiary mismatch after bootstrap.');
if (configuration.currency !== 'AED' || configuration.officeLocation !== OFFICE_LOCATION) throw new Error('Production Cash/Cheque configuration is incomplete after bootstrap.');
if (JSON.stringify(approvedMethods) !== JSON.stringify([...EXPECTED_METHODS].sort())) throw new Error('Production methods are not exactly CASH and CHEQUE after bootstrap.');
if (value.bankTransferEnabled === true || value.stripeEnabled === true) throw new Error('Phase 1 bootstrap must keep Bank Transfer and Stripe disabled.');

const evidence = {
  schemaVersion: 1,
  status: 'passed',
  source: 'ensure-phase1-manual-payment-config',
  projectId: PROJECT_ID,
  commitSha,
  repository,
  workflowRunId,
  workflowRunAttempt: Number(workflowRunAttempt),
  changed,
  configVersion: configuration.version,
  configHash: hashConfiguration(configuration),
  legalBeneficiary: configuration.legalBeneficiary,
  currency: configuration.currency,
  approvedMethods,
  officeLocationConfigured: true,
  bankTransferEnabled: false,
  stripeEnabled: false,
  sensitiveValuesExcluded: true,
  verifiedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`[phase1-payment-config] PASS version=${version} changed=${changed} hash=${evidence.configHash.slice(0, 12)}…`);
