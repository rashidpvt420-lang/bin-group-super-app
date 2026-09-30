// Behavioural: BOTH (Maintenance + Property Management) and PM-only must be refused for any
// pricing class whose management rate is 0% (e.g. Government Majlis, Stadium). Runs the real
// server quote engine (functions/ownerOnboardingQuote.ts) and all three calculator copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ENGINE_COPIES = [
  'functions/pricing/calculateUaeQuote2026.ts',
  'src/utils/calculateUaeQuote2026.ts',
  'packages/shared/src/pricing/calculateUaeQuote2026.ts',
];
const modules = {};
let tempDir;

async function bundle(entry, name) {
  const outfile = join(tempDir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-zero-pm-'));
  modules.server = await bundle('functions/ownerOnboardingQuote.ts', 'server');
  modules.matrix = await bundle('functions/pricing/uaePricingMatrix2026.ts', 'matrix');
  for (const [index, path] of ENGINE_COPIES.entries()) modules[path] = await bundle(path, `engine-${index}`);
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const T = 1790000000000;
const zeroPmClasses = () => modules.matrix.UAE_PRICING_MATRIX_2026.assetClasses
  .filter((asset) => Number(asset.managementRange.max) <= 0)
  .map((asset) => asset.id);

function engineInput(assetClassId, contractType) {
  return {
    assetClassId, emirate: 'Dubai', zone: 'B', contractType, sqft: 10000, units: 1, beds: 10,
    annualRent: 1000000, propertyAge: 3, slaTier: 'standard', paymentPlan: 'annual',
  };
}

test('the matrix still has 0% management classes to guard (Government Majlis, Stadium among them)', () => {
  const ids = zeroPmClasses();
  assert.ok(ids.includes('government_majlis'));
  assert.ok(ids.includes('stadium'));
});

test('all three engine copies refuse BOTH and PM-only for every 0% management class, and still price Maintenance Only', () => {
  for (const path of ENGINE_COPIES) {
    const { calculateUaeQuote2026 } = modules[path];
    for (const id of zeroPmClasses()) {
      for (const contractType of ['BOTH', 'PM_ONLY']) {
        const quote = calculateUaeQuote2026(engineInput(id, contractType));
        assert.equal(quote.annualTotal, 0, `${path} ${id} ${contractType} must not be priced`);
        assert.ok(quote.riskFlags.includes('PM_NOT_SUPPORTED'), `${path} ${id} ${contractType} must flag PM_NOT_SUPPORTED`);
      }
      const fm = calculateUaeQuote2026(engineInput(id, 'FM_ONLY'));
      assert.ok(fm.annualTotal > 0, `${path} ${id} FM_ONLY must still be priced`);
    }
  }
});

test('the server quote fails with a clear PM_NOT_SUPPORTED error for BOTH on Government Majlis and Stadium', () => {
  const { calculateOwnerOnboardingQuote: quote } = modules.server;
  const majlis = { propertyType: 'Government Majlis', emirate: 'Dubai', annualRent: 100000 };
  const stadium = { propertyType: 'Stadium', emirate: 'Dubai', sqft: 10000, annualRent: 1000000 };
  for (const property of [majlis, stadium]) {
    for (const strategy of ['both', 'pm']) {
      assert.throws(
        () => quote([{ ...property, strategy }], [], T),
        (error) => /could not be priced/.test(error.message) && /PM_NOT_SUPPORTED/.test(error.message) && /does not support/.test(error.message),
        `${property.propertyType} ${strategy}`,
      );
    }
  }
  // Maintenance Only is unaffected: Government Majlis 25,000 x Dubai 1.15 = 28,750.00.
  assert.equal(quote([{ ...majlis, strategy: 'fm' }], [], T).annualContractValue, 28750);
  assert.equal(quote([{ ...stadium, strategy: 'fm' }], [], T).annualContractValue, 193200);
});

test('BOTH for a class with a real management rate is unchanged (apartment: 1,725 FM + 5,000 PM)', () => {
  const { calculateOwnerOnboardingQuote: quote } = modules.server;
  const result = quote([{ propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, strategy: 'both', annualRent: 100000 }], [], T);
  assert.equal(result.annualContractValue, 6725);
  assert.equal(result.activationDeposit, 1008.75);
});

test('an admin-verified BOTH quote for a 0% management class is refused too', () => {
  for (const path of ENGINE_COPIES) {
    const quote = modules[path].calculateUaeQuote2026({ ...engineInput('government_majlis', 'BOTH'), ratesVerified: true, verifiedMaintenanceRate: 30000, verifiedManagementRate: 0 });
    assert.equal(quote.annualTotal, 0);
    assert.ok(quote.riskFlags.includes('PM_NOT_SUPPORTED'));
  }
});
