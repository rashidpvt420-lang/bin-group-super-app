import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production deploy batches Cloud Functions below the regional mutation quota', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');

  assert.match(source, /FIREBASE_FUNCTION_BATCH_SIZE/);
  assert.match(source, /FIREBASE_FUNCTION_BATCH_DELAY_SECONDS/);
  assert.match(source, /functionBatchSize, 12, 1, 20/);
  assert.match(source, /functionBatchDelaySeconds,[\s\S]*75,[\s\S]*60,[\s\S]*300/);
  assert.match(source, /value\.__endpoint \|\| value\.__trigger/);
  assert.match(source, /Deploying \$\{names\.length\} Functions in \$\{batches\.length\} sequential batch/);
  assert.match(source, /functions:\$\{name\}/);
  assert.match(source, /regional mutation quota/);
  assert.match(source, /strategy: 'sequential-batches'/);
  assert.doesNotMatch(source, /'functions,hosting,firestore:rules,firestore:indexes,storage'/);
});

test('non-function Firebase services deploy only after all Function batches', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');
  const functionsIndex = source.indexOf('deployFunctionsInBatches();');
  const servicesIndex = source.indexOf("'firestore:rules,firestore:indexes,storage,hosting'");

  assert.ok(functionsIndex >= 0, 'Function batch deployment call is missing');
  assert.ok(servicesIndex > functionsIndex, 'Hosting/rules/storage must deploy after all Function batches');
});
