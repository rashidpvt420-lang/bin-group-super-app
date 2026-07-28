import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = [
  '.github/workflows/admin-production-evidence.yml',
  '.github/workflows/firebase-production-deploy.yml',
  '.github/workflows/live-role-smoke.yml',
];

const oauthKeys = [
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'E2E_BROKER_MAILBOX_CLIENT_ID',
  'E2E_BROKER_MAILBOX_CLIENT_SECRET',
  'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
];

function workflowStep(source, name) {
  const marker = `- name: ${name}`;
  const stepStart = source.indexOf(marker);
  assert.ok(stepStart >= 0, `workflow is missing step: ${name}`);
  const nextStep = source.indexOf('\n      - name:', stepStart + marker.length);
  return source.slice(stepStart, nextStep > stepStart ? nextStep : source.length);
}

function assertOAuthMappings(step, label) {
  for (const key of oauthKeys) {
    const expectedSecretMapping = `${key}: \${{ secrets.${key} }}`;
    assert.ok(step.includes(expectedSecretMapping), `${label} does not receive ${key}`);
  }
}

test('Gmail OAuth credentials are step-scoped and never written into .env.e2e', () => {
  for (const workflowPath of workflows) {
    const source = readFileSync(workflowPath, 'utf8');
    const topLevel = source.slice(0, source.indexOf('\njobs:'));
    for (const key of oauthKeys) {
      assert.doesNotMatch(topLevel, new RegExp(`^\\s{2}${key}:`, 'm'), `${workflowPath} exposes ${key} globally`);
      assert.doesNotMatch(source, new RegExp(`printf ['"]${key}=`), `${workflowPath} writes ${key} into .env.e2e`);
      assert.match(source, new RegExp(`${key}: \\$\\{\\{ secrets\\.${key} \\}\\}`), `${workflowPath} has no consuming-step mapping for ${key}`);
    }
  }
});

test('every Firebase production strict-live consumer receives protected Gmail OAuth secrets', () => {
  const source = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const consumers = [
    {
      name: 'Validate full live E2E secrets and App Check UUID',
      command: /run: npm run test:e2e:env/,
    },
    {
      name: 'Run current-commit live launch audit',
      command: /run: npm run test:e2e:launch-audit:live/,
    },
    {
      name: 'Evaluate controlled-pilot eligibility',
      command: /run: npm run launch:status/,
    },
    {
      name: 'Create E2E environment for live proofs',
      command: /node scripts\/verify-e2e-env\.mjs/,
    },
    {
      name: 'Run launch audit live evidence',
      command: /npm run test:e2e:launch-audit:live/,
    },
  ];

  for (const consumer of consumers) {
    const step = workflowStep(source, consumer.name);
    assert.match(step, consumer.command, `${consumer.name} no longer invokes the expected strict-live guard path`);
    assertOAuthMappings(step, consumer.name);
  }
});

test('every Admin production strict-live consumer receives protected Gmail OAuth secrets', () => {
  const source = readFileSync('.github/workflows/admin-production-evidence.yml', 'utf8');
  const consumers = [
    {
      name: 'Validate protected credentials and App Check',
      command: /node scripts\/verify-e2e-env\.mjs/,
    },
    {
      name: 'Run full Admin operational evidence suite',
      command: /node scripts\/run-critical-evidence\.mjs --suite adminCredentialLogin/,
    },
  ];

  for (const consumer of consumers) {
    const step = workflowStep(source, consumer.name);
    assert.match(step, consumer.command, `${consumer.name} no longer invokes the expected strict-live guard path`);
    assertOAuthMappings(step, `Admin Production Evidence: ${consumer.name}`);
  }
});

test('public live-proof environment validates OAuth credentials without persisting them', () => {
  const source = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const step = workflowStep(source, 'Create E2E environment for live proofs');

  assert.match(step, /> \.env\.e2e/);
  assert.match(step, /node scripts\/verify-e2e-env\.mjs/);
  for (const key of oauthKeys) {
    assert.doesNotMatch(step, new RegExp(`printf ['"]${key}=`), `${key} must not be written into .env.e2e`);
  }
});
