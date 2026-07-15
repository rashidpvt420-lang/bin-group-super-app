#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validatePilotIncidentReport } from './lib/hard-launch-gate.mjs';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function resolveArtifactFile(root, fileName) {
  const candidates = [
    path.join(root, fileName),
    path.join(root, 'launch_package', fileName),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error(`Hard-clearance artifact is missing ${fileName}`);
  return match;
}

function readJson(fileName, label) {
  try {
    return JSON.parse(readFileSync(fileName, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is malformed: ${error.message}`);
  }
}

function sha256(fileName) {
  return createHash('sha256').update(readFileSync(fileName)).digest('hex');
}

const artifactRoot = path.resolve(requiredEnv('HARD_CLEARANCE_DIRECTORY'));
const expectedSha = requiredEnv('EXPECTED_COMMIT_SHA');
const expectedRunId = requiredEnv('EXPECTED_HARD_CLEARANCE_RUN_ID');
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_COMMIT_SHA must be a full lowercase SHA');
if (!/^[0-9]+$/.test(expectedRunId)) throw new Error('EXPECTED_HARD_CLEARANCE_RUN_ID must be numeric');

const incidentPath = resolveArtifactFile(artifactRoot, 'pilot-incident-report.json');
const approvalPath = resolveArtifactFile(artifactRoot, 'hard-launch-approval.json');
const deploymentPath = resolveArtifactFile(artifactRoot, 'production-deployment.json');
const evidencePath = resolveArtifactFile(artifactRoot, 'launch-evidence-batch.json');
const readinessPath = resolveArtifactFile(artifactRoot, 'operational-readiness.json');

const incident = readJson(incidentPath, 'pilot-incident-report.json');
const approval = readJson(approvalPath, 'hard-launch-approval.json');
const failures = validatePilotIncidentReport(incident, expectedSha);

if (String(incident.githubRunId || '') !== expectedRunId) {
  failures.push('pilot incident report run ID does not match the selected hard-clearance run');
}
if (
  approval.status !== 'approved' ||
  approval.releaseDecision !== 'HARD_PUBLIC_LAUNCH_PREREQUISITES_APPROVED' ||
  approval.hardLaunchClaim !== false ||
  approval.commitSha !== expectedSha ||
  approval.deployedCommitSha !== expectedSha ||
  String(approval.githubRunId || '') !== expectedRunId ||
  approval.generatedByWorkflow !== true ||
  approval.source !== 'hard-public-launch-clearance-workflow'
) {
  failures.push('hard-launch-approval.json is not bound to the selected successful run and commit');
}

for (const [field, fileName] of [
  ['deploymentHash', deploymentPath],
  ['evidenceBatchHash', evidencePath],
  ['incidentReportHash', incidentPath],
  ['operationalReadinessHash', readinessPath],
]) {
  if (approval[field] !== sha256(fileName)) failures.push(`${field} mismatch`);
}

if (failures.length) {
  console.error('[hard-clearance-artifact] FAIL');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[hard-clearance-artifact] PASS — run ${expectedRunId} is bound to ${expectedSha}`);
