import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  requiredFirebaseAiSecrets,
  requiredFirebaseBankPilotSecrets,
  requiredFirebasePhase1PublicSecrets,
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

const expectedBankPilotSecrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'OWNER_CONTRACT_OTP_PEPPER',
  ...expectedAiSecrets,
];

const expectedPhase1PublicSecrets = [...expectedBankPilotSecrets];

const expectedPublicSecrets = [
  ...expectedBankPilotSecrets,
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
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

test('Phase 1 public requires SMTP, Owner OTP pepper and AI but never requires Stripe', () => {
  assert.deepEqual(requiredFirebaseAiSecrets, expectedAiSecrets);
  assert.deepEqual(requiredFirebaseBankPilotSecrets, expectedBankPilotSecrets);
  assert.deepEqual(requiredFirebasePhase1PublicSecrets, expectedPhase1PublicSecrets);
  assert.deepEqual(requiredFirebasePublicSecrets, expectedPublicSecrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('bank-pilot'), expectedBankPilotSecrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('phase1-public'), expectedPhase1PublicSecrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('public'), expectedPublicSecrets);
  assert.ok(!requiredFirebaseProductionSecretsForMode('phase1-public').includes('STRIPE_SECRET_KEY'));
  assert.ok(!requiredFirebaseProductionSecretsForMode('phase1-public').includes('STRIPE_WEBHOOK_SECRET'));
  assert.throws(
    () => requiredFirebaseProductionSecretsForMode('staging'),
    /LAUNCH_MODE must be bank-pilot, phase1-public, or public/,
  );
});

test('protected production deploy imports mode-aware secret preflight before Firebase deployment', () => {
  const contextIndex = deploy.indexOf("process.env.GITHUB_ACTIONS !== 'true'");
  const mainIndex = deploy.indexOf("['ls-remote', '--exit-code', 'origin', 'refs/heads/main']");
  const secretIndex = deploy.indexOf('await verifyFirebaseProductionSecrets({ projectId, launchMode });');
  const deployIndex = deploy.indexOf("'firebase',\n      'deploy'");
  assert.match(deploy, /import \{ verifyFirebaseProductionSecrets \} from ['"]\.\/verify-firebase-production-secrets\.mjs['"]/);
  assert.match(deploy, /const launchMode = String\(process\.env\.LAUNCH_MODE \|\| ['"]['"]\)\.trim\(\)/);
  assert.ok(contextIndex >= 0, 'protected GitHub Actions context gate is required');
  assert.ok(mainIndex > contextIndex, 'origin/main binding must be checked after protected context');
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
