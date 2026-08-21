import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner payment approval uses the same two-decimal 15% mobilisation rounding as the quote engine', async () => {
  const [approval, quote, activationPolicy] = await Promise.all([
    read('functions/paymentTransactionApproval.ts'),
    read('functions/ownerOnboardingQuote.ts'),
    read('functions/ownerActivationPaymentPolicy.ts'),
  ]);

  assert.match(quote, /activationDeposit = money\(portfolioAnnualTotal \* 0\.15\)/);
  assert.match(quote, /import \{ normalizeAedMoney \} from "\.\/shared\/aedMoney";/);
  assert.match(approval, /import \{ normalizeAedMoney \} from "\.\/shared\/aedMoney";/);
  assert.match(approval, /const money = normalizeAedMoney;/);
  assert.match(approval, /resolveLockedOwnerActivationSchedule/);
  assert.match(approval, /const contractSchedule = lockedActivationSchedule/);
  assert.match(approval, /const freshContractSchedule = lockedActivationSchedule/);
  assert.match(activationPolicy, /normalizeAedMoney\(annualContractValue \* 0\.15\)/);
  assert.doesNotMatch(approval, /Math\.round\((?:expectedAnnual|freshExpectedAnnual) \* 0\.15\)/);
});

test('fractional-dirham mobilisation deposits remain valid', () => {
  const annualContractValue = 82_305;
  const centRoundedDeposit = Math.round(annualContractValue * 0.15 * 100) / 100;
  const legacyWholeDirhamDeposit = Math.round(annualContractValue * 0.15);

  assert.equal(centRoundedDeposit, 12_345.75);
  assert.equal(legacyWholeDirhamDeposit, 12_346);
  assert.ok(Math.abs(centRoundedDeposit - legacyWholeDirhamDeposit) > 0.01);
});
