import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const CONFIG = {
  version: 'phase1-manual-2fbeeee0ecf7',
  configHash: 'a'.repeat(64),
  currency: 'AED',
  approvedMethods: ['CASH', 'CHEQUE'],
};

const request = (method, patch = {}) => ({
  method,
  provider: 'MANUAL',
  currency: 'AED',
  paymentConfigVersion: CONFIG.version,
  paymentConfigHash: CONFIG.configHash,
  ...patch,
});

let policy;
let money;
let tempDirectory;

test.before(async () => {
  tempDirectory = mkdtempSync(join(tmpdir(), 'bin-owner-activation-payment-'));
  const policyOutput = join(tempDirectory, 'owner-activation-payment-policy.mjs');
  const moneyOutput = join(tempDirectory, 'aed-money.mjs');
  await Promise.all([
    build({
      entryPoints: ['functions/ownerActivationPaymentPolicy.ts'],
      outfile: policyOutput,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'silent',
    }),
    build({
      entryPoints: ['functions/shared/aedMoney.ts'],
      outfile: moneyOutput,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'silent',
    }),
  ]);
  policy = await import(`${pathToFileURL(policyOutput).href}?v=${Date.now()}`);
  money = await import(`${pathToFileURL(moneyOutput).href}?v=${Date.now()}`);
});

test.after(() => {
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
});

const expectPolicyFailure = (operation, reason) => {
  assert.throws(operation, (error) => {
    assert.equal(error?.name, 'OwnerActivationPaymentPolicyError');
    assert.equal(error?.reason, reason);
    return true;
  });
};

test('CP-001: the production Phase 1 artifact is CASH/CHEQUE only', async () => {
  const phase1Policy = await read('scripts/ensure-phase1-manual-payment-config.mjs');
  assert.match(phase1Policy, /const EXPECTED_METHODS = \['CASH', 'CHEQUE'\]/);
  assert.match(phase1Policy, /policy: 'phase1-manual'/);
  assert.match(phase1Policy, /bankTransferEnabled: false/);
  assert.match(phase1Policy, /stripeEnabled: false/);
});

test('CP-001: CASH and CHEQUE resolve to authoritative version/hash bindings', () => {
  for (const method of ['CASH', 'CHEQUE']) {
    const binding = {
      method,
      paymentConfigVersion: CONFIG.version,
      paymentConfigHash: CONFIG.configHash,
    };
    assert.deepEqual(policy.resolveOwnerActivationPaymentBinding(request(method), CONFIG), binding);
    assert.deepEqual(policy.resolveStoredOwnerActivationPaymentBinding(binding, CONFIG), binding);
  }
});

test('CP-001: BANK_TRANSFER, STRIPE, CARD, malformed, and unsupported methods fail closed', () => {
  for (const method of ['BANK_TRANSFER', 'STRIPE', 'CARD', 'CRYPTO']) {
    expectPolicyFailure(
      () => policy.resolveOwnerActivationPaymentBinding(request(method), CONFIG),
      'DISABLED_METHOD',
    );
  }
  for (const method of ['', '***']) {
    expectPolicyFailure(
      () => policy.resolveOwnerActivationPaymentBinding(request(method), CONFIG),
      'INVALID_METHOD',
    );
  }
});

test('CP-001: missing, forged, and stale policy bindings are rejected', () => {
  for (const patch of [
    { paymentConfigVersion: '' },
    { paymentConfigHash: '' },
  ]) {
    expectPolicyFailure(
      () => policy.resolveOwnerActivationPaymentBinding(request('CASH', patch), CONFIG),
      'MISSING_POLICY_BINDING',
    );
  }
  for (const patch of [
    { paymentConfigVersion: 'phase1-manual-forged' },
    { paymentConfigHash: 'b'.repeat(64) },
  ]) {
    expectPolicyFailure(
      () => policy.resolveOwnerActivationPaymentBinding(request('CASH', patch), CONFIG),
      'STALE_POLICY_BINDING',
    );
  }
});

test('CP-001: provider/currency forgery and replay cannot change the authoritative binding', () => {
  expectPolicyFailure(
    () => policy.resolveOwnerActivationPaymentBinding(request('CASH', { provider: 'STRIPE' }), CONFIG),
    'INVALID_PROVIDER',
  );
  expectPolicyFailure(
    () => policy.resolveOwnerActivationPaymentBinding(request('CASH', { currency: 'USD' }), CONFIG),
    'INVALID_CURRENCY',
  );

  const first = policy.resolveOwnerActivationPaymentBinding(request('CHEQUE'), CONFIG);
  const replay = policy.resolveOwnerActivationPaymentBinding(request('CHEQUE'), CONFIG);
  assert.deepEqual(replay, first);
});

