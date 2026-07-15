import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PRODUCTION, sha256File } from '../scripts/lib/launch-honesty.mjs';
import {
  REQUIRED_OPERATIONAL_GATES,
  validateHardLaunchApprovalDocument,
  validateOperationalReadinessReport,
  validatePilotIncidentReport,
} from '../scripts/lib/hard-launch-gate.mjs';
import { validateOperationalProofDocument } from '../scripts/lib/operational-proof-schema.mjs';

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

function validOperational() {
  const gates = {};
  for (const key of REQUIRED_OPERATIONAL_GATES) {
    gates[key] = {
      status: 'passed',
      commitSha,
      projectId: PRODUCTION.projectId,
      evidenceType: key === 'technicianPhysicalGpsEvidence' ? 'physical-device-report' : 'workflow-artifact',
      evidenceReference: `github-actions://rashidpvt420-lang/bin-group-super-app/runs/654321/artifacts/${key}`,
      artifactHash: 'b'.repeat(64),
      sourceProofHash: 'c'.repeat(64),
      sourceSystem: 'github-actions-source-workflow',
      observedAt: '2026-07-12T09:55:00.000Z',
      sourceWorkflowRunId: '654321',
      workflowRunId: '123456',
      verifiedBy: 'workflow',
      verifiedAt: '2026-07-12T10:00:00.000Z',
    };
  }
  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha,
    projectId: PRODUCTION.projectId,
    source: 'firestore-system-health-admin-summaries',
    sourceDocument: 'system_health/admin_summaries',
    gates,
    fetchedAt: '2026-07-12T10:30:00.000Z',
    generatedByWorkflow: true,
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: '123456',
  };
}

