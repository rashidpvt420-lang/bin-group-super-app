// Behavioural: Founder decisions 2026-10-14 12:58 (matrix 3.5.0) hold in all three engine copies:
// age factors, remote-area surcharge, minimum PM fee, warehouse/office starting rates, mosque unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const COPIES = ['functions/pricing', 'src/utils', 'packages/shared/src/pricing'];
const mods = {};
let dir;
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bin-350-'));
  for (const [i, c] of COPIES.entries()) {
    const outfile = join(dir, `e${i}.mjs`);
    await build({ entryPoints: [`${c}/calculateUaeQuote2026.ts`], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    mods[c] = await import(pathToFileURL(outfile).href);
  }
});
test.after(() => dir && rmSync(dir, { recursive: true, force: true }));
const base = (o) => ({ zone: 'B', bedrooms: 1, slaTier: 'standard', paymentPlan: 'annual', propertyAge: 1, contractType: 'FM_ONLY', ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

test('matrix 3.5.0 identical in all copies', () => {
  for (const c of COPIES) assert.match(readFileSync(`${c}/uaePricingMatrix2026.ts`, 'utf8'), /version: '3\.5\.0'/);
  const a = readFileSync(`${COPIES[0]}/calculateUaeQuote2026.ts`, 'utf8');
  for (const c of COPIES) assert.equal(readFileSync(`${c}/calculateUaeQuote2026.ts`, 'utf8'), a);
});

for (const c of COPIES) {
  test(`${c}: age factors 0-5 1.00, 5-10 1.10, 10-15 1.20, 15+ 1.35`, () => {
    const { resolveAgeFactor } = mods[c];
    assert.deepEqual([0, 5, 6, 10, 11, 15, 16, 40].map(resolveAgeFactor), [1, 1, 1.1, 1.1, 1.2, 1.2, 1.35, 1.35]);
    const q = (age) => mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 3, emirate: 'Sharjah', area: 'Al Majaz', propertyAge: age })).annualTotal;
    near(q(6) / q(4), 1.1); near(q(12) / q(4), 1.2);
    assert.ok(mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 3, emirate: 'Sharjah', propertyAge: 16 })).pricingExplanation.some((l) => l.includes('1.35x')));
  });
  test(`${c}: remote surcharge +15% for Al Dhafra and Hatta only`, () => {
    const q = (o) => mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 3, ...o })).annualTotal;
    near(q({ emirate: 'Abu Dhabi', area: 'Ruwais' }), 10500 * 0.9 * 0.92 * 1.15);
    near(q({ emirate: 'Dubai', area: 'Hatta' }), 10500 * 1.2 * 1.15 * 1.15);
    near(q({ emirate: 'Al Dhafra', area: 'Unknown place' }), 10500 * 1.2 * 0.92 * 1.15);
    near(q({ emirate: 'Dubai', area: 'Business Bay' }), 10500 * 1.15);
  });
  test(`${c}: minimum PM fee 5,000 Dubai / Abu Dhabi incl. Al Ain & Al Dhafra, 2,500 elsewhere`, () => {
    const pm = (emirate, rent, ct = 'PM_ONLY') => mods[c].calculateUaeQuote2026(base({ assetClassId: 'apt-std', units: 1, annualRent: rent, emirate, area: 'Business Bay', contractType: ct })).annualTotal;
    for (const e of ['Dubai', 'Abu Dhabi', 'Al Ain', 'Al Dhafra']) assert.equal(pm(e, 40000), 5000);
    for (const e of ['Sharjah', 'Ajman', 'Ras Al Khaimah', 'Umm Al Quwain', 'Fujairah']) assert.equal(pm(e, 40000), 2500);
    assert.equal(pm('Dubai', 200000), 10000);
    near(pm('Dubai', 40000, 'BOTH'), 1500 * 1.15 + 5000);
  });
  test(`${c}: warehouse 6.5/sqft and office 10/sqft starting rates; mosque stays 12/sqft`, () => {
    const q = (o) => mods[c].calculateUaeQuote2026(base({ emirate: 'Ras Al Khaimah', area: 'Julphar Towers', ...o }));
    assert.equal(q({ assetClassId: 'warehouse', sqft: 10000 }).annualTotal, 65000);
    assert.equal(q({ assetClassId: 'off-sml', sqft: 2000 }).annualTotal, 20000);
    assert.match(readFileSync(`${c}/calculateUaeQuote2026.ts`, 'utf8'), /const mepRate = 12;/);
  });
}

