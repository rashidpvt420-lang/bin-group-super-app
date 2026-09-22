#!/usr/bin/env node

import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const EXPECTED_PROJECT = 'bin-group-57c60';
const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_BRIDGE_WORKFLOW = 'Public Launch Evidence Bridge';
const EXPECTED_BACKFILL_WORKFLOW = 'Public Launch Evidence Backfill';
const EXPECTED_SOURCE_WORKFLOW = 'Live Role Smoke Tests';
const EXPECTED_PRODUCTION_WORKFLOW = 'Firebase Production Deploy';
const EXPECTED_CONTROL_ISSUE = 434;
const EXPECTED_OWNER = 'rashidpvt420-lang';

const ALLOWED_COLLECTIONS = new Set(['launch_evidence', 'signed_in_smoke_checks']);
const ALLOWED_STATUSES = new Set(['pending', 'passed', 'blocked', 'waived']);
const ALLOWED_GROUPS = new Set(['Owner', 'Tenant', 'Technician', 'Broker', 'Admin', 'Provider', 'Device', 'Business', 'Role Buttons']);
const ALLOWED_ROLES = new Set(['admin', 'owner', 'tenant', 'technician', 'broker']);

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RUN_ID_PATTERN = /^\d+$/;
const PROD_URL_PATTERN = /^https:\/\/(bin-group-57c60|bin-group-admin-panel)\.web\.app(?:\/.*)?$/;

function fail(message) {
  throw new Error(`[launch-evidence-publisher] ${message}`);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return String(process.argv[index + 1] || '').trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function evidenceHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function cleanString(value, name, maxLength, { required = true } = {}) {
  const normalized = String(value ?? '').trim();
  if (required && !normalized) fail(`${name} is required`);
  if (normalized.length > maxLength) fail(`${name} exceeds ${maxLength} characters`);
  return normalized;
}

function validateLaunchRecord(record, releaseSha, workflowRunId) {
  const status = cleanString(record.status, 'status', 32);
  if (!ALLOWED_STATUSES.has(status)) fail(`invalid launch status: ${status}`);
  const gateGroup = cleanString(record.gateGroup, 'gateGroup', 64);
  if (!ALLOWED_GROUPS.has(gateGroup)) fail(`invalid launch gate group: ${gateGroup}`);
  const role = cleanString(record.role, 'role', 32);
  if (!ALLOWED_ROLES.has(role)) fail(`invalid role: ${role}`);
  const productionUrl = cleanString(record.productionUrl, 'productionUrl', 512);
  if (!PROD_URL_PATTERN.test(productionUrl)) fail(`invalid BIN GROUP production URL: ${productionUrl}`);
  const notes = cleanString(record.notes, 'notes', 5000, { required: false });
  if (status === 'waived' && !notes) fail('waived launch evidence requires a notes/reason field');

  return {
    schemaVersion: 3,
    source: 'github-actions',
    evidenceLayer: 'hosted',
    executionGenerated: true,
    hardLaunchClaim: false,
    gateId: cleanString(record.gateId, 'gateId', 120),
    gateTitle: cleanString(record.gateTitle, 'gateTitle', 240),
    gateGroup,
    status,
    testerName: cleanString(record.testerName, 'testerName', 160),
    role,
    device: cleanString(record.device, 'device', 120),
    productionUrl,
    releaseSha,
    workflowRunId,
    proofRef: cleanString(record.proofRef, 'proofRef', 1200),
    notes,
  };
}

function validateSmokeRecord(record, releaseSha, workflowRunId) {
  const role = cleanString(record.role, 'role', 32);
  if (!ALLOWED_ROLES.has(role)) fail(`invalid smoke role: ${role}`);
  const status = cleanString(record.status, 'status', 32);
  if (!ALLOWED_STATUSES.has(status)) fail(`invalid smoke status: ${status}`);
  const notes = cleanString(record.notes, 'notes', 5000, { required: false });
  if (status === 'waived' && !notes) fail('waived smoke evidence requires a notes/reason field');

  return {
    schemaVersion: 3,
    source: 'github-actions',
    evidenceLayer: 'hosted',
    executionGenerated: true,
    hardLaunchClaim: false,
    role,
    status,
    accountEmail: cleanString(record.accountEmail, 'accountEmail', 320).toLowerCase(),
    route: cleanString(record.route, 'route', 240),
    requiredRoute: cleanString(record.requiredRoute, 'requiredRoute', 240),
    checkpoints: cleanString(record.checkpoints, 'checkpoints', 2000),
    proofRef: cleanString(record.proofRef, 'proofRef', 1200),
    notes,
    releaseSha,
    workflowRunId,
  };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('manifest must be a JSON object');
  if (manifest.schemaVersion !== 2) fail('manifest schemaVersion must equal 2');

  const releaseSha = cleanString(manifest.releaseSha, 'releaseSha', 40).toLowerCase();
  if (!SHA_PATTERN.test(releaseSha)) fail('releaseSha must be a full lowercase 40-character SHA');

  const workflowRunId = cleanString(manifest.workflowRunId, 'workflowRunId', 32);
  if (!RUN_ID_PATTERN.test(workflowRunId)) fail('workflowRunId must be numeric');

  if (!Array.isArray(manifest.records) || manifest.records.length === 0) {
    fail('manifest.records must contain at least one evidence record');
  }
  if (manifest.records.length > 100) fail('manifest.records exceeds the 100-record safety limit');

  const records = manifest.records.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`records[${index}] must be an object`);
    const collection = cleanString(raw.collection, `records[${index}].collection`, 64);
    if (!ALLOWED_COLLECTIONS.has(collection)) {
      fail(`records[${index}] targets unsupported collection: ${collection}`);
    }

    const payload = collection === 'launch_evidence'
      ? validateLaunchRecord(raw, releaseSha, workflowRunId)
      : validateSmokeRecord(raw, releaseSha, workflowRunId);

    const hash = evidenceHash(payload);
    if (!HASH_PATTERN.test(hash)) fail(`records[${index}] evidence hash generation failed`);
    return { collection, payload: { ...payload, evidenceHash: hash } };
  });

  return { releaseSha, workflowRunId, records };
}

