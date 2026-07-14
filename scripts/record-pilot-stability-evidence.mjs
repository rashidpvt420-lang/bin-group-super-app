#!/usr/bin/env node
/**
 * Convert a validated 24+ hour controlled-pilot incident report into the
 * pilot_no_p0_p1 evidence record consumed by the postdeploy public-release gate.
 *
 * The source report is generated only by write-pilot-incident-report.mjs inside
 * the protected production workflow and is bound to the current main commit.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION,
  gitSha,
  readJsonSafe,
  sha256File,
  upsertEvidenceRecord,
} from './lib/launch-honesty.mjs';
import {
  pilotIncidentReportPath,
  validatePilotIncidentReport,
} from './lib/hard-launch-gate.mjs';

const root = process.cwd();
const commitSha = String(process.env.GITHUB_SHA || gitSha(root)).trim();
const reportPath = pilotIncidentReportPath(root);

if (process.env.GITHUB_ACTIONS !== 'true') {
  console.error('[pilot-evidence] This evidence may only be generated in GitHub Actions.');
  process.exit(1);
}
if (process.env.GITHUB_REF !== 'refs/heads/main') {
  console.error('[pilot-evidence] refs/heads/main is required.');
  process.exit(1);
}
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  console.error('[pilot-evidence] Current commit SHA is invalid.');
  process.exit(1);
}
if (!existsSync(reportPath)) {
  console.error('[pilot-evidence] pilot-incident-report.json is missing.');
  process.exit(1);
}

const report = readJsonSafe(reportPath, null);
const errors = validatePilotIncidentReport(report, commitSha);
if (errors.length) {
  console.error('[pilot-evidence] Pilot report is not launch-clear:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const artifactHash = sha256File(reportPath);
const artifactPath = path.relative(root, reportPath).replace(/\\/g, '/');
upsertEvidenceRecord(root, {
  testName: 'pilot_no_p0_p1',
  suiteName: 'controlled-pilot-stability',
  source: 'record-pilot-stability-evidence',
  executionGenerated: true,
  exitCode: 0,
  commitSha,
  mainUrl: PRODUCTION.mainUrl,
  adminUrl: PRODUCTION.adminUrl,
  startedAt: report.pilotStartedAt,
  finishedAt: report.pilotCompletedAt,
  passed: 1,
  failed: 0,
  skipped: 0,
  artifactPath,
  artifactHash,
  openP0: Number(report.openP0),
  openP1: Number(report.openP1),
  incidentReference: report.incidentReference,
  rollbackReference: report.rollbackReference,
  monitoringReference: report.monitoringReference,
  proof: `Controlled pilot completed for at least 24 hours with openP0=0 and openP1=0 for commit ${commitSha.slice(0, 8)}.`,
  hardLaunchClaim: false,
});

console.log(`[pilot-evidence] PASS — recorded pilot_no_p0_p1 for ${commitSha}`);
