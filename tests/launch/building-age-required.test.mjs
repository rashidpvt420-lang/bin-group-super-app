import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'age-'));
async function load(rel, name) {
  const entry = join(dir, `${name}.ts`);
  writeFileSync(entry, `export * from ${JSON.stringify(join(process.cwd(), rel))};`);
  const out = join(dir, `${name}.mjs`);
  buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', external: ['firebase-functions', 'firebase-functions/*', 'firebase-admin', 'firebase-admin/*'] });
  return import(out);
}
const engines = {
  browser: await load('src/utils/calculateUaeQuote2026.ts', 'browser'),
  functions: await load('functions/pricing/calculateUaeQuote2026.ts', 'functions'),
  shared: await load('packages/shared/src/pricing/calculateUaeQuote2026.ts', 'shared'),
};
const age = await load('src/components/onboarding/buildingAge.ts', 'age');
const server = await load('functions/ownerOnboardingQuote.ts', 'server');

const base = { assetClassId: 'res-bldg', emirate: 'dubai', zone: 'B', contractType: 'FM_ONLY', sqft: 20000, units: 20, floors: 5, slaTier: 'standard', paymentPlan: 'annual' };

test('condition audit applies only above 15 years in all three engine copies', () => {
  for (const [name, E] of Object.entries(engines)) {
    assert.ok(!E.resolveMandatoryAddOns({ ...base }).includes('pca_audit'), `${name}: blank age`);
    assert.ok(!E.resolveMandatoryAddOns({ ...base, propertyAge: 15 }).includes('pca_audit'), `${name}: 15`);
    assert.ok(E.resolveMandatoryAddOns({ ...base, propertyAge: 16 }).includes('pca_audit'), `${name}: 16`);
    assert.ok(!E.resolveMandatoryAddOns({ ...base, propertyAge: 0 }).includes('pca_audit'), `${name}: new build`);
  }
});

test('building age input accepts years or a year built and rejects nonsense', () => {
  assert.deepEqual(age.parseBuildingAgeInput('', 2026), { ok: false, reason: 'empty' });
  assert.deepEqual(age.parseBuildingAgeInput('0', 2026), { ok: true, age: 0 });
  assert.deepEqual(age.parseBuildingAgeInput('22', 2026), { ok: true, age: 22 });
  assert.deepEqual(age.parseBuildingAgeInput('2010', 2026), { ok: true, age: 16, fromYear: 2010 });
  for (const bad of ['2030', '151', '1500', '-3', '12.5', 'abc', '99999']) assert.equal(age.parseBuildingAgeInput(bad, 2026).ok, false, bad);
  assert.equal(age.hasValidBuildingAge(undefined), false);
  assert.equal(age.hasValidBuildingAge(0), true);
  assert.equal(age.hasValidBuildingAge(151), false);
});

const property = { emirate: 'Dubai', propertyType: 'Residential Building', strategy: 'fm_only', units: 20, sqft: 20000, floors: 5, area: 'Al Barsha' };

test('server quote rejects a missing or invalid building age', () => {
  assert.throws(() => server.calculateOwnerOnboardingQuote([property], []), /missing its building age/);
  assert.throws(() => server.calculateOwnerOnboardingQuote([{ ...property, age: '' }], []), /missing its building age/);
  assert.throws(() => server.calculateOwnerOnboardingQuote([{ ...property, age: 200 }], []), /invalid building age/);
  assert.doesNotThrow(() => server.assertBuildingAge({ ...property, age: 0 }, 0));
  assert.doesNotThrow(() => server.assertBuildingAge({ ...property, mosqueProfile: { propertyAgeYears: 12 } }, 0));
});

test('page 2 requires building age before continuing', () => {
  const step = readFileSync('src/components/onboarding/AssetProfileStep.tsx', 'utf8');
  assert.match(step, /if \(!hasValidBuildingAge\(property\.age\)/);
  assert.match(step, /label=\{label\('Building age \(years\) or year built'/);
  assert.doesNotMatch(step, /value=\{active\.age \|\| 0\}/);
  const store = readFileSync('src/store/onboardingStore.ts', 'utf8');
  assert.match(store, /sqft: 0, age: undefined, pool: false/);
});
