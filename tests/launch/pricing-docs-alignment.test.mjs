// Behavioural: the quote engine follows the pricing docs (Founder decision 2026-09-30) for the
// unambiguous rules: age uplift 11-20 yrs +15% / 20+ yrs +25%, height 15+ floors +8% / 40+ floors
// +15%, Luxury Villa minimum AED 15,000, and the 10% integrated (Maintenance + PM) bundle discount
// on (IFM + PM fee + add-ons). Runs the real server engine and all three engine copies.
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
const m = {};
let tempDir;
async function bundle(entry, name) {
  const outfile = join(tempDir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}
test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-docs-align-'));
  m.server = await bundle('functions/ownerOnboardingQuote.ts', 'server');
  for (const [i, path] of ENGINE_COPIES.entries()) m[path] = await bundle(path, `engine-${i}`);
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const T = 1790000000000;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
const fm = (patch = {}) => ({ assetClassId: 'apt-std', emirate: 'Other', zone: 'B', contractType: 'FM_ONLY', units: 1, propertyAge: 3, slaTier: 'standard', paymentPlan: 'annual', ...patch });

test('age uplift: 10 yrs or less none, 11-20 yrs +15%, over 20 yrs +25% (all engine copies)', () => {
  for (const path of ENGINE_COPIES) {
    // Assets older than 15 years also carry the unchanged mandatory PCA audit add-on (AED 6,500).
    const q = (propertyAge) => m[path].calculateUaeQuote2026(fm({ propertyAge })).annualTotal - (propertyAge > 15 ? 6500 : 0);
    for (const age of [0, 3, 6, 10]) close(q(age), 1500, `${path} age ${age}`);
    for (const age of [11, 15, 20]) close(q(age), 1725, `${path} age ${age}`);
    for (const age of [21, 35]) close(q(age), 1875, `${path} age ${age}`);
  }
});

test('height uplift: 15+ floors +8%, 40+ floors +15% (all engine copies)', () => {
  for (const path of ENGINE_COPIES) {
    const q = (floors) => m[path].calculateUaeQuote2026(fm({ assetClassId: 'res-bldg', sqft: 10000, floors })).annualTotal;
    close(q(14), 60000, `${path} 14 floors`);
    close(q(15), 64800, `${path} 15 floors`);
    close(q(39), 64800, `${path} 39 floors`);
    close(q(40), 69000, `${path} 40 floors`);
  }
});

test('Luxury (Estate) Villa minimum annual contract is AED 15,000 (all engine copies)', () => {
  for (const path of ENGINE_COPIES) {
    const quote = m[path].calculateUaeQuote2026(fm({ assetClassId: 'villa-lux' }));
    close(quote.baseQuote, 15000, `${path} base`);
    close(quote.annualTotal, 15000, `${path} total`);
    assert.ok(quote.pricingExplanation.includes('Minimum technical annual contract of AED 15000 applied.'));
  }
});

test('BOTH gets the 10% integrated bundle discount on (IFM + PM fee + add-ons); FM-only and PM-only do not', () => {
  for (const path of ENGINE_COPIES) {
    const e = m[path];
    const both = e.calculateUaeQuote2026(fm({ contractType: 'BOTH', annualRent: 100000, addOns: ['pest_control'] }));
    const subtotal = 1500 + 2475 + 5000;
    close(both.annualTotal, subtotal * 0.9, `${path} BOTH`);
    close(both.discount, subtotal * 0.1, `${path} BOTH discount`);
    const monthly = e.calculateUaeQuote2026(fm({ contractType: 'BOTH', annualRent: 100000, paymentPlan: 'monthly' }));
    close(monthly.annualTotal, 6500 * 0.9 * 1.06, `${path} BOTH monthly`);
    close(monthly.discount, 6500 * 0.1 * 1.06, `${path} BOTH monthly discount`);
    const fmOnly = e.calculateUaeQuote2026(fm());
    const pmOnly = e.calculateUaeQuote2026(fm({ contractType: 'PM_ONLY', annualRent: 100000 }));
    close(fmOnly.annualTotal, 1500, `${path} FM`); assert.equal(fmOnly.discount, 0);
    close(pmOnly.annualTotal, 5000, `${path} PM`); assert.equal(pmOnly.discount, 0);
  }
});

test('real server quote reflects the aligned rules in all three modes', () => {
  const q = (props, addOns = []) => m.server.calculateOwnerOnboardingQuote(props, addOns, T);
  const apt = { propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3 };
  assert.equal(q([{ ...apt, strategy: 'fm' }]).annualContractValue, 1725);
  assert.equal(q([{ ...apt, strategy: 'pm', annualRent: 100000 }]).annualContractValue, 5000);
  const both = q([{ ...apt, strategy: 'both', annualRent: 100000 }]);
  assert.equal(both.annualContractValue, 6052.5); // (1,725 + 5,000) x 0.90
  assert.equal(both.activationDeposit, 907.88);
  assert.equal(q([{ ...apt, age: 12, strategy: 'fm' }]).annualContractValue, 1983.75); // 1,725 x 1.15
  assert.equal(q([{ propertyType: 'Villa', assetGrade: 'Luxury', emirate: 'Dubai', zone: 'B', units: 1, age: 3, strategy: 'fm' }]).annualContractValue, 17250);
});
