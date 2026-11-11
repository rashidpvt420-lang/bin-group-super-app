import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = await loadTsModules(path.join(root, 'functions/runTransactionWithRetry.ts'));

test('retries aborted transaction errors and succeeds', async () => {
  let attempts = 0;
  const db = {
    runTransaction: async (fn) => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('10 ABORTED: Transaction lock timeout.');
        error.code = '10';
        throw error;
      }
      return fn({ get() { return null; } });
    },
  };
  const result = await mod.runTransactionWithRetry(db, async () => 'ok');
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('does not retry failed-precondition HttpsError', async () => {
  const { HttpsError } = await import('firebase-functions/v2/https').catch(() => ({ HttpsError: class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }}));
  // Use local classification if firebase-functions is unavailable.
  if (!mod.isRetryableTransactionError(Object.assign(new Error('closed'), { code: 'failed-precondition' }))) {
    assert.equal(mod.isRetryableTransactionError({ code: 'failed-precondition', message: 'no' }), false);
  }
  let attempts = 0;
  const db = {
    runTransaction: async () => {
      attempts += 1;
      const error = new Error('Technician has reached the concurrent mission limit.');
      error.code = 'failed-precondition';
      throw error;
    },
  };
  await assert.rejects(() => mod.runTransactionWithRetry(db, async () => 'no'), /concurrent mission|failed-precondition/);
  assert.equal(attempts, 1);
});
