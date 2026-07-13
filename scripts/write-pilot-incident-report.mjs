#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitSha, PRODUCTION } from './lib/launch-honesty.mjs';
import {
  AUTHORIZED_HARD_LAUNCH_ACTORS,
  HARD_LAUNCH_CONFIRMATION_PHRASE,
  INCIDENT_CONFIRMATION_PHRASE,
  ROLLBACK_CONFIRMATION_PHRASE,
  pilotIncidentReportPath,
  validatePilotIncidentReport,
} from './lib/hard-launch-gate.mjs';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireExact(name, expected) {
  const value = requireEnv(name);
  if (value !== expected) throw new Error(`${name} confirmation mismatch`);
}

const root = process.cwd();
const commitSha = gitSha(root);
const expectedSha = requireEnv('HARD_LAUNCH_EXPECTED_SHA');
const actor = requireEnv('GITHUB_ACTOR');
const githubRef = requireEnv('GITHUB_REF');
const githubRepository = requireEnv('GITHUB_REPOSITORY');
const githubRunId = requireEnv('GITHUB_RUN_ID');

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('This report may only be generated in GitHub Actions');
if (githubRef !== 'refs/heads/main') throw new Error('This report requires refs/heads/main');
if (githubRepository !== 'rashidpvt420-lang/bin-group-super-app') throw new Error('Unexpected GitHub repository');
if (!AUTHORIZED_HARD_LAUNCH_ACTORS.includes(actor)) throw new Error(`Unauthorized actor: ${actor}`);
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('Expected SHA must be a full lowercase SHA');
if (commitSha !== expectedSha) throw new Error('Checked-out commit does not equal expected SHA');

requireExact('HARD_LAUNCH_CONFIRMATION', HARD_LAUNCH_CONFIRMATION_PHRASE);
requireExact('INCIDENT_CONFIRMATION', INCIDENT_CONFIRMATION_PHRASE);
requireExact('ROLLBACK_CONFIRMATION', ROLLBACK_CONFIRMATION_PHRASE);

const report = {
  schemaVersion: 1,
  status: 'passed',
  commitSha,
  projectId: PRODUCTION.projectId,
  pilotStartedAt: requireEnv('PILOT_STARTED_AT'),
  pilotCompletedAt: requireEnv('PILOT_COMPLETED_AT'),
  openP0: Number(requireEnv('OPEN_P0')),
  openP1: Number(requireEnv('OPEN_P1')),
  rollbackPlanVerified: true,
  monitoringVerified: true,
  incidentConfirmationVerified: true,
  rollbackConfirmationVerified: true,
  incidentReference: requireEnv('INCIDENT_REFERENCE'),
  rollbackReference: requireEnv('ROLLBACK_REFERENCE'),
  monitoringReference: requireEnv('MONITORING_REFERENCE'),
  approvedBy: actor,
  generatedAt: new Date().toISOString(),
  generatedByWorkflow: true,
  source: 'hard-public-launch-clearance-workflow',
  githubRepository,
  githubRef,
  githubRunId,
  githubRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || '1'),
  hardLaunchClaim: false,
};

const errors = validatePilotIncidentReport(report, commitSha);
if (errors.length) {
  console.error('[pilot-incident] FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const output = pilotIncidentReportPath(root);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[pilot-incident] PASS — wrote ${output}`);
