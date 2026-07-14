#!/usr/bin/env node
/**
 * Creates launch_package/production-incidents.json from protected workflow attestation.
 *
 * This must not invent a static green fixture. All fields come from explicit
 * workflow_dispatch / environment attestations bound to the current main SHA,
 * repository, run, and actor. Incomplete or contradictory attestations fail closed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CLEAR_PHRASE = 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR';
const HOLDS_PHRASE = 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS';
const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_REF = 'refs/heads/main';
const RETRY_COOLDOWN_MS = 30 * 60 * 1000;

function fail(message) {
  console.error(`[production-incidents] FAIL — ${message}`);
  process.exit(1);
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function parseBool(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  fail(`${name} must be true or false`);
}

if (String(process.env.GITHUB_ACTIONS || '').trim() !== 'true') {
  fail('GITHUB_ACTIONS must equal true');
}

const repository = required('GITHUB_REPOSITORY');
const commitSha = required('GITHUB_SHA');
const ref = required('GITHUB_REF');
const runId = required('GITHUB_RUN_ID');
const runAttemptRaw = required('GITHUB_RUN_ATTEMPT');
const actor = required('GITHUB_ACTOR');
const workflow = required('GITHUB_WORKFLOW');
const authorizedActorsRaw = required('AUTHORIZED_FOUNDER_ACTORS');
const attestation = required('INCIDENT_ATTESTATION');
const evidenceRefsRaw = required('INCIDENT_EVIDENCE_REFS');
const requiresRollback = parseBool('INCIDENT_REQUIRES_ROLLBACK');
const lastDeploymentFailed = parseBool('INCIDENT_LAST_DEPLOYMENT_FAILED');

if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  fail('GITHUB_SHA must be a lowercase 40-character hex SHA');
}
if (repository !== EXPECTED_REPOSITORY) {
  fail(`GITHUB_REPOSITORY must equal ${EXPECTED_REPOSITORY}`);
}
if (ref !== EXPECTED_REF) {
  fail('production incident artifacts may only be produced on refs/heads/main');
}
if (!/^[1-9][0-9]*$/.test(runAttemptRaw)) {
  fail('GITHUB_RUN_ATTEMPT must be a positive integer');
}
const runAttempt = Number(runAttemptRaw);
const authorizedActors = authorizedActorsRaw
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
if (authorizedActors.length === 0) {
  fail('AUTHORIZED_FOUNDER_ACTORS must contain at least one actor');
}
if (!authorizedActors.includes(actor.toLowerCase())) {
  fail(`GITHUB_ACTOR ${actor} is not authorized to attest production incidents`);
}
if (attestation !== CLEAR_PHRASE && attestation !== HOLDS_PHRASE) {
  fail(
    `INCIDENT_ATTESTATION must be exactly ${CLEAR_PHRASE} or ${HOLDS_PHRASE}`,
  );
}

const evidenceReferences = evidenceRefsRaw
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean);
if (evidenceReferences.length === 0) {
  fail('INCIDENT_EVIDENCE_REFS must include at least one non-empty reference');
}

let activeIncidents;
try {
  activeIncidents = JSON.parse(String(process.env.INCIDENT_ACTIVE_JSON || 'null'));
} catch (error) {
  fail(`INCIDENT_ACTIVE_JSON is not valid JSON: ${error.message}`);
}
if (!Array.isArray(activeIncidents)) {
  fail('INCIDENT_ACTIVE_JSON must be a JSON array');
}
for (const [index, incident] of activeIncidents.entries()) {
  if (!incident || typeof incident !== 'object' || Array.isArray(incident)) {
    fail(`activeIncidents[${index}] must be an object`);
  }
  if (!String(incident.id || '').trim()) fail(`activeIncidents[${index}].id is required`);
  if (!String(incident.severity || '').trim()) fail(`activeIncidents[${index}].severity is required`);
  if (!String(incident.status || '').trim()) fail(`activeIncidents[${index}].status is required`);
}

const rollbackReason = String(process.env.INCIDENT_ROLLBACK_REASON || '').trim();
if (requiresRollback && !rollbackReason) {
  fail('INCIDENT_ROLLBACK_REASON is required when INCIDENT_REQUIRES_ROLLBACK=true');
}

let lastDeploymentFailedAt = null;
if (lastDeploymentFailed) {
  lastDeploymentFailedAt = String(process.env.INCIDENT_LAST_DEPLOYMENT_FAILED_AT || '').trim();
  if (!lastDeploymentFailedAt || !Number.isFinite(Date.parse(lastDeploymentFailedAt))) {
    fail('INCIDENT_LAST_DEPLOYMENT_FAILED_AT must be a valid ISO-8601 timestamp when last deployment failed');
  }
  const failedAt = Date.parse(lastDeploymentFailedAt);
  if (failedAt > Date.now()) {
    fail('INCIDENT_LAST_DEPLOYMENT_FAILED_AT must not be in the future');
  }
  if (Date.now() - failedAt < RETRY_COOLDOWN_MS) {
    fail('last production deployment is inside the 30-minute retry cooling period');
  }
}

const clearAttestation = attestation === CLEAR_PHRASE;
if (clearAttestation) {
  if (activeIncidents.length > 0) {
    fail('CLEAR attestation forbids non-empty INCIDENT_ACTIVE_JSON');
  }
  if (requiresRollback) {
    fail('CLEAR attestation forbids INCIDENT_REQUIRES_ROLLBACK=true');
  }
  if (lastDeploymentFailed) {
    fail('CLEAR attestation forbids INCIDENT_LAST_DEPLOYMENT_FAILED=true');
  }
} else if (activeIncidents.length === 0 && !requiresRollback && !lastDeploymentFailed) {
  fail('WITH_HOLDS attestation requires at least one hold (incidents, rollback, or recent deploy failure)');
}

const nowIso = new Date().toISOString();
const document = {
  schemaVersion: 1,
  source: 'protected-workflow-dispatch-attestation',
  repository,
  commitSha,
  ref,
  workflowRunId: runId,
  workflowRunAttempt: runAttempt,
  workflow,
  actor,
  updatedAt: nowIso,
  updatedBy: actor,
  attestation,
  evidenceReferences,
  activeIncidents,
  requiresRollback,
  rollbackReason: requiresRollback ? rollbackReason : null,
  lastDeploymentFailed,
  lastDeploymentFailedAt,
  lastSuccessfulDeployment: null,
  lastSuccessfulCommitSha: null,
  hardLaunchClaim: false,
};

const outPath = path.resolve('launch_package/production-incidents.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`[production-incidents] wrote ${outPath}`);
console.log(`[production-incidents] attestation=${attestation} active=${activeIncidents.length} rollback=${requiresRollback}`);
console.log('[production-incidents] this artifact does not claim hard launch; gates remain fail-closed');
