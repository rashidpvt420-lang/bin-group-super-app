import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const deploySource = await readFile(
  new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url),
  'utf8',
);

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