test('zone CSV has remote column; Hatta and Al Dhafra flagged; admin page shows it', () => {
  const csv = readFileSync('scripts/pricing/uae-area-zones-2026-10-14.csv', 'utf8').trim().split('\n');
  assert.ok(csv[0].endsWith(',remote'));
  const remote = csv.slice(1).filter((l) => l.endsWith(',yes')).map((l) => l.split(',')[1]);
  assert.ok(remote.includes('Hatta') && remote.some((a) => a.includes('Ruwais')));
  const page = readFileSync('apps/admin-panel/src/pages/admin/PricingMatrixPage.tsx', 'utf8');
  for (const s of ['ageFactors', 'remoteAreaSurcharge', 'minimumManagementFee', "'Remote'"]) assert.ok(page.includes(s), s);
});

// Founder decisions 2026-10-14 13:11: bedrooms, unknown area = Zone A + warning, Hatta Zone A remote.
for (const c of COPIES) {
  test(`${c}: apartments priced by bedrooms, never below the apartment minimum`, () => {
    const q = (bedrooms, area = 'Jumeirah Village Circle') => mods[c].calculateUaeQuote2026(base({ assetClassId: 'apt-std', units: 1, emirate: 'Dubai', area, bedrooms })).annualTotal;
    near(q(0), 1725); near(q(1), 1725); near(q(2), 1500 * 1.25 * 1.15); near(q(3), 1500 * 1.5 * 1.15); near(q(4), 1500 * 1.75 * 1.15); near(q(7), q(4));
    const cheap = mods[c].calculateUaeQuote2026(base({ assetClassId: 'apt-std', units: 1, emirate: 'Fujairah', area: 'Sakamkam', bedrooms: 0 })).annualTotal;
    assert.ok(cheap >= 1500);
    assert.equal(mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 1, emirate: 'Dubai', area: 'Business Bay', bedrooms: 3 })).annualTotal, 3500 * 1.15);
  });
  test(`${c}: unknown area = Zone A with warning; Hatta = Zone A + remote`, () => {
    const u = mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 1, emirate: 'Sharjah', area: 'Nowhere Gardens' }));
    near(u.annualTotal, 3500 * 1.2 * 0.98);
    assert.ok(u.riskFlags.some((f) => f.startsWith('Zone pending admin confirmation')));
    near(mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 3, emirate: 'Dubai', area: 'Hatta' })).annualTotal, 10500 * 1.2 * 1.15 * 1.15);
    near(mods[c].calculateUaeQuote2026(base({ assetClassId: 'villa-std', units: 1, emirate: 'Dubai', area: 'Hatta', propertyAge: 20 })).annualTotal, (Math.max(3500 * 1.2 * 1.15, 3500) * 1.35 + 6500) * 1.15);
  });
}

// Founder decisions 2026-10-14 13:21: never under-quote on missing/unknown inputs; mosque standard age bands.
for (const c of COPIES) {
  test(`${c}: blank apartment bedrooms = 2BR + warning; 0 = studio, no warning`, () => {
    const q = (o) => mods[c].calculateUaeQuote2026({ zone: 'B', slaTier: 'standard', paymentPlan: 'annual', propertyAge: 1, contractType: 'FM_ONLY', assetClassId: 'apt-std', units: 1, emirate: 'Dubai', area: 'Jumeirah Village Circle', ...o });
    const blank = q({ bedrooms: undefined });
    near(blank.annualTotal, 1500 * 1.25 * 1.15);
    assert.ok(blank.riskFlags.some((f) => f.startsWith('Bedrooms pending inspection confirmation')));
    const studio = q({ bedrooms: 0 });
    near(studio.annualTotal, 1725);
    assert.ok(!studio.riskFlags.some((f) => f.startsWith('Bedrooms pending')));
  });
  test(`${c}: blank age = highest band 1.35 + warning; unknown/blank emirate = highest factor and PM minimum; blank area = Zone A`, () => {
    const v = (o) => mods[c].calculateUaeQuote2026({ zone: 'C', slaTier: 'standard', paymentPlan: 'annual', contractType: 'FM_ONLY', assetClassId: 'villa-std', units: 3, emirate: 'Dubai', area: 'Business Bay', bedrooms: 1, ...o });
    const noAge = v({ propertyAge: undefined });
    near(noAge.annualTotal, 10500 * 1.15 * 1.35); // blank age = 15+ band; asset audit only when age > 15 (founder decision 2026-10-21)
    assert.ok(noAge.riskFlags.some((f) => f.startsWith('Property age pending inspection confirmation')));
    near(v({ propertyAge: 0 }).annualTotal, 10500 * 1.15);
    const atlantis = v({ propertyAge: 1, emirate: 'Atlantis', area: '' });
    near(atlantis.annualTotal, 10500 * 1.2 * 1.15);
    assert.ok(atlantis.riskFlags.some((f) => f.startsWith('Emirate pending admin confirmation')));
    assert.ok(atlantis.riskFlags.some((f) => f.startsWith('Zone pending admin confirmation')));
    near(v({ propertyAge: 1, emirate: '', area: '' }).annualTotal, 10500 * 1.2 * 1.15);
    const pm = mods[c].calculateUaeQuote2026({ assetClassId: 'apt-std', units: 1, contractType: 'PM_ONLY', annualRent: 20000, emirate: 'Atlantis', zone: 'B', slaTier: 'standard', paymentPlan: 'annual', propertyAge: 1 });
    assert.equal(pm.annualTotal, 5000);
    assert.ok(pm.riskFlags.some((f) => f.startsWith('Emirate pending admin confirmation')));
  });
  test(`${c}: mosque uses the standard age bands 1.10 / 1.20 / 1.35 (blank = 1.35)`, () => {
    const m = (age) => mods[c].calculateUaeQuote2026({ assetClassId: 'mosque_fm', contractType: 'FM_ONLY', sqft: 10000, units: 200, emirate: 'Dubai', area: 'Business Bay', zone: 'B', slaTier: 'standard', paymentPlan: 'annual', propertyAge: age }).baseQuote;
    assert.deepEqual([0, 5, 7, 12, 20, undefined].map(m), [120000, 120000, 132000, 144000, 162000, 162000]);
  });
}

