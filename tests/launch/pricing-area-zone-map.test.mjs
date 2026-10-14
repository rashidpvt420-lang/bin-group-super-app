// Behavioural: owner-typed areas map to the Founder-approved zone table (2026-10-14) in all three engine copies
// and in the server onboarding quote; unknown areas are priced as Zone A (safe side) with a zone-pending warning; combined = FM + PM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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
  tempDir = mkdtempSync(join(tmpdir(), 'bin-area-zone-'));
  modules.server = await bundle('functions/ownerOnboardingQuote.ts', 'server');
  modules.matrix = await bundle('functions/pricing/uaePricingMatrix2026.ts', 'matrix');
  for (const [i, p] of ENGINE_COPIES.entries()) modules[p] = await bundle(p, `engine-${i}`);
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const base = (over) => ({ assetClassId: 'villa-std', emirate: 'Dubai', zone: 'B', contractType: 'FM_ONLY', units: 1, propertyAge: 1, slaTier: 'standard', paymentPlan: 'annual', ...over });

test('approved factors are in the matrix table the Admin page renders', () => {
  const m = modules.matrix.UAE_PRICING_MATRIX_2026;
  assert.deepEqual(Object.fromEntries(Object.entries(m.zones).map(([k, z]) => [k, z.multiplier])), { A: 1.2, B: 1, C: 0.9 });
  assert.deepEqual(Object.fromEntries(m.emirateMultipliers.map((e) => [e.label, e.value])), {
    Dubai: '1.15x', 'Abu Dhabi': '1.10x', 'Al Ain': '0.92x', 'Al Dhafra': '0.92x', Sharjah: '0.98x',
    Ajman: '0.93x', 'Ras Al Khaimah': '1.00x', 'Umm Al Quwain': '0.92x', Fujairah: '0.91x',
  });
  assert.ok(modules.matrix.UAE_AREA_ZONES_2026.length >= 60);
  const page = readFileSync('apps/admin-panel/src/pages/admin/PricingMatrixPage.tsx', 'utf8');
  assert.match(page, /UAE_AREA_ZONES_2026\.map/);
  assert.match(page, /emirateMultipliers\.map/);
});

for (const path of ENGINE_COPIES) {
  test(`${path}: Palm Jumeirah (any spelling) is Zone A`, () => {
    const { calculateUaeQuote2026, resolveAreaZone } = modules[path];
    for (const area of ['Palm Jumeirah', 'palm jumeirah', 'Frond K, The Palm', 'نخلة جميرا']) {
      assert.equal(resolveAreaZone(area, 'Dubai').entry?.zone, 'A', area);
    }
    const quote = calculateUaeQuote2026(base({ area: 'Palm Jumeirah', zone: 'B' }));
    assert.equal(quote.zoneAdjustedQuote, quote.baseQuote * 1.2);
    assert.equal(quote.emirateAdjustedQuote, quote.zoneAdjustedQuote * 1.15);
  });

  test(`${path}: an Al Ain area gets the Al Ain factor even when the emirate is Abu Dhabi`, () => {
    const { calculateUaeQuote2026 } = modules[path];
    for (const [emirate, area] of [['Abu Dhabi', 'Al Jimi'], ['Abu Dhabi', 'الجيمي'], ['abuDhabi', 'Al Towaya'], ['Alain', 'Al Muwaiji']]) {
      const quote = calculateUaeQuote2026(base({ emirate, area, units: 3 })); // above the minimum
      assert.equal(quote.emirateAdjustedQuote, quote.zoneAdjustedQuote * 0.92, `${emirate}/${area}`);
    }
    const jimi = calculateUaeQuote2026(base({ emirate: 'Abu Dhabi', area: 'Al Jimi' }));
    assert.equal(jimi.zoneAdjustedQuote, jimi.baseQuote * 0.9); // Zone C
    const cityOnly = calculateUaeQuote2026(base({ emirate: 'Abu Dhabi', area: 'Al Ain', units: 3 }));
    assert.equal(cityOnly.emirateAdjustedQuote, cityOnly.zoneAdjustedQuote * 0.92);
    const reem = calculateUaeQuote2026(base({ emirate: 'Abu Dhabi', area: 'Reem Island' }));
    assert.equal(reem.emirateAdjustedQuote, reem.zoneAdjustedQuote * 1.1);
  });

  test(`${path}: unknown area is priced as Zone A (safe side) with a zone-pending warning`, () => {
    const { calculateUaeQuote2026 } = modules[path];
    const quote = calculateUaeQuote2026(base({ area: 'Nowhere Gardens', zone: 'C' }));
    assert.equal(quote.zoneAdjustedQuote, quote.baseQuote * 1.2);
    assert.ok(quote.riskFlags.some((f) => f.startsWith('Zone pending admin confirmation') && f.includes("'Nowhere Gardens'")));
  });

  test(`${path}: area match is scoped to the emirate (Downtown Ajman is not Downtown Dubai)`, () => {
    const { resolveAreaZone } = modules[path];
    assert.equal(resolveAreaZone('Ajman Downtown', 'Ajman').entry?.zone, 'C');
    assert.equal(resolveAreaZone('Downtown', 'Dubai').entry?.zone, 'A');
  });

  test(`${path}: combined = maintenance + management`, () => {
    const { calculateUaeQuote2026 } = modules[path];
    const common = { area: 'JVC', annualRent: 100000 };
    const fm = calculateUaeQuote2026(base({ ...common, contractType: 'FM_ONLY' }));
    const pm = calculateUaeQuote2026(base({ ...common, contractType: 'PM_ONLY' }));
    const both = calculateUaeQuote2026(base({ ...common, contractType: 'BOTH' }));
    assert.ok(fm.annualTotal > 0 && pm.annualTotal > 0);
    assert.equal(Math.round(both.annualTotal * 100), Math.round((fm.annualTotal + pm.annualTotal) * 100));
  });
}

test('server onboarding quote passes the owner area through to the zone map', () => {
  const { calculateOwnerOnboardingQuote } = modules.server;
  const prop = (area) => ({ id: 'p1', propertyType: 'Villa', emirate: 'Dubai', area, units: 1, age: 1, strategy: 'fm' });
  const palm = calculateOwnerOnboardingQuote([prop('Palm Jumeirah')], [], 1_800_000_000_000);
  const jvc = calculateOwnerOnboardingQuote([prop('JVC')], [], 1_800_000_000_000);
  assert.equal(Math.round(palm.portfolioAnnualTotal / jvc.portfolioAnnualTotal * 100) / 100, 1.2);
});

for (const path of ENGINE_COPIES) {
  test(`${path}: minimum annual contract still holds after zone and emirate factors`, () => {
    const { calculateUaeQuote2026 } = modules[path];
    const jimi = calculateUaeQuote2026(base({ emirate: 'Abu Dhabi', area: 'Al Jimi' }));
    assert.equal(Math.round(jimi.annualTotal), 3500); // 3,500 x 0.90 x 0.92 = 2,898 -> floored to 3,500
    assert.ok(jimi.pricingExplanation.some((line) => line.includes('re-applied after zone and regional factors')));
    const palm = calculateUaeQuote2026(base({ emirate: 'Dubai', area: 'Palm Jumeirah' }));
    assert.equal(Math.round(palm.annualTotal), 4830); // 3,500 x 1.20 x 1.15, above the minimum
  });
}
