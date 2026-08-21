import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let money;
let policy;
let tempDirectory;

test.before(async () => {
  tempDirectory = mkdtempSync(join(tmpdir(), 'bin-aed-half-cent-'));
  const moneyOutput = join(tempDirectory, 'aed-money.mjs');
  const policyOutput = join(tempDirectory, 'owner-policy.mjs');
  await Promise.all([
    build({
      entryPoints: ['functions/shared/aedMoney.ts'],
      outfile: moneyOutput,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'silent',
    }),
    build({
      entryPoints: ['functions/ownerActivationPaymentPolicy.ts'],
      outfile: policyOutput,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'silent',
    }),
  ]);
  money = await import(`${pathToFileURL(moneyOutput).href}?v=${Date.now()}`);
  policy = await import(`${pathToFileURL(policyOutput).href}?v=${Date.now()}`);
});

test.after(() => {
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
});

test('AED percentage arithmetic is decimal-safe at the controlled half-cent boundary', () => {
  assert.equal(money.percentageOfAed(10_000.30, 15), 1_500.05);
  assert.equal(money.percentageOfAed(318_784.00, 15), 47_817.60);
  assert.equal(money.percentageOfAed(82_305.00, 15), 12_345.75);
});

test('AED minor-unit normalization handles exact, below-half and above-half cent values', () => {
  assert.equal(money.normalizeAedMoney('1.230'), 1.23);
  assert.equal(money.normalizeAedMoney('1.234'), 1.23);
  assert.equal(money.normalizeAedMoney('1.235'), 1.24);
  assert.equal(money.normalizeAedMoney('1.236'), 1.24);
  assert.equal(money.normalizeAedMoney('5e-3'), 0.01);
});

test('AED helpers reject malformed, non-finite and unsafe values', () => {
  for (const value of ['abc', '', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => money.toAedCents(value), RangeError);
  }
  assert.throws(() => money.fromAedCents(Number.MAX_SAFE_INTEGER + 1), RangeError);
  assert.throws(() => money.percentageOfAed(100, 15, 0), RangeError);
});

test('locked Owner activation schedule uses the same decimal-safe 15% result', () => {
  const cases = [
    [10_000.30, 1_500.05],
    [318_784.00, 47_817.60],
    [82_305.00, 12_345.75],
  ];

  for (const [annualContractValue, activationDeposit] of cases) {
    const result = policy.resolveLockedOwnerActivationSchedule(
      { quoteSnapshot: { annualContractValue, activationDeposit } },
      activationDeposit,
    );
    assert.equal(result.annualContractValue, annualContractValue);
    assert.equal(result.mobilizationAmount, activationDeposit);
  }
});

test('invalid or negative locked activation schedules still fail closed', () => {
  assert.throws(() => policy.resolveLockedOwnerActivationSchedule(
    { quoteSnapshot: { annualContractValue: 10_000.30, activationDeposit: 1_500.04 } },
    1_500.04,
  ), /locked activation deposit/i);

  assert.throws(() => policy.resolveLockedOwnerActivationSchedule(
    { quoteSnapshot: { annualContractValue: -100, activationDeposit: -15 } },
    -15,
  ), /positive AED amounts/i);
});
