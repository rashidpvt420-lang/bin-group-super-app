import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(path, 'utf8');

test('15 percent mobilisation keeps fils and matches portfolio quote rounding', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module',
    '-e',
    `import { mobilisationDepositFromAnnual, formatAedMoney } from './functions/shared/aedMoney.ts';
     const samples = [100.4, 10.1, 3333.33, 82305];
     for (const annual of samples) {
       const expected = Math.round(Math.round(annual * 100) / 100 * 0.15 * 100) / 100;
       if (mobilisationDepositFromAnnual(annual) !== expected) {
         throw new Error('deposit mismatch for ' + annual);
       }
     }
     if (mobilisationDepositFromAnnual(0) !== 0) throw new Error('zero annual must stay zero');
     if (formatAedMoney(15.06) !== 'AED 15.06') throw new Error('format dropped fils: ' + formatAedMoney(15.06));
     if (Math.round(100.4 * 0.15) === mobilisationDepositFromAnnual(100.4)) {
       throw new Error('whole-dirham rounding unexpectedly matched fils');
     }`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('owner contract download and onboarding deposit fallbacks keep fils', () => {
  const contracts = read('src/owner/pages/OwnerContractsResolvedPage.tsx');
  const payment = read('src/components/onboarding/PaymentSummaryStep.tsx');
  const inspection = read('src/components/onboarding/InspectionSubmissionStep.tsx');
  const signature = read('src/components/onboarding/ContractSignatureStep.tsx');

  assert.match(contracts, /formatAedMoney\(numeric\)/);
  assert.match(contracts, /mobilisationDepositFromAnnual\(annual\)/);
  assert.doesNotMatch(contracts, /Math\.round\(numeric\)/);
  assert.doesNotMatch(contracts, /annual \* 0\.15/);

  for (const source of [payment, inspection, signature]) {
    assert.match(source, /mobilisationDepositFromAnnual\(/);
    assert.doesNotMatch(source, /Math\.round\([^)]*\* 0\.15\)/);
  }
});
