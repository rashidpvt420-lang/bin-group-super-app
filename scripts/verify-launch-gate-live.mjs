#!/usr/bin/env node
/**
 * Record one structured operational hard-launch proof in the canonical
 * Firestore record. Local text/URL attestations are intentionally rejected.
 *
 * Usage (protected Operational Proof Intake workflow only):
 * node scripts/verify-launch-gate-live.mjs <gateKey> <evidenceType> <reference> <sha256>
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import chalk from 'chalk';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { gitSha, PRODUCTION } from './lib/launch-honesty.mjs';
import { AUTHORIZED_HARD_LAUNCH_ACTORS, REQUIRED_OPERATIONAL_GATES } from './lib/hard-launch-gate.mjs';
import { validateOperationalProofDocument } from './lib/operational-proof-schema.mjs';

const gateKey = String(process.argv[2] || '').trim();
const evidenceType = String(process.argv[3] || '').trim();
const evidenceReference = String(process.argv[4] || '').trim();
const artifactHash = String(process.argv[5] || '').trim().toLowerCase();
const sourceRunId = String(process.env.SOURCE_RUN_ID || '').trim();
const sourceArtifactName = String(process.env.SOURCE_ARTIFACT_NAME || '').trim();
const allowedEvidenceTypes = new Set([
  'workflow-artifact',
  'provider-console-export',
  'production-transaction',
  'physical-device-report',
  'secret-rotation-record',
]);

function fail(message) {
  console.error(chalk.red(`❌ ${message}`));
  process.exit(1);
}

if (process.env.GITHUB_ACTIONS !== 'true') fail('Operational proof may only be recorded by GitHub Actions.');
if (process.env.GITHUB_WORKFLOW !== 'Operational Proof Intake') fail('Unexpected proof workflow.');
if (process.env.GITHUB_JOB !== 'record-operational-proof') fail('Unexpected proof job.');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('Operational proof requires refs/heads/main.');
if (process.env.GITHUB_REPOSITORY !== 'rashidpvt420-lang/bin-group-super-app') fail('Unexpected repository.');
if (!AUTHORIZED_HARD_LAUNCH_ACTORS.includes(String(process.env.GITHUB_ACTOR || ''))) fail('Unauthorized workflow actor.');
if (!REQUIRED_OPERATIONAL_GATES.includes(gateKey)) fail(`Unknown operational gate: ${gateKey}`);
if (!allowedEvidenceTypes.has(evidenceType)) fail(`Unsupported evidence type: ${evidenceType}`);
if (!/^\d+$/.test(sourceRunId)) fail('SOURCE_RUN_ID is required and must be numeric.');
if (!/^[A-Za-z0-9._-]{1,128}$/.test(sourceArtifactName)) fail('SOURCE_ARTIFACT_NAME is invalid.');
if (!/^github-actions:\/\/rashidpvt420-lang\/bin-group-super-app\/runs\/\d+\/artifacts\/[A-Za-z0-9._-]{1,128}$/.test(evidenceReference)) {
  fail('Evidence reference must identify a verified same-repository GitHub Actions artifact.');
}
if (!evidenceReference.includes(`/runs/${sourceRunId}/artifacts/${sourceArtifactName}`)) {
  fail('Evidence reference does not match the verified source run and artifact.');
}
if (!/^[0-9a-f]{64}$/.test(artifactHash)) fail('Evidence artifact hash must be a SHA-256 value.');
if (!process.env.GITHUB_RUN_ID) fail('GITHUB_RUN_ID is required.');

const commitSha = gitSha();
const expectedSha = String(process.env.HARD_LAUNCH_EXPECTED_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(expectedSha) || expectedSha !== commitSha) {
  fail('HARD_LAUNCH_EXPECTED_SHA must equal the checked-out full main SHA.');
}

const proofPath = 'downloaded-operational-proof/operational-proof.json';
const manifestPath = 'launch_package/operational-proof-manifest.json';
if (!existsSync(proofPath)) fail('Source artifact must contain operational-proof.json at its root.');
if (!existsSync(manifestPath)) fail('Recomputed operational proof manifest is missing.');

let sourceProof;
let manifest;
try {
  sourceProof = JSON.parse(readFileSync(proofPath, 'utf8'));
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`Operational proof JSON could not be parsed: ${error.message}`);
}

const proofErrors = validateOperationalProofDocument(sourceProof, {
  gateKey,
  evidenceType,
  commitSha,
  sourceRunId,
});
if (proofErrors.length) {
  console.error(chalk.red('❌ Source operational proof failed semantic validation:'));
  for (const error of proofErrors) console.error(`- ${error}`);
  process.exit(1);
}

const manifestBytes = readFileSync(manifestPath);
const recomputedManifestHash = createHash('sha256').update(manifestBytes).digest('hex');
if (recomputedManifestHash !== artifactHash) fail('Operational proof manifest hash mismatch.');
if (
  manifest.commitSha !== commitSha ||
  manifest.gateKey !== gateKey ||
  manifest.evidenceType !== evidenceType ||
  String(manifest.sourceRunId || '') !== sourceRunId ||
  manifest.sourceArtifactName !== sourceArtifactName
) {
  fail('Operational proof manifest identity mismatch.');
}
const proofFileRecord = Array.isArray(manifest.files)
  ? manifest.files.find((item) => item?.path === 'operational-proof.json')
  : null;
if (!proofFileRecord || !/^[0-9a-f]{64}$/.test(String(proofFileRecord.sha256 || ''))) {
  fail('Manifest does not include a hashed operational-proof.json record.');
}

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) fail(`Unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const docRef = db.doc('system_health/admin_summaries');

const proof = {
  status: 'passed',
  commitSha,
  projectId,
  evidenceType,
  evidenceReference,
  artifactHash,
  sourceProofHash: String(proofFileRecord.sha256),
  sourceSystem: String(sourceProof.sourceSystem),
  observedAt: String(sourceProof.observedAt),
  workflowRunId: String(process.env.GITHUB_RUN_ID),
  sourceWorkflowRunId: sourceRunId,
  workflowRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || '1'),
  verifiedBy: 'workflow',
  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
};

await docRef.update({
  [`operationalEvidence.${gateKey}`]: proof,
  operationalEvidenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  operationalEvidenceCommitSha: commitSha,
});

const saved = await docRef.get();
const savedProof = saved.get(`operationalEvidence.${gateKey}`) || {};
if (
  savedProof.status !== 'passed' ||
  savedProof.commitSha !== commitSha ||
  savedProof.artifactHash !== artifactHash ||
  savedProof.evidenceReference !== evidenceReference ||
  savedProof.sourceProofHash !== proof.sourceProofHash
) {
  fail(`Canonical Firestore read-back verification failed for ${gateKey}.`);
}

console.log(chalk.green(`✅ Recorded structured operational proof for ${gateKey}.`));
console.log(chalk.gray(`commit=${commitSha} sourceRun=${sourceRunId} hash=${artifactHash.slice(0, 12)}…`));
