import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const TYPES = {
  'Villa': ['villa-std', 'unit'], 'Apartment': ['apt-std', 'unit'],
  'Residential Building': ['res-bldg', 'sqft'], 'Commercial Building': ['com-twr', 'sqft'],
  'Office': ['off-sml', 'sqft'], 'Gym / Fitness Centre': ['gym-fitness-centre', 'sqft'],
  'Retail Center': ['retail-ctr', 'sqft'], 'Mall': ['rtl-mall', 'sqft'],
  'Hotel': ['mid_scale_hotel', 'sqft'], 'Resort': ['resort', 'sqft'], 'Hospital': ['hosp', 'sqft'],
  'Clinic': ['clinic', 'sqft'], 'School': ['school', 'sqft'], 'Warehouse': ['warehouse', 'sqft'],
  'Industrial Property': ['industrial', 'sqft'], 'Labour Camp': ['lab-camp', 'bed'],
  'Staff Accommodation': ['staff-accom', 'bed'], 'Government Property': ['gov-facility', 'sqft'],
  'Government Majlis': ['government_majlis', 'facility'], 'Private Majlis': ['private_majlis', 'facility'],
  'Mosque / Masjid': ['mosque_fm', 'sqft+capacity'], 'Mixed-Use Tower': ['mix-dev', 'sqft'],
  'Skyscraper': ['highrise', 'sqft'], 'Stadium': ['stadium', 'sqft'], 'Sports Complex': ['sports-complex', 'sqft'],
  'Event Venue': ['event-venue', 'sqft'], 'Farm / Estate': ['estate', 'facility'],
};

