#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { PRODUCTION, sha256File } from './lib/launch-honesty.mjs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';
import { validateOperationalProofDocument } from './lib/operational-proof-schema.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const PROOF_PATH = 'launch_package/operational-proof.json';
const CONTEXTS = Object.freeze({
  'Technician Physical Evidence': Object.freeze({
    job: 'verify-physical-evidence',
    gateKey: 'technicianPhysicalGpsEvidence',
    evidenceType: 'physical-device-report',
  }),
  'Privileged Access Rotation Evidence': Object.freeze({
    job: 'verify-rotation',
    gateKey: 'privilegedAccessRotation',
    evidenceType: 'secret-rotation-record',
  }),
});

const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  console.error(`[publish-direct-operational-proof] FAIL — ${message}`);
  process.exit(1);
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('publisher may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) fail('unexpected repository');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('publisher requires refs/heads/main');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const workflow = text(process.env.GITHUB_WORKFLOW);
const context = CONTEXTS[workflow];
if (!context || process.env.GITHUB_JOB !== context.job) fail('unexpected protected operational-evidence workflow context');

const commitSha = text(process.env.GITHUB_SHA);
const runId = text(process.env.GITHUB_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('full lowercase commit SHA is required');
if (!/^\d+$/.test(runId)) fail('numeric workflow run ID is required');
if (!existsSync(PROOF_PATH)) fail(`${PROOF_PATH} is missing`);

let proof;
try {
  proof = JSON.parse(readFileSync(PROOF_PATH, 'utf8'));
} catch (error) {
  fail(`${PROOF_PATH} is malformed: ${error.message}`);
}

const proofErrors = validateOperationalProofDocument(proof, {
  gateKey: context.gateKey,
  evidenceType: context.evidenceType,
  commitSha,
  sourceRunId: runId,
});
if (proofErrors.length) {
  for (const error of proofErrors) console.error(`- ${error}`);
  fail(`${context.gateKey} proof failed canonical semantic validation`);
}

const observedAt = new Date(text(proof.observedAt));
if (!Number.isFinite(observedAt.getTime())) fail('proof observedAt is invalid');
const artifactHash = sha256File(PROOF_PATH);
const sourceProofHash = sha256(JSON.stringify(proof));

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const ref = db.doc('system_health/admin_summaries');
const evidenceReference = `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/${runId}#${context.gateKey}`;

const record = {
  status: 'passed',
  commitSha,
  projectId,
  evidenceType: context.evidenceType,
  evidenceReference,
  artifactHash,
  sourceProofHash,
  sourceSystem: text(proof.sourceSystem),
  observedAt: admin.firestore.Timestamp.fromDate(observedAt),
  sourceWorkflowRunId: runId,
  workflowRunId: runId,
  githubRepository: EXPECTED_REPOSITORY,
  verifiedBy: 'workflow',
  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
};

await db.runTransaction(async (transaction) => {
  const snapshot = await transaction.get(ref);
  const current = snapshot.data() || {};
  transaction.set(ref, {
    operationalEvidence: {
      ...(current.operationalEvidence && typeof current.operationalEvidence === 'object'
        ? current.operationalEvidence
        : {}),
      [context.gateKey]: record,
    },
    operationalEvidenceCommitSha: commitSha,
    operationalEvidenceProjectId: projectId,
    operationalEvidenceLastWorkflowRunId: runId,
    operationalEvidenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});

const saved = await ref.get();
const savedRecord = saved.get(`operationalEvidence.${context.gateKey}`) || {};
if (
  savedRecord.status !== 'passed' ||
  savedRecord.commitSha !== commitSha ||
  savedRecord.projectId !== projectId ||
  savedRecord.evidenceType !== context.evidenceType ||
  savedRecord.evidenceReference !== evidenceReference ||
  savedRecord.artifactHash !== artifactHash ||
  savedRecord.sourceProofHash !== sourceProofHash ||
  savedRecord.githubRepository !== EXPECTED_REPOSITORY ||
  savedRecord.verifiedBy !== 'workflow'
) {
  fail(`canonical Firestore read-back verification failed for ${context.gateKey}`);
}

console.log(`[publish-direct-operational-proof] PASS gate=${context.gateKey} artifact=${artifactHash.slice(0, 12)}…`);
