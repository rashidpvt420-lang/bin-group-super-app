import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

// Dynamically bundle the TypeScript pricing engine to a temporary ESM JavaScript file
// so that Node can import it without needing custom TS loaders.
if (!existsSync('.tmp')) {
  mkdirSync('.tmp');
}
execSync('npx esbuild src/utils/calculateUaeQuote2026.ts --bundle --platform=node --format=esm --outfile=.tmp/pricing-engine.js', { stdio: 'ignore' });

const { calculateUaeQuote2026 } = await import('../../.tmp/pricing-engine.js');

const selectableTypes = [
  'Villa', 'Apartment', 'Residential Building', 'Commercial Building', 'Office', 'Retail Center', 'Mall',
  'Hotel', 'Resort', 'Hospital', 'Clinic', 'School', 'Warehouse', 'Industrial Property', 'Labour Camp',
  'Staff Accommodation', 'Government Property', 'Government Majlis', 'Private Majlis', 'Mosque / Masjid',
  'Mixed-Use Tower', 'Skyscraper', 'Stadium', 'Sports Complex', 'Event Venue', 'Farm / Estate'
];

test('every selectable property type resolves to a valid pricing class and calculates a finite quote', () => {
  for (const type of selectableTypes) {
    const input = {
      assetClassId: type,
      emirate: 'Dubai',
      zone: 'B',
      contractType: 'FM_ONLY',
      propertyAge: 5,
      slaTier: 'standard',
      paymentPlan: 'annual',
      sqft: 2000,
      units: 10,
      beds: 50
    };

    const output = calculateUaeQuote2026(input);

    assert.ok(Number.isFinite(output.annualTotal), `Quote for ${type} must be a finite number`);
    assert.ok(output.annualTotal > 0, `Quote for ${type} must be greater than zero`);

    // Verify it doesn't trigger "Asset Class Review Required"
    const hasReviewFlag = output.riskFlags.includes('Asset Class Review Required');
    assert.equal(hasReviewFlag, false, `Property type ${type} triggered unexpected Asset Class Review Required flag`);

    // Verify it doesn't trigger "Missing Pricing Driver"
    const hasDriverFlag = output.riskFlags.includes('Missing Pricing Driver');
    assert.equal(hasDriverFlag, false, `Property type ${type} triggered unexpected Missing Pricing Driver flag`);
  }
});

test('every selectable property type uses its correct pricing driver (units, beds, or sqft)', () => {
  // Test drivers by varying inputs and checking if quote changes
  for (const type of selectableTypes) {
    // Mosque has a custom driver using sqft & units, so we handle it separately
    if (type === 'Mosque / Masjid') {
      const q1 = calculateUaeQuote2026({ assetClassId: type, sqft: 200000, units: 100, propertyAge: 5 });
      const q2 = calculateUaeQuote2026({ assetClassId: type, sqft: 400000, units: 100, propertyAge: 5 });
      const q3 = calculateUaeQuote2026({ assetClassId: type, sqft: 200000, units: 500, propertyAge: 5 });
      assert.notEqual(q1.annualTotal, q2.annualTotal, `Mosque quote must vary with sqft`);
      assert.notEqual(q1.annualTotal, q3.annualTotal, `Mosque quote must vary with worshipper capacity (units)`);
      continue;
    }

    const qBase = calculateUaeQuote2026({
      assetClassId: type,
      sqft: 200000,
      units: 100,
      beds: 1000,
      propertyAge: 5,
      contractType: 'FM_ONLY'
    });

    const qSqftDouble = calculateUaeQuote2026({
      assetClassId: type,
      sqft: 400000,
      units: 100,
      beds: 1000,
      propertyAge: 5,
      contractType: 'FM_ONLY'
    });

    const qUnitsDouble = calculateUaeQuote2026({
      assetClassId: type,
      sqft: 200000,
      units: 200,
      beds: 1000,
      propertyAge: 5,
      contractType: 'FM_ONLY'
    });

    const qBedsDouble = calculateUaeQuote2026({
      assetClassId: type,
      sqft: 200000,
      units: 100,
      beds: 2000,
      propertyAge: 5,
      contractType: 'FM_ONLY'
    });

    // Check which input changed the quote
    const sqftChanged = qBase.annualTotal !== qSqftDouble.annualTotal;
    const unitsChanged = qBase.annualTotal !== qUnitsDouble.annualTotal;
    const bedsChanged = qBase.annualTotal !== qBedsDouble.annualTotal;

    const isMajlis = ['Government Property', 'Government Majlis', 'Private Majlis'].includes(type);
    if (isMajlis) {
      assert.equal(sqftChanged, false, `${type} quote must not vary with sqft`);
      assert.equal(unitsChanged, false, `${type} quote must not vary with units`);
      assert.equal(bedsChanged, false, `${type} quote must not vary with beds`);
      continue;
    }

    // Sum of changes must be exactly 1 driver
    const totalDrivers = (sqftChanged ? 1 : 0) + (unitsChanged ? 1 : 0) + (bedsChanged ? 1 : 0);
    assert.equal(totalDrivers, 1, `Property type ${type} must have exactly one active pricing driver (resolved: sqft=${sqftChanged}, units=${unitsChanged}, beds=${bedsChanged})`);
  }
});