function validStripeSourceProof() {
  return {
    schemaVersion: 1,
    status: 'passed',
    generatedByWorkflow: true,
    gateKey: 'stripeLiveBilling',
    evidenceType: 'production-transaction',
    commitSha,
    projectId: PRODUCTION.projectId,
    sourceRunId: '654321',
    sourceSystem: 'stripe-live-api-and-webhook',
    observedAt: '2026-07-12T10:00:00.000Z',
    checks: [
      { name: 'live charge and signed webhook', status: 'passed', reference: 'pi_live_123456' },
    ],
    provider: 'stripe',
    liveMode: true,
    currency: 'AED',
    chargeSucceeded: true,
    signedWebhookVerified: true,
    amountMatched: true,
    idempotencyVerified: true,
    transactionId: 'pi_live_123456',
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

test('operational readiness requires every current-commit provider and physical gate', () => {
  assert.deepEqual(validateOperationalReadinessReport(validOperational(), commitSha, { now }), []);

  const missing = validOperational();
  delete missing.gates.stripeLiveBilling;
  assert.ok(validateOperationalReadinessReport(missing, commitSha, { now }).includes('operational gate missing: stripeLiveBilling'));

  const stale = validOperational();
  stale.gates.appCheckEnforcement.verifiedAt = '2026-06-01T00:00:00.000Z';
  assert.ok(validateOperationalReadinessReport(stale, commitSha, { now }).some((error) => /appCheckEnforcement evidence is older/i.test(error)));

  const incomplete = validOperational();
  incomplete.gates.paymentUnlockExactlyOnce.sourceProofHash = '';
  assert.ok(validateOperationalReadinessReport(incomplete, commitSha, { now }).includes('paymentUnlockExactlyOnce.sourceProofHash must be SHA-256'));
});

test('gate-specific source proof rejects relabeled or incomplete artifacts', () => {
  assert.deepEqual(validateOperationalProofDocument(validStripeSourceProof(), {
    gateKey: 'stripeLiveBilling',
    evidenceType: 'production-transaction',
    commitSha,
    sourceRunId: '654321',
    now,
  }), []);

  const relabeled = { ...validStripeSourceProof(), gateKey: 'appCheckEnforcement' };
  const relabeledErrors = validateOperationalProofDocument(relabeled, {
    gateKey: 'stripeLiveBilling',
    evidenceType: 'production-transaction',
    commitSha,
    sourceRunId: '654321',
    now,
  });
  assert.ok(relabeledErrors.includes('gateKey mismatch'));

  const incomplete = { ...validStripeSourceProof(), signedWebhookVerified: false };
  assert.ok(validateOperationalProofDocument(incomplete, {
    gateKey: 'stripeLiveBilling',
    evidenceType: 'production-transaction',
    commitSha,
    sourceRunId: '654321',
    now,
  }).includes('signedWebhookVerified must be true'));
});

test('hard launch approval is bound to deployment, browser evidence, operations, and incident hashes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hard-launch-gate-'));
  try {
    const launchDir = path.join(root, 'launch_package');
    mkdirSync(launchDir, { recursive: true });
    const deploymentFile = path.join(launchDir, 'production-deployment.json');
    const evidenceFile = path.join(launchDir, 'launch-evidence-batch.json');
    const incidentFile = path.join(launchDir, 'pilot-incident-report.json');
    const operationalFile = path.join(launchDir, 'operational-readiness.json');
    writeFileSync(deploymentFile, '{"status":"passed"}\n');
    writeFileSync(evidenceFile, '{"records":[]}\n');
    writeFileSync(incidentFile, `${JSON.stringify(validIncident())}\n`);
    writeFileSync(operationalFile, `${JSON.stringify(validOperational())}\n`);

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
      operationalReadinessAtApproval: true,
      noOpenP0P1: true,
      rollbackPlanVerified: true,
      monitoringVerified: true,
      deploymentHash: sha256File(deploymentFile),
      evidenceBatchHash: sha256File(evidenceFile),
      incidentReportHash: sha256File(incidentFile),
      operationalReadinessHash: sha256File(operationalFile),
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
  assert.match(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.match(workflow, /run-critical-evidence\.mjs --suite all-required/);
  assert.match(workflow, /production-deployment-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /live-launch-evidence-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /verify-operational-readiness\.mjs/);
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

test('operational intake verifies source run, artifact, schema, and recomputed hash', () => {
  const workflow = readFileSync('.github/workflows/operational-proof.yml', 'utf8');
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.match(workflow, /actions\/runs\/\$\{SOURCE_RUN_ID\}/);
  assert.match(workflow, /run\.head_sha !== process\.env\.TARGET_SHA/);
  assert.match(workflow, /operational-proof-manifest\.json/);
  assert.match(workflow, /crypto\.createHash\('sha256'\)/);
  assert.match(workflow, /verify-launch-gate-live\.mjs/);
  for (const block of runBlocks(workflow)) {
    assert.doesNotMatch(block, /\$\{\{\s*inputs\./);
    assert.doesNotMatch(block, /\$\{\{\s*github\.event\.inputs\./);
  }
});

test('launch status never emits the signed final hard-launch claim', () => {
  const statusScript = readFileSync('scripts/launch-status.mjs', 'utf8');
  assert.match(statusScript, /const\s+hardLaunchClaim\s*=\s*false/);
  assert.match(statusScript, /--hard/);
  assert.doesNotMatch(statusScript, /const\s+hardLaunchClaim\s*=\s*true/);
});

test('launch-critical browser evidence cannot use mocked Firebase network routes', () => {
  const criticalSpecs = [
    'tests/e2e/business-owner.spec.ts',
    'tests/e2e/business-tenant.spec.ts',
    'tests/e2e/business-technician.spec.ts',
    'tests/e2e/business-broker.spec.ts',
    'tests/e2e/business-admin.spec.ts',
  ];
  for (const spec of criticalSpecs) {
    const source = readFileSync(spec, 'utf8');
    assert.doesNotMatch(source, /page\.route\([^\n]*(?:googleapis|firebase|firestore|storage)/i, `${spec} mocks Firebase traffic`);
    assert.doesNotMatch(source, /route\.fulfill\(/, `${spec} uses route.fulfill in launch evidence`);
  }
});

test('App Check monitor requires browser authentication before a Firestore read qualifies', () => {
  const helper = readFileSync('tests/e2e/helpers/appCheckDebug.ts', 'utf8');
  assert.match(helper, /successfulAuthResponses/);
  assert.match(helper, /firestore\\\.googleapis\\\.com\/i\.test\(url\) && authSeen/);
  assert.doesNotMatch(helper, /authSeen \|\| \/documents:/);
});

test('owner and tenant business proofs are mandatory and backend-verified', () => {
  const owner = readFileSync('tests/e2e/business-owner.spec.ts', 'utf8');
  const tenant = readFileSync('tests/e2e/business-tenant.spec.ts', 'utf8');
  assert.match(owner, /E2E_OWNER_EMAIL/);
  assert.match(owner, /waitForURL\('\*\*\/owner\//);
  assert.doesNotMatch(owner, /page\.route\(/);
  assert.match(tenant, /APPROVE, RATE & CLOSE/);
  assert.match(tenant, /maintenanceTickets/);
  assert.match(tenant, /toMatch\(\/CLOSED\\\|true\\\|APPROVED/i);
  assert.doesNotMatch(tenant, /isVisible\(\).*catch\(\(\) => false\)[\s\S]*if \(/);
});

test('canonical operational writer rejects arbitrary local boolean attestations', () => {
  const writer = readFileSync('scripts/verify-launch-gate-live.mjs', 'utf8');
  assert.match(writer, /GITHUB_ACTIONS/);
  assert.match(writer, /GITHUB_WORKFLOW/);
  assert.match(writer, /GITHUB_JOB/);
  assert.match(writer, /HARD_LAUNCH_EXPECTED_SHA/);
  assert.match(writer, /operational-proof\.json/);
  assert.match(writer, /validateOperationalProofDocument/);
  assert.match(writer, /sourceProofHash/);
  assert.match(writer, /artifactHash/);
  assert.match(writer, /operationalEvidence/);
  assert.doesNotMatch(writer, /\[gateKey\]: true/);
});
