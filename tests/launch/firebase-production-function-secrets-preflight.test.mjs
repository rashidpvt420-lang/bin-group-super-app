import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/verify-firebase-production-secrets.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');

const requiredSecrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

test('production secret preflight verifies mail and payment secrets without printing values', () => {
  for (const secretName of requiredSecrets) {
    assert.match(script, new RegExp(`['"]${secretName}['"]`));
  }
  assert.match(script, /functions:secrets:access/);
  assert.match(script, /--project/);
  assert.match(script, /--non-interactive/);
  assert.match(script, /--no-install/);
  assert.match(script, /stdio:\s*\['ignore',\s*'pipe',\s*'pipe'\]/);
  assert.doesNotMatch(script, /console\.log\([^\n]*(?:stdout|value)/);
  assert.match(script, /if \(result\.error \|\| result\.status !== 0 \|\| !value\)/);
});

test('production deploy runs secret preflight after Google authentication and before deployment', () => {
  const authIndex = workflow.indexOf('Authenticate to Google Cloud by Workload Identity Federation');
  const secretIndex = workflow.indexOf('Verify required Firebase production function secrets');
  const deployIndex = workflow.indexOf('Deploy and verify Firebase production stack');
  assert.ok(authIndex >= 0, 'Google authentication step is required');
  assert.ok(secretIndex > authIndex, 'secret preflight must run after Google authentication');
  assert.ok(deployIndex > secretIndex, 'secret preflight must run before Firebase deployment');
  assert.match(workflow, /run:\s*node scripts\/verify-firebase-production-secrets\.mjs/);
});
