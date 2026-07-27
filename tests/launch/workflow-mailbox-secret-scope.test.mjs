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
