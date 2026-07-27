import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [rules, callable, page, runtime, proofUtility] = await Promise.all([
  readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../../functions/proofVerification.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/pages/public/InvoiceVerificationPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../functions/runtime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/utils/proofVerification.ts', import.meta.url), 'utf8'),
]);

test('invoice registry is not publicly readable through Firestore rules', () => {
  assert.match(rules, /match \/invoice_registry\/\{proofHash\} \{\s*allow read, create, update, delete: if false;\s*\}/);
  assert.doesNotMatch(rules, /match \/invoice_registry\/\{proofHash\}[\s\S]*allow get: if true/);
});

test('public verification is callable-only and returns no sensitive invoice fields', () => {
  assert.match(callable, /export const verifyPublicProof = onCall/);
  assert.match(callable, /enforceAppCheck: true/);
  assert.match(callable, /publicProofVerificationRateLimits/);
  assert.match(callable, /MAX_REQUESTS_PER_WINDOW/);
  assert.match(callable, /return \{ verified: snap\.exists === true \}/);
  assert.doesNotMatch(callable, /amount|reference|status|payer|ownerEmail|paymentReferenceId/);
  assert.match(runtime, /export \* from "\.\/proofVerification";/);
});

test('public verification page no longer reads invoice registry documents', () => {
  assert.match(page, /httpsCallable\(functions, 'verifyPublicProof'\)/);
  assert.match(page, /valid: response\?\.data\?\.verified === true/);
  assert.doesNotMatch(page, /getDoc\(doc\(db,\s*registryFor/);
  assert.doesNotMatch(page, /invoice_registry|contract_registry|entityId|ownerId/);
  assert.match(page, /BIN_VERIFIED_RECORD/);
  assert.doesNotMatch(page, /searchParams\.get\('id'\)|searchParams\.get\('ref'\)/);
  assert.doesNotMatch(proofUtility, /[?&]id=\$\{|[?&]ref=\$\{/);
});
