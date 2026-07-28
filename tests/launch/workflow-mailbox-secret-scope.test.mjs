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

test('production E2E env guard receives protected Gmail OAuth secrets', () => {
  const source = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const stepStart = source.indexOf('- name: Validate full live E2E secrets and App Check UUID');
  const nextStep = source.indexOf('\n      - name:', stepStart + 1);
  assert.ok(stepStart >= 0, 'production workflow is missing the live E2E env guard step');
  assert.ok(nextStep > stepStart, 'production workflow env guard step has no following step boundary');
  const step = source.slice(stepStart, nextStep);

  assert.match(step, /run: npm run test:e2e:env/);
  for (const key of oauthKeys) {
    const expectedSecretMapping = `${key}: \${{ secrets.${key} }}`;
    assert.ok(step.includes(expectedSecretMapping), `live E2E env guard does not receive ${key}`);
  }
});
