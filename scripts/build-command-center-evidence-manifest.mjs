#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION,
  deploymentEvidencePath,
  evidencePath,
  findEvidence,
  readJsonSafe,
  validateDeploymentDocument,
  validateEvidenceRecord,
} from './lib/launch-honesty.mjs';

const root = process.cwd();
const repository = String(process.env.GITHUB_REPOSITORY || 'rashidpvt420-lang/bin-group-super-app').trim();
const mode = String(process.env.SOURCE_EVIDENCE_MODE || 'live-role-smoke').trim();
const releaseSha = String(process.env.SOURCE_EVIDENCE_SHA || '').trim().toLowerCase();
const workflowRunId = String(process.env.SOURCE_EVIDENCE_RUN_ID || '').trim();
const sourceArtifactName = String(process.env.SOURCE_EVIDENCE_ARTIFACT_NAME || '').trim();
const sourceArtifactDigest = String(process.env.SOURCE_EVIDENCE_ARTIFACT_DIGEST || '').trim().toLowerCase();
const outputPath = process.argv.includes('--output')
  ? String(process.argv[process.argv.indexOf('--output') + 1] || '').trim()
  : 'launch_package/command-center-evidence-manifest.json';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUN_PATTERN = /^\d+$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ALLOWED_MODES = new Set(['live-role-smoke', 'production-deployment-backfill']);

function fail(message) {
  throw new Error(`[command-center-evidence-bridge] ${message}`);
}

if (repository !== 'rashidpvt420-lang/bin-group-super-app') fail(`unexpected repository: ${repository}`);
if (!ALLOWED_MODES.has(mode)) fail(`unsupported SOURCE_EVIDENCE_MODE: ${mode}`);
if (!SHA_PATTERN.test(releaseSha)) fail('SOURCE_EVIDENCE_SHA must be a full lowercase 40-character SHA');
if (!RUN_PATTERN.test(workflowRunId)) fail('SOURCE_EVIDENCE_RUN_ID must be numeric');
if (!sourceArtifactName) fail('SOURCE_EVIDENCE_ARTIFACT_NAME is required');
if (!DIGEST_PATTERN.test(sourceArtifactDigest)) fail('SOURCE_EVIDENCE_ARTIFACT_DIGEST must be a sha256 digest');

const expectedArtifactName = mode === 'live-role-smoke'
  ? `live-launch-evidence-${releaseSha}`
  : `production-deployment-${releaseSha}-${workflowRunId}`;
if (sourceArtifactName !== expectedArtifactName) {
  fail(`source artifact name mismatch (have=${sourceArtifactName} want=${expectedArtifactName})`);
}

const batch = readJsonSafe(evidencePath(root), null);
if (!batch || !Array.isArray(batch.records)) {
  fail('launch_package/launch-evidence-batch.json is missing or malformed');
}
if (batch.hardLaunchClaim === true) fail('source evidence batch must not claim hard launch');

const strictArtifactRevalidation = mode === 'live-role-smoke';
const validated = new Map();

function requireEvidence(key) {
  if (validated.has(key)) return validated.get(key);
  const record = findEvidence(batch, key, releaseSha);
  if (!record) fail(`required exact-SHA evidence record missing: ${key}`);
  const check = validateEvidenceRecord(record, {
    commitSha: releaseSha,
    root,
    revalidateArtifact: strictArtifactRevalidation,
  });
  if (!check.ok) fail(`${key} rejected: ${check.reason}`);
  if (record.hardLaunchClaim === true) fail(`${key} may not claim hard launch`);
  validated.set(key, record);
  return record;
}

if (mode === 'production-deployment-backfill') {
  const deployment = readJsonSafe(deploymentEvidencePath(root), null);
  const deploymentErrors = validateDeploymentDocument(deployment, releaseSha, {
    root,
    requireWorkflowProvenance: true,
  });
  if (deploymentErrors.length) fail(`production deployment rejected: ${deploymentErrors.join('; ')}`);
  if (String(deployment.workflowRunId || '') !== workflowRunId) {
    fail('production deployment workflowRunId must match SOURCE_EVIDENCE_RUN_ID');
  }
  if (String(deployment.source || '') !== 'firebase-production-deploy-workflow') {
    fail('production deployment source must be firebase-production-deploy-workflow');
  }
  for (const key of [
    'productionDeployment',
    'productionMainHosting',
    'productionAdminHosting',
    'adminCredentialLogin',
    'appCheckAuthenticatedAccess',
    'businessOwner',
    'businessTenant',
    'businessTechnician',
    'businessBroker',
    'businessGlobal',
    'launchAuditLive',
  ]) {
    requireEvidence(key);
  }
}

