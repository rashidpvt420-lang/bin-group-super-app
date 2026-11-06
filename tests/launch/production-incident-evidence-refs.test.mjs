#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const producerScript = path.join(
  root,
  'scripts/create-production-incidents-attestation.mjs',
);

const baseEnv = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_SHA: '25a1d0df9ddcfe5917dd66a6e7c69690eb4ea5be',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '41598462464',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_ACTOR: 'rashidpvt420-lang',
  GITHUB_WORKFLOW: 'Firebase Production Deploy',
  AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,backup-founder',
  INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
  INCIDENT_ACTIVE_JSON: '[]',
  INCIDENT_REQUIRES_ROLLBACK: 'false',
  INCIDENT_ROLLBACK_REASON: '',
  INCIDENT_LAST_DEPLOYMENT_FAILED: 'false',
  INCIDENT_LAST_DEPLOYMENT_FAILED_AT: '',
  INCIDENT_EVIDENCE_REFS: 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434',
};

function runProducer(overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'inc-test-'));
  const env = {
    ...process.env,
    ...baseEnv,
    ...overrides,
  };
  const result = spawnSync(process.execPath, [producerScript], {
    cwd: directory,
    encoding: 'utf8',
    env,
  });
  return { directory, result };
}

function withProducer(overrides, assertion) {
  const { directory, result } = runProducer(overrides);
  try {
    assertion({ directory, result });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1. Clear incidents
// ---------------------------------------------------------------------------

test('clear incidents state with valid reference produces exact-SHA runtime artifact', () => {
  withProducer({}, ({ directory, result }) => {
    assert.equal(result.status, 0, result.stderr);
    const outPath = path.join(directory, 'launch_package/production-incidents.json');
    assert.ok(existsSync(outPath), 'artifact must exist');
    const doc = JSON.parse(readFileSync(outPath, 'utf8'));

    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.source, 'protected-workflow-dispatch-attestation');
    assert.equal(doc.commitSha, baseEnv.GITHUB_SHA);
    assert.equal(doc.repository, baseEnv.GITHUB_REPOSITORY);
    assert.equal(doc.ref, 'refs/heads/main');
    assert.equal(doc.workflowRunId, baseEnv.GITHUB_RUN_ID);
    assert.equal(doc.workflowRunAttempt, 1);
    assert.equal(doc.actor, baseEnv.GITHUB_ACTOR);
    assert.equal(doc.attestation, 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR');
    assert.deepEqual(doc.activeIncidents, []);
    assert.equal(doc.requiresRollback, false);
    assert.equal(doc.rollbackReason, null);
    assert.equal(doc.lastDeploymentFailed, false);
    assert.equal(doc.lastDeploymentFailedAt, null);
    assert.equal(doc.hardLaunchClaim, false);
    assert.deepEqual(doc.evidenceReferences, [
      'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434',
    ]);
  });
});

test('clear incidents state with multiple valid references produces exact-SHA runtime artifact', () => {
  withProducer(
    {
      INCIDENT_EVIDENCE_REFS:
        'ops://ticket/INC-AUDIT-CLEAR,https://github.com/rashidpvt420-lang/bin-group-super-app/pull/1935',
    },
    ({ directory, result }) => {
      assert.equal(result.status, 0, result.stderr);
      const doc = JSON.parse(
        readFileSync(path.join(directory, 'launch_package/production-incidents.json'), 'utf8'),
      );
      assert.equal(doc.attestation, 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR');
      assert.deepEqual(doc.evidenceReferences, [
        'ops://ticket/INC-AUDIT-CLEAR',
        'https://github.com/rashidpvt420-lang/bin-group-super-app/pull/1935',
      ]);
    },
  );
});

test('clear incidents attestation forbids active incidents, rollback hold, or failed last deployment', () => {
  const contradictoryCases = [
    {
      name: 'active incidents present',
      override: {
        INCIDENT_ACTIVE_JSON: JSON.stringify([
          { id: 'INC-1', severity: 'P1', status: 'open' },
        ]),
      },
      match: /CLEAR attestation forbids non-empty INCIDENT_ACTIVE_JSON/i,
    },
    {
      name: 'rollback hold requested',
      override: {
        INCIDENT_REQUIRES_ROLLBACK: 'true',
        INCIDENT_ROLLBACK_REASON: 'db issue',
      },
      match: /CLEAR attestation forbids INCIDENT_REQUIRES_ROLLBACK=true/i,
    },
    {
      name: 'last deployment failed',
      override: {
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'true',
        INCIDENT_LAST_DEPLOYMENT_FAILED_AT: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      },
      match: /CLEAR attestation forbids INCIDENT_LAST_DEPLOYMENT_FAILED=true/i,
    },
  ];

  for (const { name, override, match } of contradictoryCases) {
    withProducer(override, ({ directory, result }) => {
      assert.notEqual(result.status, 0, `expected fail for ${name}`);
      assert.match(String(result.stderr || ''), match, name);
      assert.ok(
        !existsSync(path.join(directory, 'launch_package/production-incidents.json')),
        `artifact must not be written on ${name}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Active incidents & holds
// ---------------------------------------------------------------------------

test('active incidents with valid hold and reference writes truthful artifact', () => {
  withProducer(
    {
      INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
      INCIDENT_ACTIVE_JSON: JSON.stringify([
        { id: 'INC-701', severity: 'P1', status: 'investigating' },
      ]),
      INCIDENT_EVIDENCE_REFS: 'ops://ticket/INC-701',
    },
    ({ directory, result }) => {
      assert.equal(result.status, 0, result.stderr);
      const doc = JSON.parse(
        readFileSync(path.join(directory, 'launch_package/production-incidents.json'), 'utf8'),
      );
      assert.equal(doc.attestation, 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS');
      assert.equal(doc.activeIncidents.length, 1);
      assert.equal(doc.activeIncidents[0].id, 'INC-701');
      assert.equal(doc.activeIncidents[0].severity, 'P1');
      assert.deepEqual(doc.evidenceReferences, ['ops://ticket/INC-701']);
    },
  );
});

test('rollback hold with valid reason and evidence writes truthful artifact', () => {
  withProducer(
    {
      INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
      INCIDENT_REQUIRES_ROLLBACK: 'true',
      INCIDENT_ROLLBACK_REASON: 'Schema migration failure on Firestore',
      INCIDENT_EVIDENCE_REFS: 'ops://ticket/ROLLBACK-MIGRATION-1',
    },
    ({ directory, result }) => {
      assert.equal(result.status, 0, result.stderr);
      const doc = JSON.parse(
        readFileSync(path.join(directory, 'launch_package/production-incidents.json'), 'utf8'),
      );
      assert.equal(doc.attestation, 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS');
      assert.equal(doc.requiresRollback, true);
      assert.equal(doc.rollbackReason, 'Schema migration failure on Firestore');
      assert.deepEqual(doc.evidenceReferences, ['ops://ticket/ROLLBACK-MIGRATION-1']);
    },
  );
});

test('last deployment failed outside 30-minute cooling period writes truthful artifact', () => {
  const failedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
  withProducer(
    {
      INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
      INCIDENT_LAST_DEPLOYMENT_FAILED: 'true',
      INCIDENT_LAST_DEPLOYMENT_FAILED_AT: failedAt,
      INCIDENT_EVIDENCE_REFS: 'GITHUB_PRODUCTION_RUN_41598462464',
    },
    ({ directory, result }) => {
      assert.equal(result.status, 0, result.stderr);
      const doc = JSON.parse(
        readFileSync(path.join(directory, 'launch_package/production-incidents.json'), 'utf8'),
      );
      assert.equal(doc.lastDeploymentFailed, true);
      assert.equal(doc.lastDeploymentFailedAt, failedAt);
      assert.deepEqual(doc.evidenceReferences, ['GITHUB_PRODUCTION_RUN_41598462464']);
    },
  );
});

test('active incidents with holds fails closed when hold conditions are violated', () => {
  const invalidHoldCases = [
    {
      name: 'WITH_HOLDS attestation without any holds',
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_ACTIVE_JSON: '[]',
        INCIDENT_REQUIRES_ROLLBACK: 'false',
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'false',
      },
      match: /WITH_HOLDS attestation requires at least one hold/i,
    },
    {
      name: 'requiresRollback=true without rollbackReason',
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_REQUIRES_ROLLBACK: 'true',
        INCIDENT_ROLLBACK_REASON: '',
      },
      match: /INCIDENT_ROLLBACK_REASON is required/i,
    },
    {
      name: 'lastDeploymentFailed inside 30-minute cooling period',
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'true',
        INCIDENT_LAST_DEPLOYMENT_FAILED_AT: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
      match: /30-minute retry cooling period/i,
    },
    {
      name: 'lastDeploymentFailed with future timestamp',
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_LAST_DEPLOYMENT_FAILED: 'true',
        INCIDENT_LAST_DEPLOYMENT_FAILED_AT: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      match: /must not be in the future/i,
    },
    {
      name: 'malformed INCIDENT_ACTIVE_JSON (not an array)',
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_ACTIVE_JSON: '{"id":"INC-1"}',
      },
      match: /must be a JSON array/i,
    },
    {
      name: 'incident object missing severity',
      override: {
        INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
        INCIDENT_ACTIVE_JSON: JSON.stringify([{ id: 'INC-1', status: 'open' }]),
      },
      match: /severity is required/i,
    },
  ];

  for (const { name, override, match } of invalidHoldCases) {
    withProducer(override, ({ directory, result }) => {
      assert.notEqual(result.status, 0, `expected fail for ${name}`);
      assert.match(String(result.stderr || ''), match, name);
      assert.ok(!existsSync(path.join(directory, 'launch_package/production-incidents.json')));
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Missing evidence
// ---------------------------------------------------------------------------

test('missing evidence references fail closed immediately', () => {
  const missingCases = [
    {
      name: 'empty string evidence',
      override: { INCIDENT_EVIDENCE_REFS: '' },
      match: /INCIDENT_EVIDENCE_REFS is required/i,
    },
    {
      name: 'whitespace-only evidence',
      override: { INCIDENT_EVIDENCE_REFS: '    ' },
      match: /INCIDENT_EVIDENCE_REFS is required/i,
    },
    {
      name: 'empty comma entries',
      override: { INCIDENT_EVIDENCE_REFS: ', , ' },
      match: /empty or whitespace-only reference entries/i,
    },
    {
      name: 'trailing comma empty entry',
      override: { INCIDENT_EVIDENCE_REFS: 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434, ' },
      match: /empty or whitespace-only reference entries/i,
    },
    {
      name: 'leading comma empty entry',
      override: { INCIDENT_EVIDENCE_REFS: ' ,https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434' },
      match: /empty or whitespace-only reference entries/i,
    },
  ];

  for (const { name, override, match } of missingCases) {
    withProducer(override, ({ directory, result }) => {
      assert.notEqual(result.status, 0, `expected fail for ${name}`);
      assert.match(String(result.stderr || ''), match, name);
      assert.ok(!existsSync(path.join(directory, 'launch_package/production-incidents.json')));
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Invalid evidence
// ---------------------------------------------------------------------------

test('invalid evidence references fail closed immediately', () => {
  const invalidCases = [
    {
      name: 'angle-bracket placeholder',
      override: { INCIDENT_EVIDENCE_REFS: '<CURRENT_APPROVED_EVIDENCE_REFERENCE>' },
      match: /placeholder value/i,
    },
    {
      name: 'REPLACE_ME placeholder',
      override: { INCIDENT_EVIDENCE_REFS: 'REPLACE_ME' },
      match: /placeholder value/i,
    },
    {
      name: 'TODO placeholder',
      override: { INCIDENT_EVIDENCE_REFS: 'TODO_FILL_IN_EVIDENCE' },
      match: /placeholder value/i,
    },
    {
      name: 'non-URI string without recognized scheme',
      override: { INCIDENT_EVIDENCE_REFS: 'incident-evidence-was-checked-verbally' },
      match: /not a valid evidence reference format/i,
    },
    {
      name: 'malformed scheme',
      override: { INCIDENT_EVIDENCE_REFS: '123://bad-scheme' },
      match: /not a valid evidence reference format/i,
    },
    {
      name: 'ADMIN_MFA_BOOTSTRAP_HOSTING in public launch mode',
      override: {
        LAUNCH_MODE: 'public',
        INCIDENT_EVIDENCE_REFS: 'ADMIN_MFA_BOOTSTRAP_HOSTING',
      },
      match: /ADMIN_MFA_BOOTSTRAP_HOSTING is not permitted as incident evidence in public launch mode/i,
    },
  ];

  for (const { name, override, match } of invalidCases) {
    withProducer(override, ({ directory, result }) => {
      assert.notEqual(result.status, 0, `expected fail for ${name}`);
      assert.match(String(result.stderr || ''), match, name);
      assert.ok(!existsSync(path.join(directory, 'launch_package/production-incidents.json')));
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Workflow coherence: early dispatch gate enforcement
// ---------------------------------------------------------------------------

test('deploy workflow enforces incident evidence and attestation in early dispatch gates', () => {
  const workflowPath = path.join(root, '.github/workflows/firebase-production-deploy.yml');
  const workflow = readFileSync(workflowPath, 'utf8');

  // Both validate-production-build and deploy-firebase-production-stack have early dispatch gate
  const buildGate = workflow.slice(
    workflow.indexOf('jobs:\n  validate-production-build:'),
    workflow.indexOf('      - name: Checkout repository'),
  );
  const deployGate = workflow.slice(
    workflow.indexOf('  deploy-firebase-production-stack:'),
    workflow.indexOf('      - name: Checkout repository', workflow.indexOf('  deploy-firebase-production-stack:')),
  );

  for (const [label, gate] of [
    ['validate-production-build', buildGate],
    ['deploy-firebase-production-stack', deployGate],
  ]) {
    assert.match(gate, /INCIDENT_EVIDENCE_REFS_INPUT:/, `${label} must bind INCIDENT_EVIDENCE_REFS_INPUT`);
    assert.match(gate, /INCIDENT_ATTESTATION_INPUT:/, `${label} must bind INCIDENT_ATTESTATION_INPUT`);
    assert.match(
      gate,
      /incident_evidence_refs is required and cannot be empty/,
      `${label} must enforce non-empty incident_evidence_refs`,
    );
    assert.match(
      gate,
      /CLEAR incident attestation forbids active incidents/,
      `${label} must enforce clear attestation forbids active incidents`,
    );
    assert.match(
      gate,
      /CLEAR incident attestation forbids rollback hold/,
      `${label} must enforce clear attestation forbids rollback hold`,
    );
    assert.match(
      gate,
      /CLEAR incident attestation forbids failed last deployment/,
      `${label} must enforce clear attestation forbids failed last deployment`,
    );
  }
});

test('deploy workflow defaults incident_evidence_refs to empty string to fail closed on unpopulated dispatch', () => {
  const workflowPath = path.join(root, '.github/workflows/firebase-production-deploy.yml');
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /"incident_evidence_refs":""/);
  assert.doesNotMatch(workflow, /incident_evidence_refs[^\\n]*ADMIN_MFA_BOOTSTRAP_HOSTING/);
});