function readEventPayload() {
  const eventPath = String(process.env.GITHUB_EVENT_PATH || '').trim();
  if (!eventPath || !existsSync(eventPath)) fail('protected publication requires GITHUB_EVENT_PATH');
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch (error) {
    fail(`could not parse GitHub event: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

function enforceWorkflowRunContext(validated) {
  if (String(process.env.GITHUB_WORKFLOW || '').trim() !== EXPECTED_BRIDGE_WORKFLOW) {
    fail(`workflow_run publication is restricted to ${EXPECTED_BRIDGE_WORKFLOW}`);
  }

  const event = readEventPayload();
  const sourceRun = event?.workflow_run;
  if (!sourceRun || typeof sourceRun !== 'object') fail('workflow_run payload is missing workflow_run');
  if (String(sourceRun.name || '') !== EXPECTED_SOURCE_WORKFLOW) {
    fail(`source workflow must equal ${EXPECTED_SOURCE_WORKFLOW}`);
  }
  if (String(sourceRun.event || '') !== 'workflow_dispatch') fail('source workflow event must be workflow_dispatch');
  if (String(sourceRun.conclusion || '') !== 'success') fail('source workflow conclusion must be success');
  if (String(sourceRun.head_branch || '') !== 'main') fail('source workflow head_branch must be main');

  const sourceSha = String(sourceRun.head_sha || '').trim().toLowerCase();
  const sourceRunId = String(sourceRun.id || '').trim();
  if (!SHA_PATTERN.test(sourceSha) || sourceSha !== validated.releaseSha) {
    fail('source workflow head_sha must exactly match manifest releaseSha');
  }
  if (!RUN_ID_PATTERN.test(sourceRunId) || sourceRunId !== validated.workflowRunId) {
    fail('source workflow id must exactly match manifest workflowRunId');
  }
}

function enforceIssueCommentBackfillContext(validated) {
  if (String(process.env.GITHUB_WORKFLOW || '').trim() !== EXPECTED_BACKFILL_WORKFLOW) {
    fail(`issue_comment publication is restricted to ${EXPECTED_BACKFILL_WORKFLOW}`);
  }

  const event = readEventPayload();
  if (Number(event?.issue?.number) !== EXPECTED_CONTROL_ISSUE) {
    fail(`backfill command must originate from issue #${EXPECTED_CONTROL_ISSUE}`);
  }
  if (event?.issue?.pull_request) fail('backfill command must originate from the launch-control issue, not a pull request');

  const commenter = String(event?.comment?.user?.login || '').trim();
  const association = String(event?.comment?.author_association || '').trim();
  if (commenter !== EXPECTED_OWNER || association !== 'OWNER') {
    fail('backfill command must be authored by the repository owner with OWNER association');
  }

  const expectedCommand = `/bin-launch publish-command-center-evidence ${validated.releaseSha} ${validated.workflowRunId}`;
  if (String(event?.comment?.body || '').trim() !== expectedCommand) {
    fail('issue comment does not exactly match the protected evidence publication command');
  }

  const mode = String(process.env.SOURCE_EVIDENCE_MODE || '').trim();
  const sourceSha = String(process.env.SOURCE_EVIDENCE_SHA || '').trim().toLowerCase();
  const sourceRunId = String(process.env.SOURCE_EVIDENCE_RUN_ID || '').trim();
  const sourceWorkflow = String(process.env.SOURCE_EVIDENCE_WORKFLOW || '').trim();
  const artifactName = String(process.env.SOURCE_EVIDENCE_ARTIFACT_NAME || '').trim();
  const artifactDigest = String(process.env.SOURCE_EVIDENCE_ARTIFACT_DIGEST || '').trim().toLowerCase();
  const sourceVerified = String(process.env.SOURCE_EVIDENCE_VERIFIED || '').trim();

  if (mode !== 'production-deployment-backfill') fail('backfill publication requires production-deployment-backfill mode');
  if (sourceWorkflow !== EXPECTED_PRODUCTION_WORKFLOW) fail(`source workflow must equal ${EXPECTED_PRODUCTION_WORKFLOW}`);
  if (sourceSha !== validated.releaseSha || sourceRunId !== validated.workflowRunId) {
    fail('verified production source must match manifest SHA and workflow run ID');
  }
  if (artifactName !== `production-deployment-${validated.releaseSha}-${validated.workflowRunId}`) {
    fail('verified production artifact name does not match exact SHA/run binding');
  }
  if (!DIGEST_PATTERN.test(artifactDigest)) fail('verified production artifact digest is missing or malformed');
  if (sourceVerified !== 'true') fail('SOURCE_EVIDENCE_VERIFIED must be true');
}

function enforceProtectedWriteContext(validated) {
  if (process.env.GITHUB_ACTIONS !== 'true') fail('--write is permitted only from GitHub Actions');

  const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (repository !== EXPECTED_REPOSITORY) fail(`GITHUB_REPOSITORY must equal ${EXPECTED_REPOSITORY}`);

  const projectId = String(process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || EXPECTED_PROJECT).trim();
  if (projectId !== EXPECTED_PROJECT) fail(`Firebase project must equal ${EXPECTED_PROJECT}`);

  const eventName = String(process.env.GITHUB_EVENT_NAME || '').trim();
  if (eventName === 'workflow_run') {
    enforceWorkflowRunContext(validated);
    return;
  }
  if (eventName === 'issue_comment') {
    enforceIssueCommentBackfillContext(validated);
    return;
  }

  if (process.env.GITHUB_REF !== 'refs/heads/main') fail('--write is permitted only for refs/heads/main');
  const githubSha = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
  if (!SHA_PATTERN.test(githubSha) || githubSha !== validated.releaseSha) {
    fail('GITHUB_SHA must exactly match manifest releaseSha');
  }
  const githubRunId = String(process.env.GITHUB_RUN_ID || '').trim();
  if (!RUN_ID_PATTERN.test(githubRunId) || githubRunId !== validated.workflowRunId) {
    fail('GITHUB_RUN_ID must exactly match manifest workflowRunId');
  }
}

async function publish(validated) {
  if (!getApps().length) {
    initializeApp({ projectId: EXPECTED_PROJECT, credential: applicationDefault() });
  }
  const db = getFirestore();
  const actor = String(process.env.GITHUB_ACTOR || 'github-actions[bot]').trim();
  const repository = String(process.env.GITHUB_REPOSITORY || EXPECTED_REPOSITORY).trim();
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || '1').trim();

  const batch = db.batch();
  for (const record of validated.records) {
    const deterministicId = crypto.createHash('sha256').update([
      validated.releaseSha,
      validated.workflowRunId,
      record.collection,
      record.payload.gateId || record.payload.role,
      record.payload.evidenceHash,
    ].join('|')).digest('hex');

    const ref = db.collection(record.collection).doc(deterministicId);
    batch.create(ref, {
      ...record.payload,
      repository,
      workflowRunAttempt: runAttempt,
      recordedBy: actor,
      recordedByEmail: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/already exists|ALREADY_EXISTS/i.test(message)) {
      console.log(`[launch-evidence-publisher] exact evidence already published for ${validated.releaseSha} run ${validated.workflowRunId}; idempotent no-op`);
      return;
    }
    throw error;
  }

  console.log(`[launch-evidence-publisher] published ${validated.records.length} append-only record(s) for ${validated.releaseSha} run ${validated.workflowRunId}`);
}

async function main() {
  const manifestPath = argumentValue('--manifest') || String(process.env.LAUNCH_EVIDENCE_MANIFEST || '').trim();
  if (!manifestPath) fail('provide --manifest <path> or LAUNCH_EVIDENCE_MANIFEST');
  if (!existsSync(manifestPath)) fail(`manifest does not exist: ${manifestPath}`);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`could not parse manifest JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  const validated = validateManifest(manifest);
  const writeRequested = process.argv.includes('--write');

  if (!writeRequested) {
    console.log(JSON.stringify({
      status: 'dry-run',
      releaseSha: validated.releaseSha,
      workflowRunId: validated.workflowRunId,
      evidenceLayer: 'hosted',
      recordCount: validated.records.length,
      collections: [...new Set(validated.records.map((record) => record.collection))],
      evidenceHashes: validated.records.map((record) => record.payload.evidenceHash),
    }, null, 2));
    return;
  }

  enforceProtectedWriteContext(validated);
  await publish(validated);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});