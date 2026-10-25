import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitSha, PRODUCTION } from '../../scripts/lib/launch-honesty.mjs';
import { requiredOperationalGatesForPaymentPolicy } from '../../scripts/lib/hard-launch-gate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GUARD = path.join(repoRoot, 'scripts/hard-launch-operational-decision-gate.mjs');
const DECISION = path.join(repoRoot, 'scripts/hard-launch-decision-gate.mjs');
const CONTROL_SHA = 'a'.repeat(40);
const FROZEN_SHA = 'b'.repeat(40);
const RUN_ID = '930000';

const evidenceTypes = {
  ownerPaymentActivation: 'production-transaction',
  paymentUnlockExactlyOnce: 'production-transaction',
  tenantNotificationDelivery: 'production-transaction',
  technicianPhysicalGpsEvidence: 'physical-device-report',
  brokerCommissionLockExactlyOnce: 'production-transaction',
  adminStaffClaims: 'workflow-artifact',
  appCheckEnforcement: 'workflow-artifact',
  aiProviderHealth: 'workflow-artifact',
  privilegedAccessRotation: 'secret-rotation-record',
  brandedEmailDelivery: 'workflow-artifact',
  renewalScheduler: 'scheduler-run',
};
const sourceSystems = {
  ownerPaymentActivation: 'Firebase payment activation transaction',
  paymentUnlockExactlyOnce: 'Firebase adminApprovePayment replay verifier',
  tenantNotificationDelivery: 'Firebase notificationDelivery FCM trigger',
  technicianPhysicalGpsEvidence: 'Firebase technician lifecycle, device binding and Cloud Storage',
  brokerCommissionLockExactlyOnce: 'Firebase broker commission transaction and payment replay',
  adminStaffClaims: 'Firebase Auth and staff registries',
  appCheckEnforcement: 'Firebase App Check enforcement',
  aiProviderHealth: 'Firebase Sovereign AI callable with Gemini and OpenAI',
  privilegedAccessRotation: 'Google Secret Manager and Firebase Authentication',
  brandedEmailDelivery: 'Postmark email delivery',
  renewalScheduler: 'Firebase contract renewal watcher',
};

function operationalReport(sha, overrides = {}) {
  const at = (ms) => new Date(Date.now() - ms).toISOString();
  const gates = {};
  requiredOperationalGatesForPaymentPolicy('phase1-manual').forEach((key, index) => {
    const sourceRunId = String(910000 + index);
    gates[key] = {
      status: 'passed',
      commitSha: sha,
      releaseCommitSha: sha,
      controlPlaneCommitSha: CONTROL_SHA,
      projectId: PRODUCTION.projectId,
      evidenceType: evidenceTypes[key],
      evidenceReference: `https://github.com/rashidpvt420-lang/bin-group-super-app/actions/runs/${sourceRunId}`,
      artifactHash: (index + 1).toString(16).padStart(64, '0'),
      sourceProofHash: (index + 101).toString(16).padStart(64, '0'),
      sourceSystem: sourceSystems[key],
      observedAt: at(2 * 60 * 60 * 1000),
      sourceWorkflowRunId: sourceRunId,
      workflowRunId: String(920000 + index),
      githubRepository: 'rashidpvt420-lang/bin-group-super-app',
      verifiedBy: 'workflow',
      verifiedAt: at(110 * 60 * 1000),
    };
  });
  return {
    schemaVersion: 1,
    status: 'passed',
    commitSha: sha,
    releaseCommitSha: sha,
    controlPlaneCommitSha: CONTROL_SHA,
    projectId: PRODUCTION.projectId,
    source: 'firestore-system-health-admin-summaries',
    sourceDocument: 'system_health/admin_summaries',
    paymentPolicy: 'phase1-manual',
    paymentConfigSourceDocument: 'system_payment_config/current',
    paymentConfigVersion: 'phase1-manual-test',
    paymentConfigHash: 'f'.repeat(64),
    approvedPaymentMethods: ['CASH', 'CHEQUE'],
    bankTransferEnabled: false,
    stripeEnabled: false,
    gates,
    fetchedAt: at(100 * 60 * 1000),
    generatedByWorkflow: true,
    githubRepository: 'rashidpvt420-lang/bin-group-super-app',
    githubRef: 'refs/heads/main',
    githubRunId: RUN_ID,
    ...overrides,
  };
}

