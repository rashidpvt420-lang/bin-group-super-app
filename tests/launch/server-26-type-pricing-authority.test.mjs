import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const EXPECTED = {
  'Villa': ['villa-std', 'unit'],
  'Apartment': ['apt-std', 'unit'],
  'Residential Building': ['res-bldg', 'sqft'],
  'Commercial Building': ['com-twr', 'sqft'],
  'Office': ['off-sml', 'sqft'],
  'Retail Center': ['retail-ctr', 'sqft'],
  'Mall': ['rtl-mall', 'sqft'],
  'Hotel': ['mid_scale_hotel', 'sqft'],
  'Resort': ['resort', 'sqft'],
  'Hospital': ['hosp', 'sqft'],
  'Clinic': ['clinic', 'sqft'],
  'School': ['school', 'sqft'],
  'Warehouse': ['warehouse', 'sqft'],
  'Industrial Property': ['industrial', 'sqft'],
  'Labour Camp': ['lab-camp', 'bed'],
  'Staff Accommodation': ['staff-accom', 'bed'],
  'Government Property': ['gov-facility', 'sqft'],
  'Government Majlis': ['government_majlis', 'facility'],
  'Private Majlis': ['private_majlis', 'facility'],
  'Mosque / Masjid': ['mosque_fm', 'sqft+capacity'],
  'Mixed-Use Tower': ['mix-dev', 'sqft'],
  'Skyscraper': ['highrise', 'sqft'],
  'Stadium': ['stadium', 'sqft'],
  'Sports Complex': ['sports-complex', 'sqft'],
  'Event Venue': ['event-venue', 'sqft'],
  'Farm / Estate': ['estate', 'facility'],
};