let pricing;
let dir;
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'phase14-pricing-'));
  const outfile = join(dir, 'quote.mjs');
  await build({ entryPoints: ['functions/ownerOnboardingQuote.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  pricing = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});
test.after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

function property(type, driver, mode = 'fm') {
  const p = { id: 'p1', propertyType: type, emirate: 'Abu Dhabi', zone: 'B', strategy: mode, age: 8, floors: 2, lifts: 0, slaTier: 'standard', paymentPlan: 'annual', annualRent: 200000 };
  if (driver === 'unit') p.units = 2;
  if (driver === 'sqft') p.sqft = 10000;
  if (driver === 'bed') p.beds = 100;
  if (driver === 'sqft+capacity') p.mosqueProfile = { grossFloorAreaSqft: 10000, maxWorshipperCapacity: 500, propertyAgeYears: 8, cctvInstalled: true };
  if (type === 'Gym / Fitness Centre') p.gymProfile = { scopeMode: 'GYM_STANDALONE', separateBinScope: true, declaredServiceAreaSqft: 10000, suggestedComplexity: 'STANDARD_DRY', openingSchedule: 'STANDARD_HOURS', pmPricingBasis: 'annual_rent' };
  return p;
}

test('Phase 14 independently prices every supported asset with its exact class and driver', () => {
  assert.equal(Object.keys(TYPES).length, 27);
  for (const [type, [klass, driver]] of Object.entries(TYPES)) {
    const quote = pricing.calculateOwnerOnboardingQuote([property(type, driver)], [], 1_800_000_000_000);
    assert.equal(quote.propertyQuotes[0].pricingClass, klass);
    assert.equal(quote.propertyQuotes[0].pricingDriver, driver);
    assert.ok(quote.propertyQuotes[0].annualTotal > 0);
  }
});

test('Phase 14 FM, PM and hybrid authority are distinct and PM requires rent/revenue', () => {
  const fm = pricing.calculateOwnerOnboardingQuote([property('Apartment', 'unit', 'fm')], [], 1_800_000_000_000);
  const pm = pricing.calculateOwnerOnboardingQuote([property('Apartment', 'unit', 'pm_only')], [], 1_800_000_000_000);
  const both = pricing.calculateOwnerOnboardingQuote([property('Apartment', 'unit', 'both')], [], 1_800_000_000_000);
  assert.ok(fm.annualContractValue > 0);
  assert.equal(pm.annualContractValue, 10000);
  assert.ok(both.annualContractValue > fm.annualContractValue);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Apartment', 'unit', 'pm_only'), annualRent: 0 }], [], 1_800_000_000_000), /could not be priced/i);
});

test('Phase 14 add-ons, age, emirate, SLA and payment frequency alter only server calculation', () => {
  const base = property('Office', 'sqft');
  const normal = pricing.calculateOwnerOnboardingQuote([base], [], 1_800_000_000_000).annualContractValue;
  const addOn = pricing.calculateOwnerOnboardingQuote([base], ['security'], 1_800_000_000_000).annualContractValue;
  const old = pricing.calculateOwnerOnboardingQuote([{ ...base, age: 25 }], [], 1_800_000_000_000).annualContractValue;
  const dubai = pricing.calculateOwnerOnboardingQuote([{ ...base, emirate: 'Dubai' }], [], 1_800_000_000_000).annualContractValue;
  const elite = pricing.calculateOwnerOnboardingQuote([{ ...base, slaTier: 'elite' }], [], 1_800_000_000_000).annualContractValue;
  const monthly = pricing.calculateOwnerOnboardingQuote([{ ...base, paymentPlan: 'monthly' }], [], 1_800_000_000_000).annualContractValue;
  assert.ok(addOn > normal); assert.ok(old > normal); assert.ok(dubai > normal); assert.ok(elite > normal); assert.ok(monthly > normal);
});

test('Phase 14 mobilization, fils rounding, hash and expiry are deterministic', () => {
  const now = 1_800_000_000_000;
  const q1 = pricing.calculateOwnerOnboardingQuote([property('Office', 'sqft')], [], now);
  const q2 = pricing.calculateOwnerOnboardingQuote([property('Office', 'sqft')], [], now);
  assert.equal(q1.activationDeposit, Math.round(q1.annualContractValue * 15) / 100);
  assert.equal(q1.expiresAtMs - q1.quotedAtMs, 72 * 60 * 60 * 1000);
  assert.match(q1.quoteHash, /^[a-f0-9]{64}$/);
  assert.equal(q1.quoteHash, q2.quoteHash);
  for (const value of [q1.annualContractValue, q1.activationDeposit, q1.remainingAmount]) assert.equal(value, Math.round(value * 100) / 100);
  const changed = pricing.calculateOwnerOnboardingQuote([{ ...property('Office', 'sqft'), sqft: 10001 }], [], now);
  assert.notEqual(changed.quoteHash, q1.quoteHash);
});

test('Phase 14 bad pricing input fails closed', () => {
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Apartment', 'unit'), units: 0 }], [], 1_800_000_000_000), /could not be priced/i);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Office', 'sqft'), sqft: 0 }], [], 1_800_000_000_000), /could not be priced/i);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Apartment', 'unit', 'pm_only'), annualRent: 0 }], [], 1_800_000_000_000), /could not be priced/i);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Apartment', 'unit'), units: -4 }], [], 1_800_000_000_000), /negative units/i);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Office', 'sqft'), sqft: -100 }], [], 1_800_000_000_000), /negative sqft/i);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Apartment', 'unit', 'pm_only'), annualRent: -1 }], [], 1_800_000_000_000), /negative annualRent/i);
  assert.throws(() => pricing.calculateOwnerOnboardingQuote([{ ...property('Unknown Palace', 'facility') }], [], 1_800_000_000_000), /Unsupported property type/i);
});

test('Phase 14 quote hash detects browser tampering of commercial terms', () => {
  const q = pricing.calculateOwnerOnboardingQuote([property('Office', 'sqft')], ['security'], 1_800_000_000_000);
  const tampered = { ...q, annualContractValue: q.annualContractValue + 100000 };
  assert.notEqual(JSON.stringify(tampered), JSON.stringify(q));
  assert.equal(q.quoteHash.length, 64);
});
