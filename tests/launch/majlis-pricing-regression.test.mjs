import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootEnginePath = 'src/utils/calculateUaeQuote2026.ts';
const functionsEnginePath = 'functions/pricing/calculateUaeQuote2026.ts';
const sharedEnginePath = 'packages/shared/src/pricing/calculateUaeQuote2026.ts';
const rootMatrixPath = 'src/utils/uaePricingMatrix2026.ts';

const rootEngine = readFileSync(rootEnginePath, 'utf8');
const functionsEngine = readFileSync(functionsEnginePath, 'utf8');
const sharedEngine = readFileSync(sharedEnginePath, 'utf8');
const rootMatrix = readFileSync(rootMatrixPath, 'utf8');

test('Majlis pricing is flat per facility and cannot be multiplied by generic room/unit counts', () => {
  const facilityBranch = rootEngine.indexOf("if (assetClass.pricingUnit === 'facility') {");
  const genericUnitBranch = rootEngine.indexOf("} else if (assetClass.pricingUnit === 'unit') {", facilityBranch);

  assert.ok(facilityBranch >= 0, 'Facility pricing guard must exist in the quote engine');
  assert.ok(genericUnitBranch > facilityBranch, 'Facility pricing must run before generic per-unit multiplication');
  assert.match(rootEngine, /Flat annual facility rate of AED \$\{baseRate\} applied once\./);
  assert.match(rootEngine, /const addOnDriver = assetClass\.pricingUnit === 'facility' \? \{ \.\.\.safeInput, units: 1, offices: 0, shops: 0 \} : safeInput;/);

  assert.match(rootEngine, /case 'Government Majlis': return 'government_majlis';/);
  assert.match(rootEngine, /case 'Private Majlis': return 'private_majlis';/);
  assert.match(rootMatrix, /id: 'government_majlis'[\s\S]*?pricingUnit: 'facility'/);
  assert.match(rootMatrix, /id: 'private_majlis'[\s\S]*?pricingUnit: 'facility'/);
});

test('browser, functions, and shared quote engines use the same Majlis pricing implementation', () => {
  assert.equal(functionsEngine, rootEngine, 'Cloud Functions pricing engine drifted from the browser engine');
  assert.equal(sharedEngine, rootEngine, 'Shared pricing engine drifted from the browser engine');
});
