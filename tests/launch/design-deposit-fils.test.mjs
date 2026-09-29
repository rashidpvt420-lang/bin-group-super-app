import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('preliminary design deposit matches the server fils formula', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '--input-type=module',
    '-e',
    `import { getDepositAmount, buildDesignExecutionDetails } from './src/utils/aiDesignStudioWorkflow.ts';
     import { designDeposit } from './functions/designPaymentPolicy.ts';
     for (const sample of [10.1, 100.4, 2500, 3333.33]) {
       if (getDepositAmount(sample, 15) !== designDeposit(sample)) {
         throw new Error('deposit mismatch for ' + sample);
       }
     }
     if (getDepositAmount(0, 15) !== 0) throw new Error('non-positive deposit must stay zero');
     const details = buildDesignExecutionDetails({
       zoneType: 'majlis',
       designStyle: 'Modern',
       designObjective: 'refresh',
       quoteTotal: 100.4,
     });
     const payment = details.find((row) => row.category === 'Payment / 15% mobilization');
     if (!payment?.items.some((item) => item.includes('AED 15.06'))) {
       throw new Error('execution details dropped fils: ' + JSON.stringify(payment));
     }`,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('design deposit source no longer rounds the 15 percent deposit to a dirham', () => {
  const source = readFileSync('src/utils/aiDesignStudioWorkflow.ts', 'utf8');
  assert.doesNotMatch(source, /Math\.round\(total \* \(percent \/ 100\)\)/);
  assert.doesNotMatch(source, /Math\.round\(numeric\)\.toLocaleString/);
  assert.match(source, /Math\.round\(Math\.round\(value \* 100\) \* rate \/ 100\) \/ 100/);
});
