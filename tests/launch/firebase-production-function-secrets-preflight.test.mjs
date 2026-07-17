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

test('production secret preflight uses Firebase metadata API without child processes or secret access', () => {
  for (const secretName of requiredSecrets) {
    assert.match(script, new RegExp(`['"]${secretName}['"]`));
  }
  assert.match(script, /import firebaseTools from ['"]firebase-tools['"]/);
  assert.match(script, /firebaseTools\.functions\.secrets\.get\(secretName/);
  assert.match(script, /project:\s*expectedProjectId/);
  assert.match(script, /nonInteractive:\s*true/);
  assert.match(script, /Array\.isArray\(result\?\.secrets\)/);
  assert.match(script, /state === ['"]ENABLED['"]/);
  assert.doesNotMatch(script, /node:child_process|spawnSync|execSync|functions:secrets:access/);
  assert.doesNotMatch(script, /secretValue|result\.stdout|const\s+value\s*=/);
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
