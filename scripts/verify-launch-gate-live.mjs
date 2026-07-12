#!/usr/bin/env node
/**
 * Record one structured operational hard-launch proof in the canonical
 * Firestore record. Local text/URL attestations are intentionally rejected.
 *
 * Usage (GitHub Actions on main only):
 * node scripts/verify-launch-gate-live.mjs <gateKey> <evidenceType> <reference> <sha256>
 */
import admin from 'firebase-admin';
import chalk from 'chalk';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { gitSha, PRODUCTION } from './lib/launch-honesty.mjs';
import { AUTHORIZED_HARD_LAUNCH_ACTORS, REQUIRED_OPERATIONAL_GATES } from './lib/hard-launch-gate.mjs';

const gateKey = String(process.argv[2] || '').trim();
const evidenceType = String(process.argv[3] || '').trim();
const evidenceReference = String(process.argv[4] || '').trim();
const artifactHash = String(process.argv[5] || '').trim().toLowerCase();
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
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('Operational proof requires refs/heads/main.');
if (process.env.GITHUB_REPOSITORY !== 'rashidpvt420-lang/bin-group-super-app') fail('Unexpected repository.');
if (!AUTHORIZED_HARD_LAUNCH_ACTORS.includes(String(process.env.GITHUB_ACTOR || ''))) fail('Unauthorized workflow actor.');
if (!REQUIRED_OPERATIONAL_GATES.includes(gateKey)) fail(`Unknown operational gate: ${gateKey}`);
if (!allowedEvidenceTypes.has(evidenceType)) fail(`Unsupported evidence type: ${evidenceType}`);
if (evidenceReference.length < 6) fail('Evidence reference is required.');
if (!/^[0-9a-f]{64}$/.test(artifactHash)) fail('Evidence artifact hash must be a SHA-256 value.');
if (!process.env.GITHUB_RUN_ID) fail('GITHUB_RUN_ID is required.');

const commitSha = gitSha();
const expectedSha = String(process.env.HARD_LAUNCH_EXPECTED_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(expectedSha) || expectedSha !== commitSha) {
  fail('HARD_LAUNCH_EXPECTED_SHA must equal the checked-out full main SHA.');
}

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) fail(`Unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

const proof = {
  status: 'passed',
  commitSha,
  projectId,
  evidenceType,
  evidenceReference,
  artifactHash,
  workflowRunId: String(process.env.GITHUB_RUN_ID),
  workflowRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || '1'),
  verifiedBy: 'workflow',
  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
};

await db.doc('system_health/admin_summaries').set({
  operationalEvidence: {
    [gateKey]: proof,
  },
  operationalEvidenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  operationalEvidenceCommitSha: commitSha,
}, { merge: true });

console.log(chalk.green(`✅ Recorded structured operational proof for ${gateKey}.`));
console.log(chalk.gray(`commit=${commitSha} run=${process.env.GITHUB_RUN_ID} hash=${artifactHash.slice(0, 12)}…`));
