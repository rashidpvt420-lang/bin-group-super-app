#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const EXPECTED_BENEFICIARY = 'BIN GROUP L.L.C - S.P.C';
const EXPECTED_METHODS = ['CASH', 'CHEQUE'];
const OUTPUT_PATH = path.resolve('launch_package/phase1-manual-payment-proof.json');
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const requireValue = (name) => {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required for Phase 1 manual payment proof.`);
  return value;
};
const timestampMs = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const hashConfiguration = (configuration) => crypto.createHash('sha256').update(JSON.stringify(configuration)).digest('hex');

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Phase 1 manual payment proof requires protected GitHub Actions on refs/heads/main.');
}
if (text(process.env.DEPLOYMENT_ENVIRONMENT).toLowerCase() !== 'production') {
  throw new Error('DEPLOYMENT_ENVIRONMENT must equal production.');
}
if (text(process.env.PAYMENT_POLICY).toLowerCase() !== 'phase1-manual') {
  throw new Error('PAYMENT_POLICY must equal phase1-manual.');
}

const commitSha = requireValue('GITHUB_SHA');
const repository = requireValue('GITHUB_REPOSITORY');
const workflowRunId = requireValue('GITHUB_RUN_ID');
const releaseId = text(process.env.RELEASE_ID) || `${workflowRunId}-${text(process.env.GITHUB_RUN_ATTEMPT) || '1'}`;
const validatedArtifactDigest = requireValue('VALIDATED_ARTIFACT_DIGEST').toLowerCase().replace(/^sha256:/, '');
if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('GITHUB_SHA must be a full lowercase SHA.');
if (!/^[0-9a-f]{64}$/.test(validatedArtifactDigest)) throw new Error('VALIDATED_ARTIFACT_DIGEST must be a SHA-256 digest.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) throw new Error(`Manual payment proof must run against ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const snapshot = await admin.firestore().collection('system_payment_config').doc('current').get();
if (!snapshot.exists) throw new Error('system_payment_config/current is missing in production.');
const value = snapshot.data() || {};
if (upper(value.status) !== 'ACTIVE') throw new Error('Production payment configuration is not ACTIVE.');

const approvedMethods = Array.isArray(value.approvedMethods)
  ? [...new Set(value.approvedMethods.map(upper).filter(Boolean))].sort()
  : [];
if (JSON.stringify(approvedMethods) !== JSON.stringify([...EXPECTED_METHODS].sort())) {
  throw new Error(`Phase 1 production methods must be exactly CASH and CHEQUE; found ${approvedMethods.join(', ') || 'none'}.`);
}

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
if (!configuration.version || !configuration.effectiveAtMs) throw new Error('Payment configuration version/effective timestamp is missing.');
if (configuration.legalBeneficiary !== EXPECTED_BENEFICIARY) throw new Error('Payment beneficiary does not match BIN GROUP legal identity.');
if (configuration.currency !== 'AED') throw new Error('Phase 1 payment currency must be AED.');
if (!configuration.officeLocation) throw new Error('Cash/Cheque office location is missing.');
if (value.bankTransferEnabled === true || value.stripeEnabled === true) {
  throw new Error('Bank Transfer and Stripe must remain disabled under the Phase 1 manual policy.');
}

const proof = {
  schemaVersion: 2,
  status: 'passed',
  source: 'firebase-production-manual-payment-policy-verifier',
  paymentPolicy: 'phase1-manual',
  projectId: PROJECT_ID,
  commitSha,
  repository,
  workflowRunId,
  workflowRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
  releaseId,
  validatedArtifactDigest,
  legalBeneficiary: configuration.legalBeneficiary,
  currency: configuration.currency,
  approvedMethods,
  configVersion: configuration.version,
  configHash: hashConfiguration(configuration),
  officeLocationConfigured: true,
  bankTransferEnabled: false,
  stripeEnabled: false,
  sensitiveValuesExcluded: true,
  observedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[phase1-manual-payment-proof] PASS config=${proof.configVersion} hash=${proof.configHash.slice(0, 12)}…`);
