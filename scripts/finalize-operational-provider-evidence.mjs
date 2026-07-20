#!/usr/bin/env node
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { PRODUCTION } from './lib/launch-honesty.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_WORKFLOW = 'Operational Provider Evidence';
const EXPECTED_JOB = 'verify-and-publish';
const EVIDENCE_TYPES = Object.freeze({
  brandedEmailDelivery: 'workflow-artifact',
  stripeLiveBilling: 'production-transaction',
  appCheckEnforcement: 'workflow-artifact',
});

function fail(message) {
  throw new Error(`[finalize-operational-provider-evidence] ${message}`);
}

if (process.env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions context required.');
if (process.env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) fail('Repository mismatch.');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('Main branch required.');
if (process.env.GITHUB_WORKFLOW !== EXPECTED_WORKFLOW || process.env.GITHUB_JOB !== EXPECTED_JOB) fail('Protected provider workflow context required.');
if (process.env.GITHUB_ACTOR !== 'rashidpvt420-lang') fail('Authorized founder actor required.');

const gate = String(process.env.OPERATIONAL_GATE || '').trim();
const evidenceType = EVIDENCE_TYPES[gate];
if (!evidenceType) fail(`Unsupported provider gate: ${gate || '(missing)'}.`);
const commitSha = String(process.env.GITHUB_SHA || '').trim();
const runId = String(process.env.GITHUB_RUN_ID || '').trim();
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('Full lowercase commit SHA required.');
if (!/^\d+$/.test(runId)) fail('Numeric workflow run ID required.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PRODUCTION.projectId) fail(`Unexpected Firebase project: ${projectId}.`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const ref = db.doc('system_health/admin_summaries');

await db.runTransaction(async (transaction) => {
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) fail('Canonical operational evidence document is missing.');
  const current = snapshot.data() || {};
  const operationalEvidence = current.operationalEvidence && typeof current.operationalEvidence === 'object'
    ? current.operationalEvidence
    : {};
  const record = operationalEvidence[gate];
  if (!record || typeof record !== 'object') fail(`Provider publisher did not create ${gate}.`);
  if (record.status !== 'passed' || record.commitSha !== commitSha || record.projectId !== projectId) fail('Provider record identity mismatch.');
  if (String(record.sourceWorkflowRunId || '') !== runId || String(record.workflowRunId || '') !== runId) fail('Provider record workflow binding mismatch.');
  if (!/^[0-9a-f]{64}$/i.test(String(record.artifactHash || ''))) fail('Provider artifact hash is invalid.');
  if (!/^[0-9a-f]{64}$/i.test(String(record.sourceProofHash || ''))) fail('Provider source proof hash is invalid.');

  const finalized = {
    ...record,
    evidenceType,
    evidenceReference: `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/${runId}#${gate}`,
    githubRepository: EXPECTED_REPOSITORY,
    verifiedBy: 'workflow',
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  transaction.set(ref, {
    operationalEvidence: {
      ...operationalEvidence,
      [gate]: finalized,
    },
    operationalEvidenceCommitSha: commitSha,
    operationalEvidenceProjectId: projectId,
    operationalEvidenceLastWorkflowRunId: runId,
    operationalEvidenceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});

const saved = await ref.get();
const finalized = saved.get(`operationalEvidence.${gate}`) || {};
if (
  finalized.evidenceType !== evidenceType ||
  finalized.evidenceReference !== `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/${runId}#${gate}` ||
  finalized.githubRepository !== EXPECTED_REPOSITORY
) {
  fail('Canonical provider record read-back verification failed.');
}

console.log(`[finalize-operational-provider-evidence] PASS gate=${gate} evidenceType=${evidenceType}`);
