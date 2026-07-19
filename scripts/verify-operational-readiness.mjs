#!/usr/bin/env node
import admin from 'firebase-admin';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { gitSha, PRODUCTION } from './lib/launch-honesty.mjs';
import {
  operationalReadinessPath,
  REQUIRED_OPERATIONAL_GATES,
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

const snap = await admin.firestore().doc('system_health/admin_summaries').get();
if (!snap.exists) throw new Error('Canonical system_health/admin_summaries record does not exist.');
const source = snap.data() || {};
const sourceGates = source.operationalEvidence && typeof source.operationalEvidence === 'object'
  ? source.operationalEvidence
  : {};

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
console.log(`[operational-readiness] PASS — wrote ${output}`);
