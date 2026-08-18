import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const enginePaths = [
  'src/utils/calculateUaeQuote2026.ts',
  'functions/pricing/calculateUaeQuote2026.ts',
  'packages/shared/src/pricing/calculateUaeQuote2026.ts',
];
const matrixPaths = [
  'src/utils/uaePricingMatrix2026.ts',
  'functions/pricing/uaePricingMatrix2026.ts',
  'packages/shared/src/pricing/uaePricingMatrix2026.ts',
];
const rootEngine = readFileSync(enginePaths[0], 'utf8');
const rootMatrix = readFileSync(matrixPaths[0], 'utf8');
const assetProfile = readFileSync('src/components/onboarding/AssetProfileStep.tsx', 'utf8');
const onboardingStore = readFileSync('src/store/onboardingStore.ts', 'utf8');
const titleDeedOcr = readFileSync('functions/titleDeedOcrV2.ts', 'utf8');

let moduleUnderTest;
let tempDir;

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-pricing-'));
  const outfile = join(tempDir, 'pricing.mjs');
  await build({
    entryPoints: ['src/utils/calculateUaeQuote2026.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  moduleUnderTest = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});

test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

test('browser, Cloud Functions and shared pricing sources cannot drift', () => {
  for (const path of enginePaths.slice(1)) assert.equal(readFileSync(path, 'utf8'), rootEngine, `${path} drifted from root pricing engine`);
  for (const path of matrixPaths.slice(1)) assert.equal(readFileSync(path, 'utf8'), rootMatrix, `${path} drifted from root pricing matrix`);
});

test('all 26 selectable Asset Profile types have an explicit configured pricing class', () => {
  const { ASSET_PROFILE_PROPERTY_TYPES, resolveAssetClassIdForPropertyType } = moduleUnderTest;
  assert.equal(ASSET_PROFILE_PROPERTY_TYPES.length, 26);
  const typeSet = new Set(ASSET_PROFILE_PROPERTY_TYPES);
  assert.equal(typeSet.size, 26, 'Asset Profile type list must not contain duplicates');
  for (const type of ASSET_PROFILE_PROPERTY_TYPES) {
    assert.match(assetProfile, new RegExp(`['\"]${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`), `${type} is missing from Asset Profile UI`);
    const classId = resolveAssetClassIdForPropertyType(type, 'Standard');
    assert.ok(classId, `${type} did not resolve to a pricing class`);
  }
  assert.equal(resolveAssetClassIdForPropertyType('Definitely Unknown Asset'), null, 'Unknown assets must fail closed instead of becoming apartments');
});

test('every Asset Profile type produces a finite non-zero FM estimate with its correct pricing driver', () => {
  const { ASSET_PROFILE_PROPERTY_TYPES, resolveAssetClassIdForPropertyType, calculateUaeQuote2026 } = moduleUnderTest;
  for (const type of ASSET_PROFILE_PROPERTY_TYPES) {
    const assetClassId = resolveAssetClassIdForPropertyType(type, 'Standard');
    const quote = calculateUaeQuote2026({
      assetClassId,
      emirate: 'Dubai',
      zone: 'B',
      contractType: 'FM_ONLY',
      sqft: 10000,
      units: type === 'Mosque / Masjid' ? 500 : 10,
      beds: 100,
      annualRent: 500000,
      propertyAge: 5,
      floors: 3,
      lifts: 0,
      hasPool: false,
      hasCentralHVAC: false,
      hasDistrictCooling: false,
      hasCivilDefenseSystem: false,
      hasSiraCctv: false,
      hasGenerator: false,
      hasBmu: false,
      addOns: [],
      slaTier: 'standard',
      paymentPlan: 'annual',
      hasWaterTank: false,
    });
    assert.ok(Number.isFinite(quote.annualTotal), `${type} returned a non-finite quote`);
    assert.ok(quote.annualTotal > 0, `${type} returned zero despite complete FM pricing inputs: ${quote.riskFlags.join(', ')}`);
    assert.ok(quote.annualTotal < 2_000_000, `${type} representative FM quote exploded above AED 2m: ${quote.annualTotal}`);
  }
});

test('Property Management applies percentage once and never multiplies annual rent by units or sqft', () => {
  const { calculateUaeQuote2026 } = moduleUnderTest;
  const base = {
    assetClassId: 'apt-std', emirate: 'Dubai', zone: 'B', contractType: 'PM_ONLY', annualRent: 100000,
    propertyAge: 5, floors: 1, units: 1, sqft: 1200, slaTier: 'standard', paymentPlan: 'annual', addOns: ['fire_safety'],
  };
  const normal = calculateUaeQuote2026(base);
  const hugeDrivers = calculateUaeQuote2026({ ...base, units: 50000, sqft: 50_000_000, floors: 100 });
  assert.equal(normal.annualTotal, 5000);
  assert.equal(hugeDrivers.annualTotal, normal.annualTotal);
  assert.equal(normal.addOnTotal, 0, 'PM-only pricing must not include technical FM add-ons');

  const missingRevenue = calculateUaeQuote2026({ ...base, annualRent: 0 });
  assert.equal(missingRevenue.annualTotal, 0);
  assert.ok(missingRevenue.riskFlags.includes('ANNUAL_RENT_REQUIRED'));
});

test('Majlis and estate facility pricing cannot be multiplied by generic capacity', () => {
  const { calculateUaeQuote2026 } = moduleUnderTest;
  for (const assetClassId of ['government_majlis', 'private_majlis', 'estate']) {
    const small = calculateUaeQuote2026({ assetClassId, emirate: 'Abu Dhabi', zone: 'B', contractType: 'FM_ONLY', units: 1, sqft: 5000, propertyAge: 5, floors: 1, slaTier: 'standard', paymentPlan: 'annual' });
    const giant = calculateUaeQuote2026({ assetClassId, emirate: 'Abu Dhabi', zone: 'B', contractType: 'FM_ONLY', units: 500000, sqft: 50_000_000, propertyAge: 5, floors: 1, slaTier: 'standard', paymentPlan: 'annual' });
    assert.equal(giant.annualTotal, small.annualTotal, `${assetClassId} was multiplied by a generic capacity/area field`);
  }
});

test('hotel is area-priced, labour/staff accommodation are bed-priced, and warehouse is not a labour camp alias', () => {
  const { resolveAssetClassIdForPropertyType, calculateUaeQuote2026 } = moduleUnderTest;
  assert.equal(resolveAssetClassIdForPropertyType('Hotel', 'Standard'), 'mid_scale_hotel');
  assert.equal(resolveAssetClassIdForPropertyType('Warehouse', 'Standard'), 'warehouse');
  assert.equal(resolveAssetClassIdForPropertyType('Labour Camp', 'Standard'), 'lab-camp');
  assert.equal(resolveAssetClassIdForPropertyType('Staff Accommodation', 'Standard'), 'staff-accom');

  const hotel = calculateUaeQuote2026({ assetClassId: 'mid_scale_hotel', emirate: 'Dubai', zone: 'B', contractType: 'FM_ONLY', sqft: 50000, units: 300, propertyAge: 5, floors: 10, slaTier: 'standard', paymentPlan: 'annual' });
  assert.ok(hotel.annualTotal < 2_000_000, `Hotel quote still looks room-multiplied: ${hotel.annualTotal}`);

  const camp = calculateUaeQuote2026({ assetClassId: 'lab-camp', emirate: 'Dubai', zone: 'B', contractType: 'FM_ONLY', beds: 100, units: 9999, propertyAge: 5, floors: 3, slaTier: 'standard', paymentPlan: 'annual' });
  assert.ok(camp.annualTotal >= 70_000 && camp.annualTotal < 200_000, `Labour camp annual per-bed quote is outside regression bounds: ${camp.annualTotal}`);
});

test('missing pricing drivers fail closed instead of receiving invented quote inputs', () => {
  const { calculateUaeQuote2026 } = moduleUnderTest;
  const areaPriced = calculateUaeQuote2026({ assetClassId: 'warehouse', emirate: 'Dubai', zone: 'B', contractType: 'FM_ONLY', sqft: 0, units: 0, beds: 0, propertyAge: 0, floors: 0, slaTier: 'standard', paymentPlan: 'annual' });
  assert.equal(areaPriced.annualTotal, 0);
  assert.ok(areaPriced.riskFlags.length > 0, 'Missing area must be flagged for review');

  const bedPriced = calculateUaeQuote2026({ assetClassId: 'lab-camp', emirate: 'Dubai', zone: 'B', contractType: 'FM_ONLY', sqft: 0, units: 0, beds: 0, propertyAge: 0, floors: 0, slaTier: 'standard', paymentPlan: 'annual' });
  assert.equal(bedPriced.annualTotal, 0);
  assert.ok(bedPriced.riskFlags.length > 0, 'Missing bed count must be flagged for review');
});

test('Asset Profile, portfolio store and OCR never seed missing property facts with demo values', () => {
  assert.doesNotMatch(rootEngine, /annualRent\s*\|\|\s*100000/);
  assert.doesNotMatch(rootEngine, /return\s+['\"]apt-std['\"]\s*;\s*\/\/\s*unknown/i);
  assert.match(onboardingStore, /resolveAssetClassIdForPropertyType\(property\.propertyType, property\.assetGrade\)/);
  assert.match(onboardingStore, /beds,/);
  assert.doesNotMatch(onboardingStore, /sqft:\s*1200/);
  assert.doesNotMatch(onboardingStore, /age:\s*5/);
  assert.doesNotMatch(onboardingStore, /floors:\s*1,\s*units:\s*1/);
  assert.match(onboardingStore, /const properties = get\(\)\.properties;/);
  assert.match(onboardingStore, /if \(properties\.length === 0\)/);
  assert.match(assetProfile, /ASSET_TYPE_IDS\.has\(property\.propertyType\)/);
  assert.match(assetProfile, /Annual rent \/ managed revenue/);
  assert.match(assetProfile, /addProperty\(blankAssetCard\(\)\)/);
  assert.doesNotMatch(assetProfile, /addProperty\(\{\s*emirate:\s*active\?\.emirate\s*\|\|\s*['\"]Dubai['\"]/);
  assert.match(titleDeedOcr, /sqft:\s*landAreaSqft/);
  assert.match(titleDeedOcr, /units:\s*unitCount/);
  assert.match(titleDeedOcr, /value === null \|\| value === undefined \|\| value === ['\"]{2}/);
});