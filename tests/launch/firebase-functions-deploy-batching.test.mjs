import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  FUNCTIONS_DEPLOYMENT_STRATEGY,
  validateFunctionsDeploymentEvidence,
} from '../../scripts/lib/functions-deployment-evidence.mjs';

const deployUrl = new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url);
const verifierUrl = new URL('../../scripts/verify-production-deployment.mjs', import.meta.url);
const deploySource = await readFile(deployUrl, 'utf8');
const verifierSource = await readFile(verifierUrl, 'utf8');

const validEvidence = () => ({
  strategy: FUNCTIONS_DEPLOYMENT_STRATEGY,
  functionCount: 7,
  batchCount: 2,
  batchSize: 4,
  cooldownSeconds: 75,
  deployedFunctions: [
    'adminCreateUser',
    'dailyHrComplianceSweep',
    'getAdminSecurityProfile',
    'onScheduledServiceUpdated',
    'requestBrokerPayoutOtp',
    'scheduledServiceReminderCron',
    'verifyBrokerPayoutOtp',
  ],
});

test('production deployment and verification scripts parse under the repository Node runtime', () => {
  for (const url of [deployUrl, verifierUrl]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], {
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `${fileURLToPath(url)} failed Node syntax validation:\n${result.stderr || result.stdout}`,
    );
  }
});

test('production deployment never updates the entire Functions estate in one Firebase mutation burst', () => {
  assert.doesNotMatch(
    deploySource,
    /['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/,
  );
  assert.doesNotMatch(
    deploySource,
    /retryFirebase\(\s*['"]functions['"]/,
  );
  assert.match(deploySource, /function deployFunctionsQuotaSafe\(\)/);
  assert.match(deploySource, /functions:\$\{name\}/);
  assert.match(deploySource, /non-Functions Firebase production stack/);
});

test('quota-safe deployment discovers only compiled Firebase endpoints and triggers', () => {
  assert.match(deploySource, /functions\/lib\/runtimeAll\.js/);
  assert.match(deploySource, /value\.__endpoint \|\| value\.__trigger/);
  assert.match(deploySource, /No deployable Firebase Function exports were discovered/);
  assert.match(deploySource, /Invalid or duplicate Firebase Function export names/);
});

test('function batches are small, sequential and separated by at least one quota window', () => {
  assert.match(
    deploySource,
    /FIREBASE_FUNCTION_DEPLOY_BATCH_SIZE['"],\s*4,\s*1,\s*6/,
  );
  assert.match(
    deploySource,
    /FIREBASE_FUNCTION_DEPLOY_COOLDOWN_SECONDS['"],\s*75,\s*60,\s*300/,
  );
  assert.match(deploySource, /batches\.forEach\(\(batch, index\) =>/);
  assert.match(deploySource, /sleepSeconds\(cooldownSeconds,/);
  assert.match(deploySource, /regional Cloud Functions mutation quota/);
});

test('deployment metadata records the batching strategy used for the exact SHA', () => {
  assert.match(deploySource, /strategy: 'sequential-export-batches'/);
  assert.match(deploySource, /functionCount: functionNames\.length/);
  assert.match(deploySource, /batchCount: batches\.length/);
  assert.match(deploySource, /deployedFunctions: functionNames/);
  assert.match(
    deploySource,
    /deploymentMetadata\.functionsDeployment = functionDeploymentEvidence/,
  );
});

test('exact-SHA production verification requires valid batching evidence', () => {
  assert.deepEqual(validateFunctionsDeploymentEvidence(validEvidence()), []);
  assert.match(verifierSource, /validateFunctionsDeploymentEvidence\(existing\.functionsDeployment\)/);
  assert.match(verifierSource, /functionsDeployment: existing\?\.functionsDeployment \?\? null/);

  const missing = validateFunctionsDeploymentEvidence(null).join('\n');
  assert.match(missing, /missing or malformed/);

  const wrongStrategy = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    strategy: 'monolithic',
  }).join('\n');
  assert.match(wrongStrategy, /strategy/);

  const wrongCount = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    functionCount: 8,
  }).join('\n');
  assert.match(wrongCount, /functionCount/);

  const wrongBatches = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    batchCount: 3,
  }).join('\n');
  assert.match(wrongBatches, /batchCount/);

  const unsafeBatch = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    batchSize: 10,
  }).join('\n');
  assert.match(unsafeBatch, /batchSize/);

  const unsafeCooldown = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    cooldownSeconds: 30,
  }).join('\n');
  assert.match(unsafeCooldown, /cooldownSeconds/);

  const duplicateNames = validateFunctionsDeploymentEvidence({
    ...validEvidence(),
    functionCount: 8,
    deployedFunctions: [...validEvidence().deployedFunctions, 'adminCreateUser'],
  }).join('\n');
  assert.match(duplicateNames, /duplicates/);
});
