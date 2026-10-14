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
const base = (o) => ({ zone: 'B', slaTier: 'standard', paymentPlan: 'annual', propertyAge: 1, contractType: 'FM_ONLY', ...o });
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
    near(q({ emirate: 'Dubai', area: 'Hatta' }), 10500 * 1.15 * 1.15);
    near(q({ emirate: 'Al Dhafra', area: 'Unknown place' }), 10500 * 0.92 * 1.15);
    near(q({ emirate: 'Dubai', area: 'Business Bay' }), 10500 * 1.15);
  });
  test(`${c}: minimum PM fee 5,000 Dubai / Abu Dhabi incl. Al Ain & Al Dhafra, 2,500 elsewhere`, () => {
    const pm = (emirate, rent, ct = 'PM_ONLY') => mods[c].calculateUaeQuote2026(base({ assetClassId: 'apt-std', units: 1, annualRent: rent, emirate, contractType: ct })).annualTotal;
    for (const e of ['Dubai', 'Abu Dhabi', 'Al Ain', 'Al Dhafra']) assert.equal(pm(e, 40000), 5000);
    for (const e of ['Sharjah', 'Ajman', 'Ras Al Khaimah', 'Umm Al Quwain', 'Fujairah']) assert.equal(pm(e, 40000), 2500);
    assert.equal(pm('Dubai', 200000), 10000);
    near(pm('Dubai', 40000, 'BOTH'), 1500 * 1.15 + 5000);
  });
  test(`${c}: warehouse 6.5/sqft and office 10/sqft starting rates; mosque stays 12/sqft`, () => {
    const q = (o) => mods[c].calculateUaeQuote2026(base({ emirate: 'Ras Al Khaimah', ...o }));
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
