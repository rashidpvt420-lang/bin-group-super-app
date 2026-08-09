import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  requiredFirebaseAiSecrets,
  requiredFirebaseInfrastructureSecrets,
  requiredFirebaseBankPilotSecrets,
  requiredFirebaseDeploymentSecrets,
  requiredFirebasePublicSecrets,
  requiredFirebaseProductionSecretsForMode,
} from '../../scripts/verify-firebase-production-secrets.mjs';

const script = readFileSync('scripts/verify-firebase-production-secrets.mjs', 'utf8');
const deploy = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8').replace(/\r\n?/g, '\n');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');

const expectedAiSecrets = [
  'OPENAI_API_KEY',
  'IMAGE_GENERATION_API_KEY',
  'GEMINI_API_KEY',
];

const expectedInfrastructureSecrets = [
  'IOT_GATEWAY_TOKEN',
];

const expectedBankPilotSecrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'OWNER_CONTRACT_OTP_PEPPER',
  'BROKER_PAYOUT_OTP_PEPPER',
  ...expectedInfrastructureSecrets,
  'QR_SIGNING_SECRET',
  ...expectedAiSecrets,
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
];

const expectedPublicSecrets = [
  ...expectedBankPilotSecrets,
];

test('production secret preflight uses Firebase metadata API without child processes or secret access', () => {
  for (const secretName of expectedPublicSecrets) {
    assert.match(script, new RegExp(`['"]${secretName}['"]`));
  }
  assert.match(script, /import firebaseTools from ['"]firebase-tools['"]/);
  assert.match(script, /export async function verifyFirebaseProductionSecrets/);
  assert.match(script, /firebaseClient\.functions\.secrets\.get\(secretName/);
  assert.match(script, /project:\s*expectedProjectId/);
  assert.match(script, /nonInteractive:\s*true/);
  assert.match(script, /Array\.isArray\(result\?\.secrets\)/);
  assert.match(script, /state === ['"]ENABLED['"]/);
  assert.doesNotMatch(script, /node:child_process|spawnSync|execSync|functions:secrets:access/);
  assert.doesNotMatch(script, /secretValue|result\.stdout|const\s+value\s*=/);
});

test('both launch modes require the full deployed Function secret contract', () => {
  assert.deepEqual(requiredFirebaseAiSecrets, expectedAiSecrets);
  assert.deepEqual(requiredFirebaseInfrastructureSecrets, expectedInfrastructureSecrets);
  assert.deepEqual(requiredFirebaseDeploymentSecrets, expectedBankPilotSecrets);
  assert.deepEqual(requiredFirebaseBankPilotSecrets, expectedBankPilotSecrets);
  assert.deepEqual(requiredFirebasePublicSecrets, expectedPublicSecrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('bank-pilot'), expectedBankPilotSecrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('public'), expectedPublicSecrets);
  assert.throws(
    () => requiredFirebaseProductionSecretsForMode('staging'),
    /LAUNCH_MODE must be bank-pilot or public/,
  );
});

test('canonical deployment secret contract covers every Function Secret Manager definition', () => {
  const discovered = new Set();
  const sourceFiles = [];
  const collectSourceFiles = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue;
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        collectSourceFiles(entryPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        sourceFiles.push(entryPath);
      }
    }
  };
  collectSourceFiles('functions');

  for (const filename of sourceFiles) {
    const source = readFileSync(filename, 'utf8');
    const pattern = /defineSecret\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g;
    let match;
    while ((match = pattern.exec(source))) discovered.add(match[1]);
  }
  assert.deepEqual([...requiredFirebaseDeploymentSecrets].sort(), [...discovered].sort());
});

test('protected production deploy imports mode-aware secret preflight before Firebase deployment', () => {
  const contextIndex = deploy.indexOf("process.env.GITHUB_ACTIONS !== 'true'");
  const mainIndex = deploy.indexOf("['ls-remote', '--exit-code', 'origin', 'refs/heads/main']");
  const contractIndex = deploy.indexOf('scripts/verify-firebase-deployed-function-secret-contract.mjs');
  const secretIndex = deploy.indexOf('await verifyFirebaseProductionSecrets({ projectId, launchMode });');
  const deployIndex = deploy.indexOf("'firebase',\n      'deploy'");
  assert.match(deploy, /import \{ verifyFirebaseProductionSecrets \} from ['"]\.\/verify-firebase-production-secrets\.mjs['"]/);
  assert.match(deploy, /const launchMode = String\(process\.env\.LAUNCH_MODE \|\| ['"]['"]\)\.trim\(\)/);
  assert.ok(contextIndex >= 0, 'protected GitHub Actions context gate is required');
  assert.ok(mainIndex > contextIndex, 'origin/main binding must be checked after protected context');
  assert.ok(contractIndex > mainIndex, 'compiled Function secret contract must be checked after exact-main verification');
  assert.ok(secretIndex > contractIndex, 'secret metadata preflight must follow the compiled Function secret contract');
  assert.ok(secretIndex > mainIndex, 'secret preflight must run after exact-main verification');
  assert.ok(deployIndex > secretIndex, 'secret preflight must run before the first Firebase deploy');
  assert.doesNotMatch(deploy, /secretPreflightStatus|run\(process\.execPath,\s*\[\s*['"]scripts\/verify-firebase-production-secrets\.mjs/);
  assert.match(deploy, /Required Firebase production function secret preflight failed/);
  assert.match(workflow, /run:\s*node scripts\/deploy-firebase-production\.mjs/);
});

test('production deploy rejects any non-exact origin/main SHA before Firebase mutation', () => {
  assert.match(deploy, /remoteMainSha !== githubSha/, 'origin/main must exactly match GITHUB_SHA');
  assert.match(deploy, /must exactly match GITHUB_SHA/, 'stale SHA refusal must be explicit');
  assert.doesNotMatch(deploy, /merge-base.*--is-ancestor/, 'ancestor deployment fallback must not exist');
  assert.doesNotMatch(deploy, /FETCH_HEAD/, 'deploy must not fetch and tolerate advanced main');
  assert.doesNotMatch(deploy, /is a verified ancestor/, 'ancestor success log must not exist');
  assert.doesNotMatch(deploy, /proceeding with deployment/, 'advanced-main deployments must not proceed');
  const lsRemoteIndex = deploy.indexOf("['ls-remote', '--exit-code', 'origin', 'refs/heads/main']");
  const refusalIndex = deploy.indexOf('remoteMainSha !== githubSha');
  const secretIndex = deploy.indexOf('await verifyFirebaseProductionSecrets({ projectId, launchMode });');
  assert.ok(refusalIndex > lsRemoteIndex, 'exact-SHA refusal must follow ls-remote probe');
  assert.ok(secretIndex > refusalIndex, 'exact-SHA refusal must happen before secret preflight and deployment');
});