function fixture({ report, proof = {} }) {
  const root = mkdtempSync(path.join(tmpdir(), 'frozen-operational-'));
  mkdirSync(path.join(root, 'hard_clearance'), { recursive: true });
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  writeFileSync(path.join(root, 'hard_clearance/operational-readiness.json'), JSON.stringify(report));
  writeFileSync(
    path.join(root, 'hard_clearance/hard-clearance-production-revalidation.json'),
    JSON.stringify({ releaseCommitSha: FROZEN_SHA, controlPlaneCommitSha: CONTROL_SHA, controlPlaneScopeVerified: true, ...proof }),
  );
  writeFileSync(
    path.join(root, 'launch_package/public-release-status.json'),
    JSON.stringify({ status: 'passed', publicReleaseCleared: true, paymentPolicy: 'phase1-manual' }),
  );
  return root;
}

function runGuard(root, env = {}) {
  const result = spawnSync(process.execPath, [GUARD], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_ACTIONS: 'true',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
      GITHUB_SHA: CONTROL_SHA,
      AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang',
      LAUNCH_MODE: 'public',
      ...env,
    },
  });
  return `${result.stdout}\n${result.stderr}`;
}

const frozenEnv = (overrides = {}) => ({
  FROZEN_RELEASE_SHA: FROZEN_SHA,
  HARD_CLEARANCE_RUN_ID: RUN_ID,
  HARD_CLEARANCE_DIRECTORY: 'hard_clearance',
  ...overrides,
});

function withFixture(options, callback) {
  const root = fixture(options);
  try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const BOUND = /\[hard-launch-operational-decision\] bound \d+ protected gates/;

test('frozen readiness bound to frozen release + this control plane passes the operational guard', () => {
  withFixture({ report: operationalReport(FROZEN_SHA) }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.match(out, BOUND, out);
    const status = JSON.parse(readFileSync(path.join(root, 'launch_package/public-release-status.json'), 'utf8'));
    assert.equal(status.operationalReadinessVerified, true);
  });
});

test('frozen readiness with pilot control-plane gates passes the operational guard', () => {
  const PILOT_CONTROL_SHA = 'e'.repeat(40);
  const report = operationalReport(FROZEN_SHA);
  for (const gate of Object.values(report.gates)) {
    gate.controlPlaneCommitSha = PILOT_CONTROL_SHA;
  }
  withFixture({ report }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.match(out, BOUND, out);
    const status = JSON.parse(readFileSync(path.join(root, 'launch_package/public-release-status.json'), 'utf8'));
    assert.equal(status.operationalReadinessVerified, true);
  });
});

test('wrong frozen SHA fails the operational guard', () => {
  withFixture({ report: operationalReport(FROZEN_SHA) }, (root) => {
    const out = runGuard(root, frozenEnv({ FROZEN_RELEASE_SHA: 'c'.repeat(40) }));
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /frozen release SHA does not equal the verified hard-clearance releaseCommitSha/);
    assert.match(out, /operational readiness commitSha must equal current commit SHA/);
  });
});

test('mismatched or missing readiness control plane fails the operational guard', () => {
  withFixture({ report: operationalReport(FROZEN_SHA, { controlPlaneCommitSha: 'd'.repeat(40) }) }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /controlPlaneCommitSha must equal GITHUB_SHA/);
  });
  withFixture({ report: operationalReport(FROZEN_SHA, { controlPlaneCommitSha: undefined }) }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /controlPlaneCommitSha must equal GITHUB_SHA/);
  });
  withFixture({ report: operationalReport(FROZEN_SHA), proof: { controlPlaneCommitSha: 'd'.repeat(40) } }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /hard-clearance controlPlaneCommitSha does not equal GITHUB_SHA/);
  });
});