const serverSource = readFileSync('functions/ownerOnboardingQuote.ts', 'utf8');
const payloadSource = readFileSync('src/utils/ownerPortfolioQuotePayload.ts', 'utf8');
let server;
let tempDir;

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-server-pricing-'));
  const outfile = join(tempDir, 'owner-onboarding-quote.mjs');
  await build({
    entryPoints: ['functions/ownerOnboardingQuote.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  server = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});

test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

function propertyFor(type, driver) {
  const property = {
    id: `test-${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    emirate: 'Dubai',
    zone: 'B',
    propertyType: type,
    assetGrade: 'Standard',
    strategy: 'fm',
    age: 4,
    floors: 1,
    lifts: 0,
    pool: false,
    hvac: false,
    districtCooling: false,
    fireAlarm: false,
    firePump: false,
    sira: false,
    gen: false,
    bmu: false,
    tank: false,
    slaTier: 'standard',
    paymentPlan: 'annual',
  };
  if (driver === 'unit') property.units = 10;
  if (driver === 'sqft') property.sqft = 10000;
  if (driver === 'bed') property.units = 100; // Asset Profile stores the visible Beds field in units; the adapter must translate it to beds.
  if (driver === 'sqft+capacity') {
    property.mosqueProfile = {
      grossFloorAreaSqft: 10000,
      maxWorshipperCapacity: 500,
      propertyAgeYears: 4,
      cctvInstalled: true,
      cctvCameraCount: 8,
    };
  }
  return property;
}

test('server authority has exactly one explicit pricing class and driver for all 26 Asset Profile types', () => {
  assert.equal(Object.keys(EXPECTED).length, 26);
  for (const [type, [expectedClass, expectedDriver]] of Object.entries(EXPECTED)) {
    const property = propertyFor(type, expectedDriver);
    const quote = server.calculateOwnerOnboardingQuote([property], [], 1_800_000_000_000);
    assert.equal(quote.propertyQuotes.length, 1);
    const priced = quote.propertyQuotes[0];
    assert.equal(priced.pricingClass, expectedClass, `${type} resolved to the wrong pricing class`);
    assert.equal(priced.pricingDriver, expectedDriver, `${type} resolved to the wrong pricing driver`);
    assert.ok(Number.isFinite(priced.annualTotal), `${type} returned a non-finite server quote`);
    assert.ok(priced.annualTotal > 0, `${type} returned a zero server quote with its required driver populated`);
    assert.ok(Number.isFinite(quote.portfolioAnnualTotal) && quote.portfolioAnnualTotal > 0, `${type} produced an invalid portfolio total`);
  }
});

test('server authority fails closed when the required driver is missing or the property type is unknown', () => {
  const wrongInputs = [
    ['Apartment', { sqft: 50000 }],
    ['Warehouse', { units: 100 }],
    ['Labour Camp', { sqft: 50000 }],
  ];
  for (const [type, patch] of wrongInputs) {
    assert.throws(
      () => server.calculateOwnerOnboardingQuote([{ ...propertyFor(type, 'facility'), ...patch }], [], 1_800_000_000_000),
      /could not be priced/i,
      `${type} accepted the wrong pricing driver`,
    );
  }

  assert.throws(
    () => server.calculateOwnerOnboardingQuote([{ ...propertyFor('Definitely Unknown Asset', 'facility') }], [], 1_800_000_000_000),
    /Unsupported property type/i,
    'Unknown property type silently received a quote',
  );
});

test('facility classes do not require or multiply generic capacity/area fields', () => {
  for (const type of ['Government Majlis', 'Private Majlis', 'Farm / Estate']) {
    const minimal = server.calculateOwnerOnboardingQuote([propertyFor(type, 'facility')], [], 1_800_000_000_000).propertyQuotes[0];
    const giant = server.calculateOwnerOnboardingQuote([{
      ...propertyFor(type, 'facility'), units: 500000, bedrooms: 500000, sqft: 50_000_000,
    }], [], 1_800_000_000_000).propertyQuotes[0];
    assert.equal(giant.annualTotal, minimal.annualTotal, `${type} was multiplied by a generic field`);
  }
});

test('Private Majlis wins over the legacy majlis boolean and Warehouse never becomes Labour Camp', () => {
  const privateMajlis = server.calculateOwnerOnboardingQuote([{
    ...propertyFor('Private Majlis', 'facility'), majlis: true, majlisType: 'private',
  }], [], 1_800_000_000_000).propertyQuotes[0];
  assert.equal(privateMajlis.pricingClass, 'private_majlis');

  const warehouse = server.calculateOwnerOnboardingQuote([propertyFor('Warehouse', 'sqft')], [], 1_800_000_000_000).propertyQuotes[0];
  assert.equal(warehouse.pricingClass, 'warehouse');
  assert.equal(warehouse.pricingDriver, 'sqft');
});

test('server PM quote is percentage-of-rent once, independent of unit/sqft drivers and FM add-ons', () => {
  const base = {
    ...propertyFor('Apartment', 'unit'), strategy: 'pm_only', annualRent: 100000, units: 1, sqft: 1200,
  };
  const normal = server.calculateOwnerOnboardingQuote([base], ['fire_safety'], 1_800_000_000_000).propertyQuotes[0];
  const huge = server.calculateOwnerOnboardingQuote([{
    ...base, units: 50000, sqft: 50_000_000, floors: 100,
  }], ['fire_safety'], 1_800_000_000_000).propertyQuotes[0];
  assert.equal(normal.annualTotal, 5000);
  assert.equal(huge.annualTotal, normal.annualTotal);
});

test('all quote adapters are wired to canonical classification with no apartment/Dubai fallback', () => {
  assert.match(serverSource, /calculateUaeQuote2026/);
  assert.match(serverSource, /resolveAssetClassIdForPropertyType/);
  assert.doesNotMatch(serverSource, /const\s+ASSETS\s*:/, 'server quote must not maintain a second pricing matrix');
  assert.doesNotMatch(serverSource, /return\s+["']apt-std["']\s*;\s*$/m, 'server quote must not fall back to Apartment');

  assert.match(payloadSource, /resolveAssetClassIdForPropertyType\(property\.propertyType, property\.assetGrade\)/);
  assert.match(payloadSource, /\bbeds,\s*\n/);
  assert.match(payloadSource, /annualRevenue:\s*property\.annualRevenue/);
  assert.doesNotMatch(payloadSource, /\|\|\s*['"]dubai['"]/, 'missing emirate must not silently receive Dubai premium pricing');
  assert.doesNotMatch(payloadSource, /return\s+['"]apt-std['"]/, 'portfolio quote payload must not fall back to Apartment');
});
