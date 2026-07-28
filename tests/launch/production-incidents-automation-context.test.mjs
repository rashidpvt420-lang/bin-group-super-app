#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const producerScript = path.join(
  root,
  'scripts/create-production-incidents-attestation.mjs',
);

const protectedAutomationEnv = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '991122',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_ACTOR: 'github-actions[bot]',
  GITHUB_WORKFLOW: 'Firebase Production Deploy',
  GITHUB_WORKFLOW_REF:
    'rashidpvt420-lang/bin-group-super-app/.github/workflows/firebase-production-deploy.yml@refs/heads/main',
  GITHUB_JOB: 'deploy-firebase-production-stack',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,backup-founder',
  INCIDENT_ATTESTATION: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
  INCIDENT_ACTIVE_JSON: '[]',
  INCIDENT_REQUIRES_ROLLBACK: 'false',
  INCIDENT_ROLLBACK_REASON: '',
  INCIDENT_LAST_DEPLOYMENT_FAILED: 'false',
  INCIDENT_LAST_DEPLOYMENT_FAILED_AT: '',
  INCIDENT_EVIDENCE_REFS: 'ops://ticket/INC-AUTOMATION-1',
};

function runProducer(overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'incident-automation-'));
  const result = spawnSync(process.execPath, [producerScript], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...protectedAutomationEnv,
      ...overrides,
    },
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

test('protected Firebase deploy automation may create the incident artifact', () => {
  withProducer({}, ({ directory, result }) => {
    assert.equal(result.status, 0, result.stderr);
    const artifactPath = path.join(
      directory,
      'launch_package/production-incidents.json',
    );
    assert.equal(existsSync(artifactPath), true);
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    assert.equal(artifact.actor, 'github-actions[bot]');
    assert.equal(artifact.workflow, 'Firebase Production Deploy');
    assert.equal(artifact.commitSha, protectedAutomationEnv.GITHUB_SHA);
    assert.equal(artifact.hardLaunchClaim, false);
  });
});

test('automation actor remains rejected outside the exact protected deploy context', () => {
  const cases = [
    {
      name: 'wrong workflow',
      override: { GITHUB_WORKFLOW: 'Production Readiness Preflight' },
    },
    {
      name: 'wrong workflow file',
      override: {
        GITHUB_WORKFLOW_REF:
          'rashidpvt420-lang/bin-group-super-app/.github/workflows/production-readiness-preflight.yml@refs/heads/main',
      },
    },
    {
      name: 'wrong job',
      override: { GITHUB_JOB: 'validate-production-build' },
    },
    {
      name: 'wrong event',
      override: { GITHUB_EVENT_NAME: 'push' },
    },
    {
      name: 'missing workflow reference',
      override: { GITHUB_WORKFLOW_REF: '' },
    },
  ];

  for (const item of cases) {
    withProducer(item.override, ({ directory, result }) => {
      assert.notEqual(result.status, 0, item.name);
      assert.match(
        String(result.stderr || ''),
        /not authorized outside the exact protected Firebase Production Deploy context/i,
        item.name,
      );
      assert.equal(
        existsSync(path.join(directory, 'launch_package/production-incidents.json')),
        false,
        item.name,
      );
    });
  }
});

test('putting github-actions bot in the Founder allowlist cannot bypass context binding', () => {
  withProducer(
    {
      AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang,github-actions[bot]',
      GITHUB_JOB: 'validate-production-build',
    },
    ({ directory, result }) => {
      assert.notEqual(result.status, 0);
      assert.match(
        String(result.stderr || ''),
        /not authorized outside the exact protected Firebase Production Deploy context/i,
      );
      assert.equal(
        existsSync(path.join(directory, 'launch_package/production-incidents.json')),
        false,
      );
    },
  );
});

test('an unlisted human actor is still rejected even in the protected workflow', () => {
  withProducer(
    {
      GITHUB_ACTOR: 'unauthorized-human',
    },
    ({ directory, result }) => {
      assert.notEqual(result.status, 0);
      assert.match(String(result.stderr || ''), /not authorized to attest/i);
      assert.equal(
        existsSync(path.join(directory, 'launch_package/production-incidents.json')),
        false,
      );
    },
  );
});
