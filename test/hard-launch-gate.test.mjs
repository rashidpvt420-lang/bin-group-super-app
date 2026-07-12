import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PRODUCTION, sha256File } from '../scripts/lib/launch-honesty.mjs';
import {
  validateHardLaunchApprovalDocument,
  validatePilotIncidentReport,
} from '../scripts/lib/hard-launch-gate.mjs';

const commitSha = 'a'.repeat(40);
const now = Date.parse('2026-07-12T12:00:00.000Z');

function validIncident() {
  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    pilotStartedAt: '2026-07-11T10:00:00.000Z',
    pilotCompletedAt: '2026-07-12T10:30:00.000Z',
    openP0: 0,
    openP1: 0,
    rollbackPlanVerified: true,
    monitoringVerified: true,
    incidentConfirmationVerified: true,
    rollbackConfirmationVerified: true,
    incidentReference: 'ops-log-2026-07-12',
    rollbackReference: 'rollback-runbook-v1',
    monitoringReference: 'monitoring-report-24h',
    approvedBy: 'rashidpvt420-lang',
    generatedAt: '2026-07-12T10:31:00.000Z',
    generatedByWorkflow: true,
    source: 'hard-public-launch-clearance-workflow',
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: '123456',
  };
}

function runBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)run:\s*\|\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

test('pilot incident report requires a real 24-hour window and zero P0/P1', () => {
  assert.deepEqual(validatePilotIncidentReport(validIncident(), commitSha, { now }), []);

  const bad = {
    ...validIncident(),
    pilotStartedAt: '2026-07-11T12:00:00.000Z',
    pilotCompletedAt: '2026-07-12T10:00:00.000Z',
    openP1: 1,
  };
  const errors = validatePilotIncidentReport(bad, commitSha, { now });
  assert.ok(errors.some((error) => /at least 24 hours/i.test(error)));
  assert.ok(errors.some((error) => /openP1 must equal 0/i.test(error)));
});

test('hard launch approval is bound to deployment, evidence, and incident file hashes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hard-launch-gate-'));
  try {
    const launchDir = path.join(root, 'launch_package');
    mkdirSync(launchDir, { recursive: true });
    const deploymentFile = path.join(launchDir, 'production-deployment.json');
    const evidenceFile = path.join(launchDir, 'launch-evidence-batch.json');
    const incidentFile = path.join(launchDir, 'pilot-incident-report.json');
    writeFileSync(deploymentFile, '{"status":"passed"}\n');
    writeFileSync(evidenceFile, '{"records":[]}\n');
    writeFileSync(incidentFile, `${JSON.stringify(validIncident())}\n`);

    const approval = {
      schemaVersion: 1,
      status: 'approved',
      releaseDecision: 'HARD_PUBLIC_LAUNCH_AUTHORIZED',
      hardLaunchClaim: true,
      commitSha,
      deployedCommitSha: commitSha,
      projectId: PRODUCTION.projectId,
      mainUrl: PRODUCTION.mainUrl,
      adminUrl: PRODUCTION.adminUrl,
      founderApproval: true,
      confirmationVerified: true,
      pilotEligibleAtApproval: true,
      noOpenP0P1: true,
      rollbackPlanVerified: true,
      monitoringVerified: true,
      deploymentHash: sha256File(deploymentFile),
      evidenceBatchHash: sha256File(evidenceFile),
      incidentReportHash: sha256File(incidentFile),
      approvedBy: 'rashidpvt420-lang',
      approvedAt: '2026-07-12T11:00:00.000Z',
      generatedByWorkflow: true,
      source: 'hard-public-launch-clearance-workflow',
      githubRepository: 'rashidpvt420-lang/bin-group-super-app',
      githubRef: 'refs/heads/main',
      githubRunId: '123456',
    };

    assert.deepEqual(validateHardLaunchApprovalDocument(approval, commitSha, { root, now }), []);
    writeFileSync(evidenceFile, '{"records":[{"tampered":true}]}\n');
    const errors = validateHardLaunchApprovalDocument(approval, commitSha, { root, now });
    assert.ok(errors.includes('evidenceBatchHash mismatch'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('live workflow enforces same-commit evidence and protected hard clearance', () => {
  const workflow = readFileSync('.github/workflows/live-role-smoke.yml', 'utf8');
  assert.match(workflow, /VITE_FIREBASE_APPCHECK_DEBUG_TOKEN:/);
  assert.match(workflow, /actions:\s*read/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.match(workflow, /run-critical-evidence\.mjs --suite all-required/);
  assert.match(workflow, /production-deployment-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /live-launch-evidence-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP/);
  assert.match(workflow, /NO_OPEN_P0_P1/);
  assert.match(workflow, /ROLLBACK_PLAN_VERIFIED/);
  assert.match(workflow, /CURRENT_ACTOR[^\n]*rashidpvt420-lang|rashidpvt420-lang[^\n]*CURRENT_ACTOR/);
  for (const block of runBlocks(workflow)) {
    assert.doesNotMatch(block, /\$\{\{\s*inputs\./);
    assert.doesNotMatch(block, /\$\{\{\s*github\.event\.inputs\./);
  }
});

test('launch status derives hard launch claim instead of hardcoding true', () => {
  const statusScript = readFileSync('scripts/launch-status.mjs', 'utf8');
  assert.match(statusScript, /hardLaunchClaim\s*=\s*hardLaunchEligible/);
  assert.match(statusScript, /--hard/);
  assert.doesNotMatch(statusScript, /const\s+hardLaunchClaim\s*=\s*true/);
});
