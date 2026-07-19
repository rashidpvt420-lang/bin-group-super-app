#!/usr/bin/env node
/**
 * Capture the 11 hard-launch operational gates from the canonical production
 * Firestore summary. This script never creates or upgrades source evidence.
 * It only validates workflow-generated, exact-commit proof and snapshots it
 * into launch_package/operational-readiness.json for the signed launch gates.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as admin from 'firebase-admin';
import {
  PRODUCTION,
  gitSha,
} from './lib/launch-honesty.mjs';
import {
  REQUIRED_OPERATIONAL_GATES,
  operationalReadinessPath,
  validateOperationalReadinessReport,
} from './lib/hard-launch-gate.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_REF = 'refs/heads/main';
const SOURCE_DOCUMENT = 'system_health/admin_summaries';
const SOURCE_FIELD = 'hardLaunchOperationalGates';
const SHA256_RE = /^[0-9a-f]{64}$/i;
const NUMERIC_RE = /^\d+$/;

const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[operational-readiness] FAIL — ${message}`);
  process.exit(1);
};

function isoTimestamp(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Number.isFinite(Number(value?._seconds))) {
    return new Date(Number(value._seconds) * 1000).toISOString();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

if (process.env.GITHUB_ACTIONS !== 'true') fail('collector may only run in GitHub Actions');
if (text(process.env.GITHUB_REPOSITORY) !== EXPECTED_REPOSITORY) fail('unexpected GitHub repository');
if (text(process.env.GITHUB_REF) !== EXPECTED_REF) fail('collector requires refs/heads/main');

const commitSha = text(process.env.GITHUB_SHA);
const checkedOutSha = gitSha();
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const workflowRunAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 0);
if (!/^[0-9a-f]{40}$/.test(commitSha)) fail('GITHUB_SHA must be a full lowercase SHA');
if (checkedOutSha !== commitSha) fail('checked-out commit does not equal GITHUB_SHA');
if (!NUMERIC_RE.test(workflowRunId)) fail('GITHUB_RUN_ID must be numeric');
if (!Number.isInteger(workflowRunAttempt) || workflowRunAttempt < 1) fail('GITHUB_RUN_ATTEMPT must be positive');

if (!admin.apps.length) admin.initializeApp({ projectId: PRODUCTION.projectId });
const db = admin.firestore();
const snapshot = await db.doc(SOURCE_DOCUMENT).get();
if (!snapshot.exists) fail(`${SOURCE_DOCUMENT} does not exist`);

const source = snapshot.data() || {};
const sourceCommitSha = text(source.commitSha || source.deployedCommitSha);
const sourceProjectId = text(source.projectId);
const sourceUpdatedAt = isoTimestamp(source.updatedAt || source.generatedAt || source.observedAt);
const sourceGates = source[SOURCE_FIELD];
const failures = [];

if (sourceCommitSha !== commitSha) failures.push(`source commitSha ${sourceCommitSha || '(missing)'} does not equal ${commitSha}`);
if (sourceProjectId !== PRODUCTION.projectId) failures.push(`source projectId must equal ${PRODUCTION.projectId}`);
if (!sourceUpdatedAt) failures.push('source updatedAt/generatedAt/observedAt is missing or invalid');
if (!sourceGates || typeof sourceGates !== 'object' || Array.isArray(sourceGates)) {
  failures.push(`${SOURCE_DOCUMENT}.${SOURCE_FIELD} must be an object`);
}

const verifiedAt = new Date().toISOString();
const gates = {};
for (const key of REQUIRED_OPERATIONAL_GATES) {
  const gate = sourceGates?.[key];
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    failures.push(`canonical operational gate missing: ${key}`);
    continue;
  }

  const observedAt = isoTimestamp(gate.observedAt || gate.verifiedAt || gate.generatedAt);
  const sourceWorkflowRunId = text(gate.sourceWorkflowRunId || gate.workflowRunId);
  const artifactHash = text(gate.artifactHash).toLowerCase();
  const sourceProofHash = text(gate.sourceProofHash).toLowerCase();

  if (gate.status !== 'passed') failures.push(`${key}.status must equal passed`);
  if (text(gate.commitSha) !== commitSha) failures.push(`${key}.commitSha must equal current SHA`);
  if (text(gate.projectId) !== PRODUCTION.projectId) failures.push(`${key}.projectId mismatch`);
  if (gate.executionGenerated !== true) failures.push(`${key}.executionGenerated must equal true`);
  if (gate.verifiedBy !== 'workflow') failures.push(`${key}.verifiedBy must equal workflow`);
  if (gate.hardLaunchClaim === true) failures.push(`${key}.hardLaunchClaim must not be true`);
  if (!NUMERIC_RE.test(sourceWorkflowRunId)) failures.push(`${key}.sourceWorkflowRunId must be numeric`);
  if (!SHA256_RE.test(artifactHash)) failures.push(`${key}.artifactHash must be SHA-256`);
  if (!SHA256_RE.test(sourceProofHash)) failures.push(`${key}.sourceProofHash must be SHA-256`);
  if (!text(gate.evidenceReference)) failures.push(`${key}.evidenceReference is required`);
  if (!text(gate.evidenceType)) failures.push(`${key}.evidenceType is required`);
  if (!text(gate.sourceSystem)) failures.push(`${key}.sourceSystem is required`);
  if (!observedAt) failures.push(`${key}.observedAt is missing or invalid`);

  gates[key] = {
    status: gate.status,
    commitSha: text(gate.commitSha),
    projectId: text(gate.projectId),
    evidenceType: text(gate.evidenceType),
    evidenceReference: text(gate.evidenceReference),
    artifactHash,
    sourceProofHash,
    sourceSystem: text(gate.sourceSystem),
    sourceWorkflowRunId,
    executionGenerated: gate.executionGenerated === true,
    sourceRecordPath: text(gate.sourceRecordPath || `${SOURCE_DOCUMENT}.${SOURCE_FIELD}.${key}`),
    observedAt,
    workflowRunId,
    verifiedBy: 'workflow',
    verifiedAt,
    hardLaunchClaim: false,
  };
}

const report = {
  schemaVersion: 1,
  status: failures.length === 0 ? 'passed' : 'failed',
  commitSha,
  projectId: PRODUCTION.projectId,
  source: 'firestore-system-health-admin-summaries',
  sourceDocument: SOURCE_DOCUMENT,
  sourceField: SOURCE_FIELD,
  sourceUpdatedAt: sourceUpdatedAt || null,
  generatedByWorkflow: true,
  githubRepository: EXPECTED_REPOSITORY,
  githubRef: EXPECTED_REF,
  githubRunId: workflowRunId,
  githubRunAttempt: workflowRunAttempt,
  generatedAt: verifiedAt,
  gates,
  failures: [...new Set(failures)],
  hardLaunchClaim: false,
};

if (report.status === 'passed') {
  report.failures.push(...validateOperationalReadinessReport(report, commitSha));
  report.failures = [...new Set(report.failures)];
  if (report.failures.length) report.status = 'failed';
}

const output = operationalReadinessPath();
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

if (report.status !== 'passed') {
  console.error(`[operational-readiness] FAIL — wrote diagnostic ${output}`);
  for (const error of report.failures) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[operational-readiness] PASS — ${REQUIRED_OPERATIONAL_GATES.length}/${REQUIRED_OPERATIONAL_GATES.length} gates captured for ${commitSha}`);
console.log(`[operational-readiness] wrote ${output}`);
