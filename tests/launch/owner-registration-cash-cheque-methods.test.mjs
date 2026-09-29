import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const read = (path) => readFileSync(path, 'utf8');

let policy;
let tempDir;

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-cash-cheque-methods-'));
  const outfile = join(tempDir, 'owner-activation-payment-policy.mjs');
  await build({
    entryPoints: ['functions/ownerRegistrationPaymentMethods.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  policy = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});

test.after(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

test('owner registration accepts Cash and Cheque and rejects Stripe and bank transfer', () => {
  assert.equal(policy.phase1OwnerActivationMethodOrNull('CASH'), 'CASH');
  assert.equal(policy.phase1OwnerActivationMethodOrNull('CHEQUE'), 'CHEQUE');
  assert.equal(policy.phase1OwnerActivationMethodOrNull(' cash '), 'CASH');
  assert.equal(policy.phase1OwnerActivationMethodOrNull('cheque'), 'CHEQUE');
  for (const method of ['STRIPE', 'BANK_TRANSFER', 'CARD', 'stripe', 'bank_transfer', '', null]) {
    assert.equal(policy.phase1OwnerActivationMethodOrNull(method), null, String(method));
  }

  const secure = read('functions/secureOwnerRegistrationRequest.ts');
  const legacy = read('functions/ownerRegistrationRequest.ts');
  assert.match(secure, /phase1OwnerActivationMethodOrNull\(data\.paymentMethod \|\| data\.paymentManifest\.method\)/);
  assert.match(secure, /if \(!acceptedMethod\) throw new HttpsError\("invalid-argument", "Unsupported payment method\."\)/);
  assert.match(legacy, /phase1OwnerActivationMethodOrNull\(cleanText\(data\.paymentMethod, "paymentMethod", 60\)\)/);
  assert.match(legacy, /if \(!paymentMethod\) \{\s*throw new HttpsError\("invalid-argument", "Unsupported payment method\."\);/);
  assert.doesNotMatch(secure, /SUPPORTED_METHODS/);
  assert.doesNotMatch(secure, /"STRIPE"/);
  assert.doesNotMatch(secure, /new Set\(\["STRIPE", "BANK_TRANSFER", "CHEQUE", "CASH"\]\)/);
  assert.doesNotMatch(secure, /new Set\(\["BANK_TRANSFER", "CHEQUE", "CASH"\]\)/);
  assert.match(secure, /submitted bank-transfer instructions do not match/);
  assert.doesNotMatch(legacy, /\["STRIPE", "BANK_TRANSFER", "CHEQUE", "CASH"\]/);
  assert.match(secure, /loadActivePaymentConfiguration\(\)/);
  assert.match(secure, /!activeConfiguration\.approvedMethods\.includes\(method\)/);
});

test('the deployed registration callable is the Cash/Cheque hold, not the historical allowlist', () => {
  const runtime = read('functions/runtime.ts');
  const runtimeAll = read('functions/runtimeAll.ts');
  const packageJson = read('functions/package.json');
  const hold = read('functions/ownerOnboardingPaymentPhase1Hold.ts');
  const index = read('functions/index.ts');
  const secure = read('functions/secureOwnerRegistrationRequest.ts');

  const legacyStar = runtime.indexOf('export * from "./secureOwnerRegistrationRequest";');
  const holdExport = runtime.indexOf('export { submitOwnerOnboardingPaymentPackage } from "./ownerOnboardingPaymentPhase1Hold";');
  assert.ok(legacyStar >= 0 && holdExport > legacyStar);
  assert.match(runtimeAll, /export \* from '\.\/runtime'/);
  assert.match(packageJson, /"main": "lib\/runtimeAll\.js"/);
  assert.match(hold, /PHASE1_OWNER_PAYMENT_METHODS = new Set\(\["CASH", "CHEQUE"\]\)/);
  assert.match(hold, /pre-inspection Owner payment flow is retired/);
  assert.doesNotMatch(secure, /onRequest\(/);
  assert.doesNotMatch(index, /submitOwnerOnboardingPaymentPackageHandler/);
  const legacyOnboarding = index.slice(index.indexOf('export const submitOwnerOnboarding'));
  assert.match(legacyOnboarding.slice(0, 800), /Legacy owner onboarding is disabled/);
});
