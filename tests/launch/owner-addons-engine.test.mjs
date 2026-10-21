import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Bundle the real engine so the assertions run against the code the quote uses.
const dir = mkdtempSync(join(tmpdir(), 'addons-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(process.cwd(), 'src/utils/calculateUaeQuote2026.ts'))};`);
const out = join(dir, 'engine.mjs');
buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const E = await import(out);

const base = { assetClassId: 'res-bldg', emirate: 'dubai', zone: 'B', contractType: 'FM_ONLY', sqft: 20000, units: 20, propertyAge: 8, floors: 5, lifts: 0, slaTier: 'standard', paymentPlan: 'annual' };

test('owner-ticked system-driven add-ons are ignored by the engine (so page 2 must not offer them)', () => {
  const plain = E.calculateUaeQuote2026(base);
  const ticked = E.calculateUaeQuote2026({ ...base, addOns: ['water_tank', 'fire_safety'] });
  assert.equal(ticked.addOnTotal, plain.addOnTotal);
  assert.ok(E.SYSTEM_DRIVEN_ADDON_IDS.has('water_tank'));
});

test('every mandatory add-on the engine can add has an automatic annual price', () => {
  for (const id of ['fire_safety', 'water_tank', 'elevator_amc', 'hvac_pm', 'sira_renewal', 'facade_access', 'pca_audit', 'pool_care', 'cleaning', 'emergency_priority']) {
    assert.notEqual(E.resolveAddOnAnnualPrice(id), null, id);
  }
});

test('systems on page 2 drive the engine mandatory list', () => {
  assert.deepEqual(E.resolveMandatoryAddOns({ ...base, hasCivilDefenseSystem: true, hasWaterTank: true, hasCentralHVAC: true }).sort(), ['fire_safety', 'hvac_pm', 'water_tank']);
  assert.deepEqual(E.resolveMandatoryAddOns({ ...base, hasSiraCctv: true, hasBmu: true, hasPool: true }).sort(), ['facade_access', 'pool_care', 'sira_renewal']);
  assert.deepEqual(E.resolveMandatoryAddOns({ ...base, lifts: 2 }), ['elevator_amc']);
});