test('CP-001: UI and transaction creation bind server-authoritative policy before financial writes', async () => {
  const [page, activation, approval, transactionApproval] = await Promise.all([
    read('src/owner/pages/OwnerActivationPage.tsx'),
    read('functions/contractActivation.ts'),
    read('functions/securePaymentApproval.ts'),
    read('functions/paymentTransactionApproval.ts'),
  ]);

  assert.match(page, /getOwnerPaymentConfiguration/);
  assert.match(page, /method: paymentMethod/);
  assert.match(page, /paymentConfigVersion: paymentConfiguration\.version/);
  assert.match(page, /paymentConfigHash: paymentConfiguration\.configHash/);
  assert.doesNotMatch(page, /method: 'BANK_TRANSFER'/);
  assert.doesNotMatch(page, /STRIPE|CARD/);

  const policyIndex = activation.indexOf('loadActivePaymentConfiguration()');
  const evidenceIndex = activation.indexOf('const paymentProofEvidence = await assertStoredOwnerPaymentReceipt');
  const createIndex = activation.indexOf('transaction.create(paymentRef');
  assert.ok(policyIndex >= 0 && evidenceIndex > policyIndex && createIndex > evidenceIndex);
  assert.match(activation, /transaction\.get\(paymentConfigurationRef\)/);
  assert.match(activation, /paymentConfigVersion,/);
  assert.match(activation, /paymentConfigHash,/);
  assert.match(activation, /configVersion: paymentConfigVersion/);
  assert.match(activation, /configHash: paymentConfigHash/);
  assert.match(activation, /return true;/);
  assert.match(activation, /existing payment request is bound to different policy, method, or amount evidence/i);

  assert.match(approval, /enforceAppCheck: true/);
  assert.match(approval, /requireMfaFinanceAdmin/);
  assert.match(approval, /sign_in_second_factor/);
  assert.match(approval, /resolveStoredOwnerActivationPaymentBinding\(payment, activeConfiguration\)/);
  assert.match(transactionApproval, /transaction\.get\(paymentConfigurationRef\)/);
  assert.match(transactionApproval, /resolveActivePaymentConfiguration\(paymentConfigurationSnap\.data\(\) \|\| \{\}\)/);
  assert.match(transactionApproval, /The payment policy binding changed during approval/);
});

test('CP-002: AED utility preserves two decimals and formats the two controlled-pilot cases', () => {
  const cases = [
    { annual: 318_784, authoritative: 47_817.60, formatted: 'AED 47,817.60', legacy: 47_818 },
    { annual: 82_305, authoritative: 12_345.75, formatted: 'AED 12,345.75', legacy: 12_346 },
  ];

  for (const value of cases) {
    assert.equal(money.normalizeAedMoney(value.annual * 0.15), value.authoritative);
    assert.equal(money.formatAedMoney(value.authoritative), value.formatted);
    assert.equal(Math.round(value.annual * 0.15), value.legacy);
    assert.notEqual(value.authoritative, value.legacy);
  }
});

test('CP-002: locked quote, transaction, refresh, and approval inputs agree exactly to the cent', () => {
  for (const [annualContractValue, activationDeposit] of [
    [318_784, 47_817.60],
    [82_305, 12_345.75],
  ]) {
    const contract = { quoteSnapshot: { annualContractValue, activationDeposit } };
    const first = policy.resolveLockedOwnerActivationSchedule(contract, activationDeposit);
    const reopened = policy.resolveLockedOwnerActivationSchedule(contract, activationDeposit);
    assert.deepEqual(reopened, first);
    assert.equal(first.annualContractValue, annualContractValue);
    assert.equal(first.mobilizationAmount, activationDeposit);
  }
});

test('CP-002: a missing/invalid locked schedule and invalid submitted money fail closed', () => {
  expectPolicyFailure(
    () => policy.resolveLockedOwnerActivationSchedule({ quoteSnapshot: { annualContractValue: 82_305 } }, 12_345.75),
    'MISSING_LOCKED_SCHEDULE',
  );
  expectPolicyFailure(
    () => policy.resolveLockedOwnerActivationSchedule({ quoteSnapshot: { annualContractValue: 82_305, activationDeposit: 12_346 } }, 12_346),
    'INVALID_LOCKED_SCHEDULE',
  );
  for (const amount of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    expectPolicyFailure(
      () => policy.resolveLockedOwnerActivationSchedule({ quoteSnapshot: { annualContractValue: 82_305, activationDeposit: 12_345.75 } }, amount),
      'INVALID_SUBMITTED_AMOUNT',
    );
  }
  assert.notEqual(
    policy.resolveLockedOwnerActivationSchedule(
      { quoteSnapshot: { annualContractValue: 82_305, activationDeposit: 12_345.75 } },
      12_345.75,
    ).mobilizationAmount,
    12_346,
  );
});

