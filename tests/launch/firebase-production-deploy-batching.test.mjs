import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production deploy batches Cloud Functions below the regional mutation quota', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');

  assert.match(source, /boundedInteger\(process\.env\.FIREBASE_FUNCTION_BATCH_SIZE, 12, 1, 20\)/);
  assert.match(source, /FIREBASE_FUNCTION_BATCH_DELAY_SECONDS,[\s\S]*75,[\s\S]*60,[\s\S]*300/);
  assert.match(source, /value\.__endpoint \|\| value\.__trigger/);
  assert.match(source, /Deploying \$\{names\.length\} Functions in \$\{batches\.length\} sequential batch/);
  assert.match(source, /functions:\$\{name\}/);
  assert.match(source, /regional mutation quota/);
  assert.match(source, /strategy: 'sequential-batches'/);
  assert.match(source, /quotaSafeFullStack === true/);
  assert.match(source, /\{ quotaSafeFullStack: true \}/);
  assert.match(source, /target !== completeFirebaseProductionTarget/);
});

test('canonical full-stack deployment fans out before non-function Firebase services', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');
  const fullStackGuard = source.indexOf('if (options.quotaSafeFullStack === true)');
  const functionsIndex = source.indexOf('deployFunctionsInBatches();', fullStackGuard);
  const servicesIndex = source.indexOf("'Firestore, Storage and Hosting production services'", fullStackGuard);
  const canonicalCall = source.indexOf("'complete Firebase production stack'");

  assert.ok(fullStackGuard >= 0, 'Quota-safe full-stack dispatch guard is missing');
  assert.ok(functionsIndex > fullStackGuard, 'Function batches must execute inside the full-stack dispatch');
  assert.ok(servicesIndex > functionsIndex, 'Hosting/rules/storage must deploy after all Function batches');
  assert.ok(canonicalCall > functionsIndex, 'The protected canonical full-stack call must remain present');
});
