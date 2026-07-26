import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const live = readFileSync('.github/workflows/live-role-smoke.yml', 'utf8');
const preflight = readFileSync('.github/workflows/production-readiness-preflight.yml', 'utf8');
const diagnostics = readFileSync('.github/workflows/firebase-production-failure-diagnostics.yml', 'utf8');

function topLevelEnv(workflow) {
  const match = workflow.match(/\nenv:\n([\s\S]*?)\njobs:/);
  return match?.[1] || '';
}

function generatedEnvBlock(workflow) {
  const marker = 'Create E2E environment for live proofs';
  const index = workflow.indexOf(marker);
  if (index < 0) return '';
  const next = workflow.indexOf('\n      - name:', index + marker.length);
  return workflow.slice(index, next < 0 ? workflow.length : next);
}

test('hard-launch mailbox workflows use protected environments', () => {
  assert.match(preflight, /environment:\s*hard-public-launch/);
  assert.match(live, /environment:\s*hard-public-launch/);
  assert.match(deploy, /environment:\s*hard-public-launch/);
});

test('app login identities are not replaced by mailbox identities in launch workflows', () => {
  for (const workflow of [deploy, live]) {
    assert.match(workflow, /E2E_OWNER_EMAIL:\s*\$\{\{\s*secrets\.E2E_OWNER_EMAIL\s*\}\}/);
    assert.match(workflow, /E2E_BROKER_EMAIL:\s*\$\{\{\s*secrets\.E2E_BROKER_EMAIL\s*\}\}/);
    assert.match(workflow, /E2E_OWNER_MAILBOX_EMAIL:\s*\$\{\{\s*vars\.E2E_OWNER_MAILBOX_EMAIL\s*\}\}/);
    assert.match(workflow, /E2E_BROKER_MAILBOX_EMAIL:\s*\$\{\{\s*vars\.E2E_BROKER_MAILBOX_EMAIL\s*\}\}/);
  }
});

test('Gmail OAuth secrets are scoped to consuming steps, not workflow job globals', () => {
  for (const workflow of [deploy, live, preflight]) {
    const env = topLevelEnv(workflow);
    assert.doesNotMatch(env, /MAILBOX_CLIENT_ID|MAILBOX_CLIENT_SECRET|MAILBOX_REFRESH_TOKEN/);
  }
});

test('generated .env.e2e does not persist Gmail OAuth secrets', () => {
  const block = generatedEnvBlock(deploy);
  assert.ok(block, 'deploy workflow must create .env.e2e for live proofs');
  assert.doesNotMatch(block, /printf 'E2E_(?:OWNER|BROKER)_MAILBOX_CLIENT_ID=/);
  assert.doesNotMatch(block, /printf 'E2E_(?:OWNER|BROKER)_MAILBOX_CLIENT_SECRET=/);
  assert.doesNotMatch(block, /printf 'E2E_(?:OWNER|BROKER)_MAILBOX_REFRESH_TOKEN=/);
});

test('required workflow actions use supported major versions for actionlint acceptance', () => {
  const workflows = [deploy, live, preflight, diagnostics];
  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v[56789]\b/);
    assert.doesNotMatch(workflow, /actions\/upload-artifact@v[56789]\b/);
  }
  assert.match(diagnostics, /actions\/upload-artifact@v4/);
});
