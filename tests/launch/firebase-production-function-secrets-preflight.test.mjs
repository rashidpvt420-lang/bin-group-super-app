import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/verify-firebase-production-secrets.mjs', 'utf8');
const deploy = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');

const requiredSecrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

test('production secret preflight verifies mail and payment metadata without reading values', () => {
  for (const secretName of requiredSecrets) {
    assert.match(script, new RegExp(`['"]${secretName}['"]`));
  }
  assert.match(script, /functions:secrets:get/);
  assert.doesNotMatch(script, /functions:secrets:access/);
  assert.match(script, /--project/);
  assert.match(script, /--non-interactive/);
  assert.match(script, /--no-install/);
  assert.match(script, /stdio:\s*\['ignore',\s*'ignore',\s*'pipe'\]/);
  assert.doesNotMatch(script, /result\.stdout|const\s+value\s*=/);
  assert.match(script, /if \(result\.error \|\| result\.status !== 0\)/);
});

test('protected production deploy requires secret preflight before Firebase deployment', () => {
  const contextIndex = deploy.indexOf("process.env.GITHUB_ACTIONS !== 'true'");
  const mainIndex = deploy.indexOf("['ls-remote', '--exit-code', 'origin', 'refs/heads/main']");
  const secretIndex = deploy.indexOf("'scripts/verify-firebase-production-secrets.mjs'");
  const deployIndex = deploy.indexOf("'firebase',\n      'deploy'");
  assert.ok(contextIndex >= 0, 'protected GitHub Actions context gate is required');
  assert.ok(mainIndex > contextIndex, 'origin/main binding must be checked after protected context');
  assert.ok(secretIndex > mainIndex, 'secret preflight must run after exact-main verification');
  assert.ok(deployIndex > secretIndex, 'secret preflight must run before the first Firebase deploy');
  assert.match(deploy, /if \(secretPreflightStatus !== 0\)/);
  assert.match(deploy, /process\.exit\(secretPreflightStatus\)/);
  assert.match(workflow, /run:\s*node scripts\/deploy-firebase-production\.mjs/);
});
