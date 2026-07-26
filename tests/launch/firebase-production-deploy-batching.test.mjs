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
  assert.match(source, /batchSize: functionBatchSize/);
  assert.match(source, /interBatchDelaySeconds: functionBatchDelaySeconds/);
  assert.doesNotMatch(
    source,
    /retryFirebase\(\s*['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/,
  );
});

test('non-function Firebase services deploy only after all Function batches', async () => {
  const source = await read('scripts/deploy-firebase-production.mjs');
  const adminMfa = source.indexOf('adminMfaEvidence = await verifyAdminMfaProduction');
  const functionsIndex = source.indexOf('deployFunctionsInBatches();');
  const servicesIndex = source.search(
    /retryFirebase\(\s*['"]firestore:rules,firestore:indexes,storage,hosting['"]/,
  );
  const metadataIndex = source.indexOf("'scripts/write-production-deployment-metadata.mjs'");

  assert.ok(adminMfa >= 0, 'Admin MFA production preflight is missing');
  assert.ok(functionsIndex > adminMfa, 'Function batches must remain behind Admin MFA verification');
  assert.ok(servicesIndex > functionsIndex, 'Hosting/rules/storage must deploy after all Function batches');
  assert.ok(metadataIndex > servicesIndex, 'deployment metadata must be written after every Firebase service succeeds');
});