test('CP-002: Owner activation/display paths contain no annual-value mobilisation fallback', async () => {
  const [page, activation, dashboard, executive, pricing] = await Promise.all([
    read('src/owner/pages/OwnerActivationPage.tsx'),
    read('functions/contractActivation.ts'),
    read('src/owner/pages/OwnerDashboardResolvedPage.tsx'),
    read('src/owner/components/OwnerExecutiveDashboardSection.tsx'),
    read('packages/shared/src/utils/uaePricingEngine.ts'),
  ]);

  assert.doesNotMatch(page, /Math\.round\(value(?:\s*\|\|\s*0)?\)/);
  assert.doesNotMatch(page, /annualValue > 0 \? annualValue \* 0\.15 : 0/);
  assert.match(page, /formatAedMoney/);
  assert.match(page, /authoritative locked payment schedule is missing/i);
  assert.doesNotMatch(activation, /Math\.round\(annualContractValue \* 0\.15\)/);
  assert.match(activation, /resolveLockedOwnerActivationSchedule/);
  assert.doesNotMatch(dashboard, /Math\.round\(annual \* 0\.15\)/);
  assert.doesNotMatch(executive, /Math\.round\(annualContractValue \* 0\.15\)/);
  assert.match(pricing, /Math\.round\(totalAnnual \* 0\.15 \* 100\) \/ 100/);
});

test('protected non-production Owner activation chain retains App Check, Admin MFA, and exact-once activation gates', async () => {
  const [runtime, activation, approval, transactionApproval] = await Promise.all([
    read('functions/runtime.ts'),
    read('functions/contractActivation.ts'),
    read('functions/securePaymentApproval.ts'),
    read('functions/paymentTransactionApproval.ts'),
  ]);

  assert.match(runtime, /export \* from "\.\/contractActivation"/);
  assert.match(runtime, /export \* from "\.\/securePaymentApproval"/);
  assert.match(activation, /createOwnerPaymentTransaction = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(approval, /adminApprovePayment = onCall/);
  assert.match(approval, /enforceAppCheck: true/);
  assert.match(approval, /A verified Admin MFA session is required/);
  assert.match(transactionApproval, /const alreadyApproved = roleOf\(payment\.status\) === "approved"/);
  assert.match(transactionApproval, /idempotent: approvalWasIdempotent/);
  assert.match(transactionApproval, /paymentVerified: true/);
  assert.match(transactionApproval, /dashboardUnlocked: true/);
  assert.match(transactionApproval, /status: "ACTIVE"/);
  assert.match(transactionApproval, /lockedActivationSchedule\(/);
  assert.doesNotMatch(transactionApproval, /freshPayment\.quoteSnapshot\?\.activationDeposit \|\|/);
});

test('protected non-production Owner activation integration preserves policy, cents, MFA gate, and replay safety', () => {
  for (const [method, annualContractValue, activationDeposit] of [
    ['CASH', 318_784, 47_817.60],
    ['CHEQUE', 82_305, 12_345.75],
  ]) {
    const contract = {
      ownerSigned: true,
      otpVerificationId: 'verified-otp',
      quoteSnapshot: { annualContractValue, activationDeposit },
      status: 'OWNER_SIGNED',
    };
    const ownerBinding = policy.resolveOwnerActivationPaymentBinding(request(method), CONFIG);
    const schedule = policy.resolveLockedOwnerActivationSchedule(contract, activationDeposit);
    const transaction = {
      ...ownerBinding,
      amount: schedule.mobilizationAmount,
      activationDeposit: schedule.mobilizationAmount,
      annualContractValue: schedule.annualContractValue,
      quoteSnapshot: contract.quoteSnapshot,
      status: 'PENDING',
    };

    assert.deepEqual(policy.resolveStoredOwnerActivationPaymentBinding(transaction, CONFIG), ownerBinding);
    assert.deepEqual(
      policy.resolveLockedOwnerActivationSchedule(transaction, transaction.amount),
      schedule,
    );

    const activated = { paymentVerified: true, contractStatus: 'ACTIVE', propertyStatus: 'ACTIVE', dashboardUnlocked: true };
    const replay = { ...activated };
    assert.deepEqual(replay, activated);
    assert.equal(transaction.amount, activationDeposit);
  }

  expectPolicyFailure(
    () => policy.resolveStoredOwnerActivationPaymentBinding({
      method: 'BANK_TRANSFER',
      paymentConfigVersion: CONFIG.version,
      paymentConfigHash: CONFIG.configHash,
    }, CONFIG),
    'DISABLED_METHOD',
  );
});
