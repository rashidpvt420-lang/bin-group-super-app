import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (path) => readFileSync(path, 'utf8');
const ts = createRequire(import.meta.url)('typescript');

function loadShared(relative) {
  const compiled = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const sandbox = {
    exports: {},
    require: (id) => {
      if (id === './aedMoney') return loadShared('functions/shared/aedMoney.ts');
      throw new Error(`unexpected import ${id}`);
    },
  };
  runInNewContext(compiled, sandbox, { filename: relative });
  return sandbox.exports;
}

test('15 percent mobilisation keeps fils and matches portfolio quote rounding', () => {
  const { formatAedMoney } = loadShared('functions/shared/aedMoney.ts');
  const { mobilisationDepositFromAnnual } = loadShared('functions/shared/mobilisationDeposit.ts');
  for (const annual of [100.4, 10.1, 3333.33, 82305]) {
    const expected = Math.round(Math.round(annual * 100) / 100 * 0.15 * 100) / 100;
    assert.equal(mobilisationDepositFromAnnual(annual), expected, `deposit mismatch for ${annual}`);
  }
  assert.equal(mobilisationDepositFromAnnual(0), 0);
  assert.equal(formatAedMoney(15.06), 'AED 15.06');
  assert.notEqual(Math.round(100.4 * 0.15), mobilisationDepositFromAnnual(100.4));
});

test('owner contract download and onboarding deposit fallbacks keep fils', () => {
  const contracts = read('src/owner/pages/OwnerContractsResolvedPage.tsx');
  const payment = read('src/components/onboarding/PaymentSummaryStep.tsx');
  const inspection = read('src/components/onboarding/InspectionSubmissionStep.tsx');
  const signature = read('src/components/onboarding/ContractSignatureStep.tsx');

  assert.doesNotMatch(read('functions/shared/aedMoney.ts'), /mobilisationDepositFromAnnual/);
  assert.match(read('functions/shared/mobilisationDeposit.ts'), /export function mobilisationDepositFromAnnual/);
  assert.match(contracts, /formatAedMoney\(numeric\)/);
  assert.match(contracts, /mobilisationDepositFromAnnual\(annual\)/);
  assert.doesNotMatch(contracts, /Math\.round\(numeric\)/);
  assert.doesNotMatch(contracts, /annual \* 0\.15/);

  for (const source of [payment, inspection, signature]) {
    assert.match(source, /mobilisationDepositFromAnnual\(/);
    assert.doesNotMatch(source, /Math\.round\([^)]*\* 0\.15\)/);
  }
});
