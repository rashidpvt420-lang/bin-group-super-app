import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  requiredFirebaseAiSecrets,
  requiredFirebaseInfrastructureSecrets,
  requiredFirebaseBankPilotSecrets,
  requiredFirebaseDeploymentSecrets,
  requiredFirebasePublicSecrets,
  requiredFirebaseProductionSecretsForMode,
} from '../../scripts/verify-firebase-production-secrets.mjs';

const script = readFileSync('scripts/verify-firebase-production-secrets.mjs', 'utf8');
const deployedContract = readFileSync('scripts/verify-firebase-deployed-function-secret-contract.mjs', 'utf8');
const deploy = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8').replace(/\r\n?/g, '\n');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');
const phase1StripeHold = readFileSync('functions/stripePaymentPhase1Hold.ts', 'utf8');

const expectedAiSecrets = [
  'OPENAI_API_KEY',
  'IMAGE_GENERATION_API_KEY',
  'GEMINI_API_KEY',
];

const expectedInfrastructureSecrets = [
  'IOT_GATEWAY_TOKEN',
];

const expectedPhase1Secrets = [
  'SMTP_USER',
  'SMTP_PASS',
  'OWNER_CONTRACT_OTP_PEPPER',
  'BROKER_PAYOUT_OTP_PEPPER',
  ...expectedInfrastructureSecrets,
  'QR_SIGNING_SECRET',
  ...expectedAiSecrets,
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
];

const expectedPublicSecrets = [...expectedPhase1Secrets];

test('production secret preflight uses Firebase metadata API without child processes or secret access', () => {
  for (const secretName of expectedPublicSecrets) {
    assert.match(script, new RegExp(`['"]${secretName}['"]`));
  }
  assert.doesNotMatch(
    script.slice(script.indexOf('requiredFirebaseDeploymentSecrets'), script.indexOf('requiredFirebaseBankPilotSecrets')),
    /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/,
    'disabled Stripe credentials must not be Phase 1 deployment prerequisites',
  );
  assert.match(script, /import firebaseTools from ['"]firebase-tools['"]/);
  assert.match(script, /export async function verifyFirebaseProductionSecrets/);
  assert.match(script, /firebaseClient\.functions\.secrets\.get\(secretName/);
  assert.match(script, /project:\s*expectedProjectId/);
  assert.match(script, /nonInteractive:\s*true/);
  assert.match(script, /Array\.isArray\(result\?\.secrets\)/);
  assert.match(script, /ENABLED/);
  assert.doesNotMatch(script, /node:child_process|spawnSync|execSync|functions:secrets:access/);
  assert.doesNotMatch(script, /secretValue|result\.stdout|const\s+value\s*=/);
});

test('both current launch modes use the same Phase 1 deployed Function secret contract', () => {
  assert.deepEqual(requiredFirebaseAiSecrets, expectedAiSecrets);
  assert.deepEqual(requiredFirebaseInfrastructureSecrets, expectedInfrastructureSecrets);
  assert.deepEqual(requiredFirebaseDeploymentSecrets, expectedPhase1Secrets);
  assert.deepEqual(requiredFirebaseBankPilotSecrets, expectedPhase1Secrets);
  assert.deepEqual(requiredFirebasePublicSecrets, expectedPublicSecrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('bank-pilot'), expectedPhase1Secrets);
  assert.deepEqual(requiredFirebaseProductionSecretsForMode('public'), expectedPublicSecrets);
  assert.throws(
    () => requiredFirebaseProductionSecretsForMode('staging'),
    /LAUNCH_MODE must be bank-pilot or public/,
  );
});

test('compiled exported Function metadata is the authoritative secret binding contract', () => {
  assert.match(deployedContract, /functions\/lib\/runtimeAll\.js/);
  assert.match(deployedContract, /secretEnvironmentVariables/);
  assert.match(deployedContract, /requiredFirebaseDeploymentSecrets/);
  assert.match(deployedContract, /missing from preflight/);
  assert.match(deployedContract, /no longer bound by compiled Functions/);

  assert.doesNotMatch(runtime, /export \* from ["']\.\/stripePayment["']/);
  assert.match(runtime, /export \* from ["']\.\/stripePaymentPhase1Hold["']/);
  assert.doesNotMatch(phase1StripeHold, /defineSecret|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
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
