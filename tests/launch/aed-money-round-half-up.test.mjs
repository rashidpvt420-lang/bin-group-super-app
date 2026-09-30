// Behavioural: AED money rounds half-up to 2 decimal places (fils) on the decimal value, so
// 274.275 -> 274.28, and the quote, 15% deposit, locked activation schedule, frozen evidence
// gate and invoice helper all agree. Runs the real server quote engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { roundAed, aedTotalWithVat } from '../../src/utils/uaeVat.mjs';
import { verifyFrozenActivationPayment } from '../../scripts/run-frozen-release-evidence.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const m = {};
let tempDir;

async function bundle(entry, name) {
  const outfile = join(tempDir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-aed-half-up-'));
  m.money = await bundle('functions/shared/aedMoney.ts', 'money');
  m.deposit = await bundle('functions/shared/mobilisationDeposit.ts', 'deposit');
  m.policy = await bundle('functions/ownerActivationPaymentPolicy.ts', 'policy');
  m.server = await bundle('functions/ownerOnboardingQuote.ts', 'server');
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const HALF_CASES = [
  [274.275, 274.28], [1828.5 * 0.15, 274.28], [1.005, 1.01], [2.675, 2.68], [0.125, 0.13], [1.115, 1.12],
  [10.075, 10.08], [5485.5 * 0.05, 274.28], [0.165, 0.17], [0.015, 0.02], [-274.275, -274.28], [-0.005, -0.01],
];
const UNCHANGED_CASES = [
  [7083.38, 7083.38], [274.27, 274.27], [274.2749, 274.27], [274.2751, 274.28], [0.1 + 0.2, 0.3], [1500.15, 1500.15],
  [99999999.99, 99999999.99], [1e-7, 0], [0, 0], [-0, 0], [100, 100], ['1828.50', 1828.5],
];

test('normalizeAedMoney rounds half-up to the fils on the decimal value (274.275 -> 274.28)', () => {
  for (const [input, expected] of [...HALF_CASES, ...UNCHANGED_CASES]) {
    assert.equal(m.money.normalizeAedMoney(input), expected, `input ${input}`);
  }
  assert.ok(Object.is(m.money.normalizeAedMoney(-0.001), 0), 'negative zero is normalised to 0');
  for (const bad of [Number.NaN, Infinity, -Infinity, 'abc', Number.MAX_VALUE]) {
    assert.throws(() => m.money.normalizeAedMoney(bad), RangeError, `input ${String(bad)}`);
  }
  assert.equal(m.money.formatAedMoney(274.275), 'AED 274.28');
});

test('the invoice helper uses the identical rounding rule (80,000-value sweep)', () => {
  for (const [input, expected] of [...HALF_CASES, ...UNCHANGED_CASES]) assert.equal(roundAed(input), expected, `input ${input}`);
  for (let fils = -500_000; fils <= 1_500_000; fils += 100) {
    for (const value of [fils / 1000 + 0.0005, (fils + 5) / 1000, fils * 0.15 / 100, fils * 0.05 / 100]) {
      assert.equal(roundAed(value), m.money.normalizeAedMoney(value), `value ${value}`);
    }
  }
  // Net 5,485.50: 5% is 274.275 and is shown as 274.28 (VAT treatment itself is decided elsewhere).
  assert.deepEqual(aedTotalWithVat(5485.5), { net: 5485.5, vat: 274.28, total: 5759.78 });
});

test('real server quote: monthly-plan apartment deposit is 274.28, not 274.27', () => {
  const quote = m.server.calculateOwnerOnboardingQuote([
    { propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, strategy: 'fm', paymentPlan: 'monthly' },
  ], [], 1790000000000);
  assert.equal(quote.annualContractValue, 1828.5);
  assert.equal(quote.activationDeposit, 274.28);
  assert.equal(quote.remainingAmount, 1554.22);
  assert.equal(Math.round(quote.activationDeposit * 100) + Math.round(quote.remainingAmount * 100), 182850);
});

test('deposit helper, locked activation schedule and frozen evidence gate accept the same 274.28', () => {
  assert.equal(m.deposit.mobilisationDepositFromAnnual(1828.5), 274.28);
  const contract = { quoteSnapshot: { annualContractValue: 1828.5, activationDeposit: 274.28 } };
  const schedule = m.policy.resolveLockedOwnerActivationSchedule(contract, 274.28);
  assert.equal(schedule.annualContractValue, 1828.5);
  assert.equal(schedule.mobilizationAmount, 274.28);
  assert.throws(() => m.policy.resolveLockedOwnerActivationSchedule({ quoteSnapshot: { annualContractValue: 1828.5, activationDeposit: 274.27 } }, 274.27));
  assert.deepEqual(verifyFrozenActivationPayment({ amountReceived: 274.28, currency: 'AED' }, contract, repoRoot), { amount: 274.28, amountMinor: 27428 });
});

test('the frozen-release gate pins the current aedMoney.ts blob (re-pinned in the reviewed repair)', () => {
  const gate = readFileSync(new URL('../../scripts/run-frozen-release-evidence.mjs', import.meta.url), 'utf8');
  const pinned = /'functions\/shared\/aedMoney\.ts': '([0-9a-f]{40})'/.exec(gate)?.[1];
  const actual = execFileSync('git', ['hash-object', 'functions/shared/aedMoney.ts'], { cwd: repoRoot }).toString().trim();
  assert.equal(pinned, actual);
  assert.notEqual(pinned, '4526fb637327beb59bb11feb849f58fecc38ff0d', 'the pre-repair binary-rounding blob must not stay reviewed');
});

test('the onboarding submission 15% check uses the same rounding as the quote', () => {
  const source = readFileSync(new URL('../../functions/inspectionFirstOwnerOnboarding.ts', import.meta.url), 'utf8');
  assert.match(source, /const money = \(value: unknown\) => normalizeAedMoney\(finite\(value\)\);/);
  assert.doesNotMatch(source, /Math\.round\(finite\(value\) \* 100\) \/ 100/);
});