function sourceSummary(keys) {
  return keys.map((key) => {
    const record = requireEvidence(key);
    const artifact = String(record.artifactPath || 'artifact-unavailable');
    const hash = String(record.artifactHash || '');
    return `${key}:${artifact}@sha256:${hash}`;
  }).join(' | ');
}

function proofRef(keys) {
  const runUrl = `https://github.com/${repository}/actions/runs/${workflowRunId}`;
  const value = `${runUrl} | bundle:${sourceArtifactName}@${sourceArtifactDigest} | ${sourceSummary(keys)}`;
  if (value.length > 1200) fail(`proof reference exceeds 1200 characters for ${keys.join(',')}`);
  return value;
}

const gateDefinitions = [
  {
    gateId: 'ownerOnboardingFullPath',
    gateTitle: 'Owner onboarding to dashboard unlock',
    gateGroup: 'Owner',
    role: 'owner',
    device: 'Production browser',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessOwner'],
    notes: 'Exact-SHA execution evidence proves the real Owner acquisition/onboarding lifecycle, activation state, payment evidence, Founder approval, and dashboard unlock.',
  },
  {
    gateId: 'ownerPaymentApproveReject',
    gateTitle: 'Owner payment approval and rejection paths',
    gateGroup: 'Owner',
    role: 'owner',
    device: 'Production browser + Admin MFA',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessOwner', 'adminCredentialLogin'],
    notes: 'Owner and protected Admin execution evidence jointly prove payment approval/rejection authority and owner-access activation behavior.',
  },
  {
    gateId: 'tenantPhotoMaintenanceRequest',
    gateTitle: 'Tenant request with real photo upload',
    gateGroup: 'Tenant',
    role: 'tenant',
    device: 'Production browser',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessTenant'],
    notes: 'Tenant execution evidence creates the maintenance request through the real production flow and verifies uploaded request evidence.',
  },
  {
    gateId: 'technicianMissionLifecycle',
    gateTitle: 'Technician assignment to completion lifecycle',
    gateGroup: 'Technician',
    role: 'technician',
    device: 'Production browser',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessTechnician'],
    notes: 'Technician execution evidence proves dispatch-bound assignment, mission lifecycle, work evidence, network recovery, and completion.',
  },
  {
    gateId: 'technicianGpsAndDeniedFallback',
    gateTitle: 'Technician GPS/photo permission proof',
    gateGroup: 'Technician',
    role: 'technician',
    device: 'Production browser geolocation',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessTechnician'],
    notes: 'Technician execution evidence covers production geolocation controls, denied/poor GPS safety behavior, and proof-upload handling; it does not substitute for a separate physical-device gate.',
  },
  {
    gateId: 'brokerReferralCommissionLifecycle',
    gateTitle: 'Broker referral and commission lifecycle',
    gateGroup: 'Broker',
    role: 'broker',
    device: 'Production browser + verified mailbox',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessBroker'],
    notes: 'Broker execution evidence proves lead creation, conversion, deterministic commission creation, mailbox OTP, and single-use payout behavior.',
  },
  {
    gateId: 'adminFreshLoginAndCorePages',
    gateTitle: 'Admin fresh login and core pages proof',
    gateGroup: 'Admin',
    role: 'admin',
    device: 'Production desktop browser + MFA',
    productionUrl: PRODUCTION.adminUrl,
    evidence: ['adminCredentialLogin', 'launchAuditLive'],
    notes: 'Protected Admin MFA evidence plus the live launch audit prove fresh Admin authentication and production Admin route loading.',
  },
  {
    gateId: 'adminStaffProvisioning',
    gateTitle: 'Admin staff/technician creation proof',
    gateGroup: 'Admin',
    role: 'admin',
    device: 'Production desktop browser + MFA',
    productionUrl: PRODUCTION.adminUrl,
    evidence: ['adminCredentialLogin'],
    notes: 'Protected Admin execution evidence creates staff/technician identities through the real Admin flow and validates resulting claims/profiles.',
  },
  {
    gateId: 'adminPaymentUnlockAudit',
    gateTitle: 'Admin payment review unlock and audit proof',
    gateGroup: 'Admin',
    role: 'admin',
    device: 'Production desktop browser + MFA',
    productionUrl: PRODUCTION.adminUrl,
    evidence: ['adminCredentialLogin', 'businessOwner'],
    notes: 'Protected Admin and Owner execution evidence proves approval/rejection, exactly-once activation, audit creation, and Owner dashboard unlock.',
  },
  {
    gateId: 'firebaseAuth',
    gateTitle: 'Firebase Auth - five-role login proof',
    gateGroup: 'Provider',
    role: 'admin',
    device: 'Production five-role browser suite',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['adminCredentialLogin', 'businessOwner', 'businessTenant', 'businessTechnician', 'businessBroker'],
    notes: 'All five protected role suites authenticated against live Firebase Auth on the exact deployed SHA; Admin evidence includes the enrolled second factor.',
  },
  {
    gateId: 'firebaseCloudMessaging',
    gateTitle: 'FCM / push notification proof',
    gateGroup: 'Provider',
    role: 'technician',
    device: 'Production notification lifecycle',
    productionUrl: PRODUCTION.mainUrl,
    evidence: ['businessTechnician'],
    notes: 'Technician execution evidence includes the dispatch notification delivery receipt and safe notification/permission handling exercised by the production mission lifecycle.',
  },
];

