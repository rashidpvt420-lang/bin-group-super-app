// Behavioural: the regional (emirate) factor must come from UAE_PRICING_MATRIX_2026.emirateMultipliers,
// city names typed in the emirate field (Al Ain, Khor Fakkan, Hatta...) must use their emirate's factor,
// and an unrecognised emirate must be flagged instead of silently priced at 1.0x. All three engine copies.
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

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-emirate-'));
  for (const [index, entry] of ENGINE_COPIES.entries()) {
    const outfile = join(tempDir, `engine-${index}.mjs`);
    await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
    modules[entry] = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  }
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const villa = (emirate) => ({ assetClassId: 'villa-std', emirate, zone: 'B', contractType: 'FM_ONLY', units: 3, propertyAge: 1, slaTier: 'standard', paymentPlan: 'annual' });

for (const path of ENGINE_COPIES) {
  test(`${path}: Al Ain is its own region (0.92x), not Abu Dhabi city`, () => {
    const { calculateUaeQuote2026 } = modules[path];
    for (const city of ['Al Ain', 'Alain', 'AL AIN', 'العين']) {
      const quote = calculateUaeQuote2026(villa(city));
      assert.equal(quote.emirateAdjustedQuote, quote.zoneAdjustedQuote * 0.92, city);
    }
    const abuDhabi = calculateUaeQuote2026(villa('Emirate of Abu Dhabi'));
    assert.equal(abuDhabi.emirateAdjustedQuote, abuDhabi.zoneAdjustedQuote * 1.1);
  });

  test(`${path}: emirate factors match the matrix table`, () => {
    const { resolveEmirateMultiplier } = modules[path];
    assert.equal(resolveEmirateMultiplier('Dubai').multiplier, 1.15);
    assert.equal(resolveEmirateMultiplier('dubai').multiplier, 1.15);
    assert.equal(resolveEmirateMultiplier('abuDhabi').multiplier, 1.1);
    assert.equal(resolveEmirateMultiplier('Sharjah').multiplier, 0.98);
    assert.equal(resolveEmirateMultiplier('Khor Fakkan').multiplier, 0.98);
    assert.equal(resolveEmirateMultiplier('Hatta').multiplier, 1.15);
    assert.equal(resolveEmirateMultiplier('Ruwais').multiplier, 0.92);
    for (const e of ['RAK', 'rasAlKhaimah', 'Ras Al Khaimah']) assert.equal(resolveEmirateMultiplier(e).multiplier, 1, e);
    assert.equal(resolveEmirateMultiplier('Ajman').multiplier, 0.93);
    assert.equal(resolveEmirateMultiplier('Fujairah').multiplier, 0.91);
    for (const e of ['UAQ', 'Umm Al Quwain', 'ummAlQuwain']) assert.equal(resolveEmirateMultiplier(e).multiplier, 0.92, e);
  });

  test(`${path}: unknown emirate is flagged, not silently 1.0x`, () => {
    const { calculateUaeQuote2026 } = modules[path];
    const quote = calculateUaeQuote2026(villa('Atlantis'));
    assert.ok(quote.riskFlags.some((flag) => flag.includes("'Atlantis' is not recognised")));
    // Founder decision 2026-10-14 13:21: an unknown emirate is priced at the highest regional factor (safe side).
    assert.equal(quote.emirateAdjustedQuote, quote.zoneAdjustedQuote * 1.15);
  });
}
