#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import {
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
  sha256File,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import { validateOperationalReadinessReport } from './lib/hard-launch-gate.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_WORKFLOW = 'Live Role Smoke Tests';
const root = process.cwd();
const gatePath = path.join(root, 'launch_package', 'launch-proof-gates.json');
const statusPath = path.join(root, 'launch_package', 'launch-status.json');
const operationalPath = path.join(root, 'launch_package', 'operational-readiness.json');
const artifactRoot = path.join(root, 'launch_package', 'artifacts');
const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const MANUAL_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function fail(message) {
  throw new Error(`[hard-public-evidence-reconcile] ${message}`);
}

function text(value) {
  return String(value || '').trim();
}

function evidenceMillis(value) {
  if (!value) return NaN;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(Number(value?._seconds))) return Number(value._seconds) * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function validPhysicalRecord(record, sourceGateId, devicePattern) {
  if (!record || typeof record !== 'object') return false;
  if (text(record.gateId) !== sourceGateId) return false;
  if (text(record.status).toLowerCase() !== 'passed') return false;
  if (text(record.evidenceLayer).toLowerCase() !== 'physical_device') return false;
  if (text(record.source).toLowerCase() !== 'admin-manual-evidence') return false;
  if (record.executionGenerated !== false || record.hardLaunchClaim !== false) return false;
  if (text(record.releaseSha).toLowerCase() !== releaseSha) return false;
  if (text(record.commitSha).toLowerCase() !== releaseSha) return false;
  if (!text(record.testerName) || !text(record.proofRef) || !text(record.recordedBy)) return false;
  const createdAtMs = evidenceMillis(record.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  if (createdAtMs > Date.now() + MAX_CLOCK_SKEW_MS) return false;
  if (Date.now() - createdAtMs > MANUAL_EVIDENCE_MAX_AGE_MS) return false;
  const device = text(record.device);
  if (!/(android|iphone|tablet|physical device)/i.test(device)) return false;
  if (/desktop/i.test(device)) return false;
  if (devicePattern && !devicePattern.test(device)) return false;
  return true;
}

function materializeManualPhysicalGate(gates, key, sourceGateId, record) {
  const [groupName, gateName] = key.split('.');
  const gate = gates?.[groupName]?.[gateName];
  if (!gate || gate.required !== true) fail(`required physical gate is missing: ${key}`);
  if (text(gate.evidenceLayerRequired) !== 'physical_device') {
    fail(`refusing to reconcile non-physical gate from device evidence: ${key}`);
  }

  mkdirSync(artifactRoot, { recursive: true });
  const safeDocId = text(record.__documentId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  const artifactName = `physical-evidence-${gateName}-${safeDocId || 'record'}.json`;
  const artifactPath = path.join(artifactRoot, artifactName);
  const relativeArtifactPath = path.relative(root, artifactPath).replace(/\\/g, '/');
  const testedAtMs = evidenceMillis(record.createdAt);
  const attestation = {
    schemaVersion: 1,
    gateKey: key,
    sourceGateId,
    releaseSha,
    controlPlaneCommitSha: controlPlaneSha,
    sourceCollection: 'launch_evidence',
    sourceDocumentId: text(record.__documentId),
    source: text(record.source),
    status: text(record.status),
    evidenceLayer: text(record.evidenceLayer),
    testerName: text(record.testerName),
    role: text(record.role),
    device: text(record.device),
    productionUrl: text(record.productionUrl),
    proofRef: text(record.proofRef),
    notes: text(record.notes),
    recordedBy: text(record.recordedBy),
    recordedByEmail: text(record.recordedByEmail),
    testedAt: new Date(testedAtMs).toISOString(),
    hardLaunchClaim: false,
  };
  writeFileSync(artifactPath, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
  const stat = statSync(artifactPath);

  gate.status = 'passed';
  gate.proof = `Protected review of exact-SHA physical-device evidence from Command Center gate ${sourceGateId}; proof reference: ${text(record.proofRef)}`;
  gate.testedBy = text(record.testerName);
  gate.testedAt = new Date(testedAtMs).toISOString();
  gate.commitSha = releaseSha;
  gate.artifactPath = relativeArtifactPath;
  gate.artifactHash = `sha256:${sha256File(artifactPath)}`;
  gate.artifactBytes = stat.size;
  gate.evidenceType = 'manual-artifact';
  gate.executionGenerated = false;
  gate.hardLaunchClaim = false;
  gate.updatedAt = new Date().toISOString();
  return key;
}

async function resolveFirestoreLocation(projectId) {
  const credential = admin.app().options.credential;
  if (!credential || typeof credential.getAccessToken !== 'function') {
    fail('Firebase Admin credential cannot resolve Firestore database metadata');
  }
  const token = await credential.getAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/%28default%29`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!response.ok) {
    fail(`Firestore database metadata lookup failed with HTTP ${response.status}`);
  }
  const metadata = await response.json();
  const locationId = text(metadata.locationId);
  if (!locationId) fail('Firestore database metadata did not include locationId');
  return locationId;
}

if (process.env.GITHUB_ACTIONS !== 'true') fail('protected GitHub Actions context is required');
if (text(process.env.GITHUB_REPOSITORY) !== EXPECTED_REPOSITORY) fail('unexpected repository');
if (text(process.env.GITHUB_REF) !== 'refs/heads/main') fail('hard clearance must run from main');
if (text(process.env.GITHUB_WORKFLOW) !== EXPECTED_WORKFLOW) fail('unexpected workflow');

const releaseSha = gitSha(root);
const expectedReleaseSha = text(process.env.HARD_LAUNCH_EXPECTED_SHA).toLowerCase();
const controlPlaneSha = text(process.env.CLEARANCE_CONTROL_PLANE_SHA).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha) || expectedReleaseSha !== releaseSha) {
  fail('frozen release SHA binding mismatch');
}
if (!/^[0-9a-f]{40}$/.test(controlPlaneSha)) fail('control-plane SHA must be a full lowercase SHA');

const evidence = readJsonSafe(evidencePath(root), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(root), null);
const operational = readJsonSafe(operationalPath, null);
const launchStatus = readJsonSafe(statusPath, null);

const deploymentErrors = validateDeploymentDocument(
  deploymentDoc,
  releaseSha,
  { requireWorkflowProvenance: true },
);
if (deploymentErrors.length) fail(`production deployment evidence invalid: ${deploymentErrors.join('; ')}`);

const pilot = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: releaseSha,
  deploymentDoc,
  root,
});
if (pilot.pilotEligible !== true || pilot.missing.length || pilot.invalid.length) {
  fail('exact-SHA protected live evidence is not pilot-eligible');
}

const operationalErrors = operational
  ? validateOperationalReadinessReport(operational, releaseSha, {
      env: { ...process.env, CONTROL_PLANE_COMMIT_SHA: controlPlaneSha },
    })
  : ['operational-readiness.json is missing'];
if (operationalErrors.length) {
  fail(`operational readiness invalid: ${operationalErrors.join('; ')}`);
}

if (
  operational?.controlPlaneCommitSha &&
  text(operational.controlPlaneCommitSha).toLowerCase() !== controlPlaneSha
) {
  fail('operational readiness control-plane SHA mismatch');
}

if (
  launchStatus?.scope !== 'hard-public-launch' ||
  text(launchStatus?.commitSha).toLowerCase() !== releaseSha ||
  launchStatus?.automationOk !== true ||
  launchStatus?.pilotEligible !== true
) {
  fail('hard launch status is not bound to the verified frozen release');
}

const billingReady =
  Array.isArray(launchStatus?.checks) &&
  launchStatus.checks.some(
    (check) => check?.name === 'firebaseDeploymentReadiness' && check?.ok === true,
  );
if (!billingReady) fail('live Firebase deployment/billing readiness proof is missing');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== EXPECTED_PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

const manualSnapshot = await db.collection('launch_evidence')
  .where('releaseSha', '==', releaseSha)
  .limit(500)
  .get();
const manualPhysicalRecords = manualSnapshot.docs
  .map((doc) => ({ __documentId: doc.id, ...(doc.data() || {}) }))
  .sort((left, right) => evidenceMillis(right.createdAt) - evidenceMillis(left.createdAt));

const summarySnapshot = await db.doc('system_health/admin_summaries').get();
const technicianPhysicalProof =
  summarySnapshot.get('operationalEvidence.technicianPhysicalGpsEvidence') || null;
const technicianPhysicalProofValid = Boolean(
  technicianPhysicalProof &&
  technicianPhysicalProof.status === 'passed' &&
  text(technicianPhysicalProof.releaseCommitSha).toLowerCase() === releaseSha &&
  text(technicianPhysicalProof.commitSha).toLowerCase() === releaseSha &&
  text(technicianPhysicalProof.controlPlaneCommitSha).toLowerCase() === controlPlaneSha &&
  text(technicianPhysicalProof.evidenceType) === 'physical-device-report' &&
  text(technicianPhysicalProof.verifiedBy) === 'workflow'
);

const functionsSource = readFileSync(path.join(root, 'functions', 'index.ts'), 'utf8');
const functionsRegion = functionsSource.match(/setGlobalOptions\(\{\s*region:\s*["']([^"']+)["']/)?.[1] || '';
if (!functionsRegion) fail('Firebase Functions region could not be resolved from the frozen release');
const firestoreLocationId = await resolveFirestoreLocation(projectId);
const privacySource = readFileSync(path.join(root, 'public', 'privacy-policy.html'), 'utf8');
for (const requiredText of [
  'property owners',
  'tenants',
  'Photos/Media:',
  'Device Data:',
  'Firebase (Google):',
  'Google Maps:',
  'OpenAI:',
  'Data Retention',
  'Request deletion of your data',
]) {
  if (!privacySource.includes(requiredText)) {
    fail(`UAE data/privacy position is missing required frozen-release wording: ${requiredText}`);
  }
}
const aiSourceSystem = text(operational?.gates?.aiProviderHealth?.sourceSystem);
if (!/gemini/i.test(aiSourceSystem) || !/openai/i.test(aiSourceSystem)) {
  fail('UAE data/privacy position could not resolve the current AI subprocessors');
}
const uaeDataPosition = {
  ok: true,
  projectId,
  functionsRegion,
  firestoreLocationId,
  aiSourceSystem,
  uaeOnshoreHostingClaim: false,
  proof:
    `Current exact-release data position reviewed: Functions region ${functionsRegion}, Firestore database location ${firestoreLocationId}, Firebase/Google Maps plus Gemini/OpenAI subprocessors, retention/deletion and owner/tenant privacy wording present. This evidence does not claim UAE-onshore hosting.`,
};

function operationalGatePassed(name) {
  const gate = operational?.gates?.[name];
  return gate?.status === 'passed' && gate?.hardLaunchClaim !== true;
}

const exactHostedProof = new Map([
  ['deploymentProof.hosting', {
    ok: true,
    proof: 'Protected exact-SHA Firebase production deployment evidence validated.',
  }],
  ['deploymentProof.functionsDeploy', {
    ok: true,
    proof: 'Protected exact-SHA Firebase Functions production deployment evidence validated.',
  }],
  ['requiredProviderGates.firebaseAuth', {
    ok: true,
    proof: 'Protected exact-SHA five-role Firebase Auth execution evidence validated.',
  }],
  ['requiredProviderGates.firestoreRules', {
    ok: true,
    proof: 'Protected exact-SHA production deployment plus live role authorization evidence validated.',
  }],
  ['requiredProviderGates.storageRules', {
    ok: true,
    proof: 'Protected exact-SHA production deployment plus live upload/read authority evidence validated.',
  }],
  ['requiredProviderGates.firebaseFunctionsLiveSmoke', {
    ok: true,
    proof: 'Protected exact-SHA operational readiness and live role callable/trigger evidence validated.',
  }],
  ['requiredProviderGates.aiVisionOrTriage', {
    ok: operationalGatePassed('aiProviderHealth'),
    proof: 'Protected exact-SHA AI provider health and signed-in production evidence validated.',
  }],
  ['requiredProviderGates.firebaseBillingPlan', {
    ok: billingReady,
    proof: 'Protected live Firebase deployment/billing readiness check passed.',
  }],
  ['requiredProviderGates.appCheckEnforcement', {
    ok: operationalGatePassed('appCheckEnforcement'),
    proof: 'Protected exact-SHA App Check enforcement evidence validated.',
  }],
  ['requiredProviderGates.uaeDataResidencyPosition', {
    ok: uaeDataPosition.ok,
    proof: uaeDataPosition.proof,
  }],
]);

let gates;
try {
  gates = JSON.parse(readFileSync(gatePath, 'utf8'));
} catch (error) {
  fail(`launch proof gates could not be read: ${error.message}`);
}

const reconciled = [];
for (const [key, evidenceProof] of exactHostedProof) {
  const [groupName, gateName] = key.split('.');
  const gate = gates?.[groupName]?.[gateName];
  if (!gate || gate.required !== true) fail(`required gate is missing: ${key}`);
  if (text(gate.evidenceLayerRequired) !== 'hosted') {
    fail(`refusing to reconcile non-hosted gate: ${key}`);
  }
  if (evidenceProof.ok !== true) fail(`protected proof did not pass for ${key}`);

  gate.status = 'passed';
  gate.proof = evidenceProof.proof;
  gate.evidenceType = 'protected-execution';
  gate.executionGenerated = true;
  gate.hardLaunchClaim = false;
  gate.commitSha = releaseSha;
  gate.releaseSha = releaseSha;
  gate.controlPlaneCommitSha = controlPlaneSha;
  gate.reconciledAt = new Date().toISOString();
  gate.reconciledByWorkflow = EXPECTED_WORKFLOW;
  reconciled.push(key);
}


const physicalGateSources = [
  { key: 'requiredProviderGates.firebaseCloudMessaging', sourceGateId: 'firebaseCloudMessaging' },
  { key: 'requiredProviderGates.googleMaps', sourceGateId: 'googleMaps' },
  { key: 'requiredProviderGates.phase1Payments', sourceGateId: 'phase1Payments' },
  { key: 'requiredDeviceGates.androidPwaSmoke', sourceGateId: 'androidPwaSmoke', devicePattern: /android/i },
  { key: 'requiredDeviceGates.iosPwaSmoke', sourceGateId: 'iosPwaSmoke', devicePattern: /iphone/i },
  {
    key: 'requiredDeviceGates.technicianGpsTracking',
    sourceGateId: 'technicianGpsAndDeniedFallback',
    requireTechnicianOperational: true,
  },
  { key: 'requiredDeviceGates.pushNotifications', sourceGateId: 'firebaseCloudMessaging' },
  { key: 'requiredDeviceGates.pdfMobileDownload', sourceGateId: 'pdfMobileDownload' },
  { key: 'requiredDeviceGates.arabicRtlAllCoreScreens', sourceGateId: 'arabicRtlAllCoreScreens' },
  { key: 'requiredDeviceGates.everyButtonWritesFirestoreOrStorage', sourceGateId: 'everyButtonWritesFirestoreOrStorage' },
  { key: 'requiredDeviceGates.logoutAllDashboards', sourceGateId: 'logoutAllDashboards' },
];

const reconciledPhysicalGates = [];
const missingPhysicalGates = [];
for (const mapping of physicalGateSources) {
  const record = manualPhysicalRecords.find((candidate) =>
    validPhysicalRecord(candidate, mapping.sourceGateId, mapping.devicePattern)
  );
  if (!record) {
    missingPhysicalGates.push(`${mapping.key} (Command Center: ${mapping.sourceGateId})`);
    continue;
  }
  if (mapping.requireTechnicianOperational && !technicianPhysicalProofValid) {
    missingPhysicalGates.push(
      `${mapping.key} (real protected technician GPS mission proof is missing)`,
    );
    continue;
  }
  reconciledPhysicalGates.push(
    materializeManualPhysicalGate(gates, mapping.key, mapping.sourceGateId, record),
  );
}

if (missingPhysicalGates.length) {
  fail(`physical-device evidence is still incomplete: ${missingPhysicalGates.join('; ')}`);
}

gates.runtimeReconciliation = {
  schemaVersion: 1,
  releaseSha,
  controlPlaneCommitSha: controlPlaneSha,
  workflow: EXPECTED_WORKFLOW,
  reconciledAt: new Date().toISOString(),
  reconciledHostedGates: reconciled,
  reconciledPhysicalGates,
  physicalDeviceGatesModified: reconciledPhysicalGates.length > 0,
  policyReviewGatesModified: true,
  hardLaunchClaim: false,
};

writeFileSync(gatePath, `${JSON.stringify(gates, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  status: 'reconciled',
  releaseSha,
  controlPlaneCommitSha: controlPlaneSha,
  reconciledHostedGates: reconciled,
  reconciledPhysicalGates,
  physicalDeviceGatesModified: reconciledPhysicalGates.length > 0,
  policyReviewGatesModified: true,
  hardLaunchClaim: false,
}, null, 2));