const records = gateDefinitions.map((gate) => ({
  collection: 'launch_evidence',
  gateId: gate.gateId,
  gateTitle: gate.gateTitle,
  gateGroup: gate.gateGroup,
  status: 'passed',
  testerName: 'GitHub Actions exact-SHA production evidence',
  role: gate.role,
  device: gate.device,
  productionUrl: gate.productionUrl,
  proofRef: proofRef(gate.evidence),
  notes: `${gate.notes} Source mode: ${mode}.`,
}));

const smokeDefinitions = [
  ['owner', '/owner', process.env.E2E_OWNER_MAILBOX_EMAIL || process.env.E2E_OWNER_EMAIL, 'businessOwner', 'Fresh Owner login and protected Owner business lifecycle completed on production.'],
  ['tenant', '/tenant', process.env.E2E_TENANT_EMAIL, 'businessTenant', 'Fresh Tenant login and protected Tenant maintenance lifecycle completed on production.'],
  ['technician', '/technician', process.env.E2E_TECHNICIAN_EMAIL, 'businessTechnician', 'Fresh Technician login and protected mission lifecycle completed on production.'],
  ['broker', '/broker', process.env.E2E_BROKER_MAILBOX_EMAIL || process.env.E2E_BROKER_EMAIL, 'businessBroker', 'Fresh Broker login and protected referral/commission/payout lifecycle completed on production.'],
  ['admin', '/dashboard', process.env.E2E_FOUNDER_EMAIL || process.env.E2E_ADMIN_EMAIL, 'adminCredentialLogin', 'Fresh protected Admin login completed with the enrolled Firebase second factor and protected Admin operations.'],
];

for (const [role, route, rawEmail, evidenceKey, checkpoints] of smokeDefinitions) {
  const accountEmail = String(rawEmail || '').trim().toLowerCase();
  if (!accountEmail || !accountEmail.includes('@')) {
    fail(`missing valid ${role} account email for signed-in smoke evidence`);
  }
  records.push({
    collection: 'signed_in_smoke_checks',
    role,
    status: 'passed',
    accountEmail,
    route,
    requiredRoute: route,
    checkpoints,
    proofRef: proofRef([evidenceKey]),
    notes: `Automatically bridged from verified execution-generated ${evidenceKey} evidence for ${releaseSha}. Source mode: ${mode}.`,
  });
}

const manifest = {
  schemaVersion: 2,
  releaseSha,
  workflowRunId,
  generatedAt: new Date().toISOString(),
  sourceEvidenceMode: mode,
  sourceArtifactName,
  sourceArtifactDigest,
  sourceEvidenceBatch: path.relative(root, evidencePath(root)).replace(/\\/g, '/'),
  records,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`[command-center-evidence-bridge] wrote ${records.length} trusted record(s) to ${outputPath}`);
console.log(`[command-center-evidence-bridge] launch gates=${gateDefinitions.length} smoke roles=${smokeDefinitions.length} releaseSha=${releaseSha} mode=${mode}`);