test('readiness from another hard-clearance run or wrong releaseCommitSha fails', () => {
  withFixture({ report: operationalReport(FROZEN_SHA, { githubRunId: '1' }) }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /githubRunId must equal the verified HARD_CLEARANCE_RUN_ID/);
  });
  withFixture({ report: operationalReport(FROZEN_SHA, { releaseCommitSha: CONTROL_SHA }) }, (root) => {
    const out = runGuard(root, frozenEnv());
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /releaseCommitSha must equal FROZEN_RELEASE_SHA/);
  });
});

test('legacy path (no frozen SHA) is unchanged: readiness must equal GITHUB_SHA', () => {
  withFixture({ report: operationalReport(FROZEN_SHA) }, (root) => {
    const out = runGuard(root);
    assert.doesNotMatch(out, BOUND);
    assert.match(out, /operational readiness commitSha must equal current commit SHA/);
  });
  withFixture({ report: operationalReport(CONTROL_SHA) }, (root) => {
    const out = runGuard(root);
    assert.match(out, BOUND, out);
  });
});

test('signed decision gate validates the pilot report against the frozen release only via the binding helper', () => {
  const source = readFileSync(DECISION, 'utf8');
  assert.match(source, /frozenReleaseShaFromEnv\(process\.env\) === null/);
  assert.match(source, /validatePilotIncidentReport\(pilotIncidentReport, context\.commitSha\)/);
  assert.match(source, /verifyFrozenReleaseContext\(\{ env: process\.env \}\)/);
  assert.match(source, /validatePilotIncidentReport\(pilotIncidentReport, frozen\.frozenSha\)/);
  assert.match(source, /frozenDocumentBindingErrors\(pilotIncidentReport, 'pilot incident report', frozen\)/);
  assert.match(source, /failures\.push\(\.\.\.frozen\.errors\)/);
});

test('verify-operational-readiness rejects arbitrary LIVE_EVIDENCE_CONTROL_PLANE_SHA without provenance', () => {
  const currentSha = gitSha(repoRoot);
  const SCRIPT = path.join(repoRoot, 'scripts/verify-operational-readiness.mjs');
  const res = spawnSync(process.execPath, [SCRIPT], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Live Role Smoke Tests',
      GITHUB_JOB: 'hard-public-launch-clearance',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
      GITHUB_SHA: currentSha,
      HARD_LAUNCH_EXPECTED_SHA: currentSha,
      CONTROL_PLANE_COMMIT_SHA: currentSha,
      LIVE_EVIDENCE_CONTROL_PLANE_SHA: 'f'.repeat(40),
    },
  });
  const output = `${res.stdout}\n${res.stderr}`;
  assert.match(output, /LIVE_EVIDENCE_CONTROL_PLANE_SHA provided without verified live-evidence-provenance record/);
});

test('verify-operational-readiness rejects mismatched LIVE_EVIDENCE_CONTROL_PLANE_SHA against provenance', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'provenance-mismatch-'));
  try {
    spawnSync('git', ['init'], { cwd: root });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    spawnSync('git', ['config', 'user.email', 'test@test.local'], { cwd: root });
    spawnSync('git', ['commit', '--allow-empty', '-m', 'test'], { cwd: root });
    const currentSha = gitSha(root);
    mkdirSync(path.join(root, 'launch_package'), { recursive: true });
    writeFileSync(path.join(root, 'launch_package/live-evidence-provenance.json'), JSON.stringify({
      schemaVersion: 1,
      status: 'passed',
      source: 'github-actions-live-evidence-run',
      repository: 'rashidpvt420-lang/bin-group-super-app',
      releaseCommitSha: currentSha,
      controlPlaneCommitSha: 'e'.repeat(40),
    }));
    const SCRIPT = path.join(repoRoot, 'scripts/verify-operational-readiness.mjs');
    const res = spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKFLOW: 'Live Role Smoke Tests',
        GITHUB_JOB: 'hard-public-launch-clearance',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
        GITHUB_SHA: currentSha,
        HARD_LAUNCH_EXPECTED_SHA: currentSha,
        CONTROL_PLANE_COMMIT_SHA: currentSha,
        LIVE_EVIDENCE_CONTROL_PLANE_SHA: 'f'.repeat(40),
      },
    });
    const output = `${res.stdout}\n${res.stderr}`;
    assert.match(output, /LIVE_EVIDENCE_CONTROL_PLANE_SHA must match the verified live-evidence-provenance record/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

