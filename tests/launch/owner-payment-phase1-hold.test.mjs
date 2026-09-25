import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('retired pre-inspection Owner payment callable is explicitly overridden by the Phase 1 hold', async () => {
  const [runtime, hold] = await Promise.all([
    read('functions/runtime.ts'),
    read('functions/ownerOnboardingPaymentPhase1Hold.ts'),
  ]);

  const legacyStar = runtime.indexOf('export * from "./secureOwnerRegistrationRequest";');
  const holdExport = runtime.indexOf('export { submitOwnerOnboardingPaymentPackage } from "./ownerOnboardingPaymentPhase1Hold";');
  assert.ok(legacyStar >= 0 && holdExport > legacyStar, 'explicit Phase 1 hold must override the historical wildcard export');
  assert.match(hold, /PHASE1_OWNER_PAYMENT_METHODS = new Set\(\["CASH", "CHEQUE"\]\)/);
  assert.match(hold, /!PHASE1_OWNER_PAYMENT_METHODS\.has\(method\)/);
  assert.match(hold, /pre-inspection Owner payment flow is retired/);
  assert.match(hold, /inspection-first onboarding workflow/);
  assert.doesNotMatch(hold, /createStripeCheckoutSession|BANK_TRANSFER|STRIPE_SECRET_KEY|stripe\.paymentIntents/);
});

test('live inspection-first Owner mobilisation path preserves fils and allows only Cash or Cheque', async () => {
  const source = await read('functions/inspectionFirstOwnerOnboarding.ts');
  assert.match(source, /const money = \(value: unknown\) => Math\.round\(finite\(value\) \* 100\) \/ 100;/);
  assert.match(source, /if \(!\["CASH", "CHEQUE"\]\.includes\(method\)\)/);
  assert.match(source, /Phase 1 Owner activation accepts Cash or Cheque only/);
  assert.match(source, /expectedAmount = normalizeAedMoney\(payment\.activationDeposit \?\? payment\.amount\)/);
  assert.match(source, /submittedAmount !== expectedAmount/);
  assert.match(source, /const amountReceived = expectedAmount/);
  assert.doesNotMatch(source, /Math\.abs\(amountReceived - expectedAmount\) > 0\.01/);
  assert.match(source, /loadActivePaymentConfiguration\(\)/);
});