// Founder decisions 2026-10-14 14:01: blank floors/lifts = highest complexity tier; mosques take location factors.
for (const c of COPIES) {
  test(`${c}: blank floors / lifts on a multi-storey class = highest complexity tier + warning; villas unaffected`, () => {
    const b = (o) => mods[c].calculateUaeQuote2026({ assetClassId: 'res-bldg', contractType: 'FM_ONLY', sqft: 50000, emirate: 'Dubai', area: 'Business Bay', zone: 'B', slaTier: 'standard', paymentPlan: 'annual', propertyAge: 1, ...o });
    const known = b({ floors: 5, lifts: 2 });
    const blank = b({ floors: undefined, lifts: undefined });
    near(blank.complexityPremium, known.emirateAdjustedQuote * 0.20);
    assert.equal(blank.addOnTotal, known.addOnTotal); // blank lifts still carries the lift AMC (7,500)
    assert.equal(known.addOnTotal, 7500);
    assert.ok(blank.riskFlags.some((f) => f.startsWith('Floors / lifts pending inspection confirmation')));
    assert.ok(!known.riskFlags.some((f) => f.startsWith('Floors / lifts pending')));
    near(b({ floors: undefined, lifts: 2 }).complexityPremium, known.emirateAdjustedQuote * 0.12);
    const villa = mods[c].calculateUaeQuote2026({ assetClassId: 'villa-std', units: 1, contractType: 'FM_ONLY', emirate: 'Dubai', area: 'Business Bay', zone: 'B', slaTier: 'standard', paymentPlan: 'annual', propertyAge: 1 });
    assert.equal(villa.complexityPremium, 0);
  });
  test(`${c}: mosque takes zone, regional and remote factors`, () => {
    const mq = (emirate, area) => mods[c].calculateUaeQuote2026({ assetClassId: 'mosque_fm', contractType: 'FM_ONLY', sqft: 10000, units: 200, emirate, area, zone: 'B', slaTier: 'premium', paymentPlan: 'annual', propertyAge: 1 }).annualTotal;
    const dubaiB = mq('Dubai', 'Business Bay');
    near(mq('Dubai', 'Palm Jumeirah') / dubaiB, 1.2);
    near(mq('Fujairah', 'Al Faseel') / dubaiB, 1 / 1.15); // no-loss floor: never below the pre-location price
    near(mq('Dubai', 'Hatta') / dubaiB, 1.2 * 1.15);
    near(mq('Atlantis', '') / dubaiB, 1.2);
  });
}

for (const c of COPIES) {
  test(`${c}: mosque no-loss floor (Fujairah Zone B 261,728.50; Palm 361,185.33 at 1 year)`, () => {
    const mq = (emirate, area) => Math.round(mods[c].calculateUaeQuote2026({ assetClassId: 'mosque_fm', contractType: 'FM_ONLY', sqft: 10000, units: 200, emirate, area, zone: 'B', slaTier: 'premium', paymentPlan: 'annual', propertyAge: 1, hasCentralHVAC: true }).annualTotal * 100) / 100;
    assert.equal(mq('Fujairah', 'Al Faseel'), 261728.5);
    assert.equal(mq('Fujairah', 'Dibba Al-Fujairah'), 261728.5);
    assert.equal(mq('Dubai', 'Palm Jumeirah'), 361185.33);
  });
}
