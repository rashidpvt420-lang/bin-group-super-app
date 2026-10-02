// Behavioural: the monthly add-on list (SERVICE_ADDONS) is the single source of add-on prices.
// Annual quotes charge per-month items x 12 and per-quarter items x 4; items with no yearly count
// (per event / visit / service / unit, one-time) are refused for a manual quote. Runs the real
// server quote engine and all three engine copies; the onboarding cards show the same prices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ENGINE_COPIES = [
  'functions/pricing/calculateUaeQuote2026.ts',
  'src/utils/calculateUaeQuote2026.ts',
  'packages/shared/src/pricing/calculateUaeQuote2026.ts',
];
const MATRIX_COPIES = ENGINE_COPIES.map((path) => path.replace('calculateUaeQuote2026', 'uaePricingMatrix2026'));
const m = {};
let tempDir;
async function bundle(entry, name) {
  const outfile = join(tempDir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}
test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-addons-'));
  m.server = await bundle('functions/ownerOnboardingQuote.ts', 'server');
  for (const [i, path] of ENGINE_COPIES.entries()) m[path] = await bundle(path, `engine-${i}`);
  for (const [i, path] of MATRIX_COPIES.entries()) m[path] = await bundle(path, `matrix-${i}`);
  m.v2 = await bundle('src/utils/uaePricingEngine_v2.ts', 'v2');
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const T = 1790000000000;
const PERIODS = { 'per month': 12, 'per quarter': 4, annual: 1 };
const apartment = { propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, strategy: 'fm' };

test('every engine copy prices each monthly-list add-on from that list with period conversion', () => {
  for (const [i, path] of ENGINE_COPIES.entries()) {
    const engine = m[path];
    const { SERVICE_ADDONS } = m[MATRIX_COPIES[i]];
    for (const item of SERVICE_ADDONS) {
      const periods = PERIODS[item.unit];
      const expected = item.price === 0 ? 0 : periods === undefined ? null : item.price * periods;
      assert.equal(engine.resolveAddOnAnnualPrice(item.id), expected, `${path} ${item.id} (${item.price} ${item.unit})`);
      if (expected === null) {
        assert.ok(engine.MANUAL_QUOTE_ADD_ON_IDS.has(item.id));
        assert.equal(engine.ADD_ON_PRICING[item.id], undefined, `${item.id} must not keep a second (annual) price`);
      } else if (engine.ADD_ON_PRICING[item.id]) {
        assert.equal(engine.ADD_ON_PRICING[item.id].base, expected, `${path} ${item.id} ADD_ON_PRICING must equal the list`);
      }
    }
    assert.equal(engine.resolveAddOnAnnualPrice('security'), 24000); // AED 2,000 per month x 12
    assert.equal(engine.resolveAddOnAnnualPrice('landscaping'), 18000); // AED 1,500 per month x 12
    assert.equal(engine.resolveAddOnAnnualPrice('pest_control'), 2400); // AED 600 per quarter x 4
  }
});

test('real server quote charges security at 2,000/month x 12 on an annual quote', () => {
  const base = m.server.calculateOwnerOnboardingQuote([apartment], [], T).annualContractValue;
  const withSecurity = m.server.calculateOwnerOnboardingQuote([apartment], ['security'], T);
  assert.equal(base, 1725);
  assert.equal(withSecurity.annualContractValue, 1725 + 24000);
  assert.equal(withSecurity.activationDeposit, 3858.75);
  // The billing plan only changes how the annual value is paid; the add-on is still 12 months.
  const monthly = m.server.calculateOwnerOnboardingQuote([{ ...apartment, paymentPlan: 'monthly' }], ['security'], T);
  assert.equal(monthly.annualContractValue, 27268.5); // (1,725 + 24,000) x 1.06
  const engine = m['functions/pricing/calculateUaeQuote2026.ts'];
  const quote = engine.calculateUaeQuote2026({ assetClassId: 'apt-std', emirate: 'Dubai', zone: 'B', contractType: 'FM_ONLY', units: 1, propertyAge: 3, slaTier: 'standard', paymentPlan: 'annual', addOns: ['security'] });
  assert.equal(quote.addOnTotal, 24000);
  assert.ok(quote.pricingExplanation.includes('Security add-on: AED 2000 per month x 12 = AED 24000 per year.'));
});

test('add-ons with no yearly count are refused for a manual quote instead of guessed', () => {
  for (const id of ['cleaning_team', 'tech_standby', 'event_support', 'deep_cleaning', 'cctv_security', 'inspection_move']) {
    assert.throws(
      () => m.server.calculateOwnerOnboardingQuote([apartment], [id], T),
      (error) => /ADD_ON_MANUAL_QUOTE_REQUIRED/.test(error.message) && error.message.includes(id),
      id,
    );
  }
  // PM-only ignores FM add-ons exactly as before.
  const pm = m.server.calculateOwnerOnboardingQuote([{ ...apartment, strategy: 'pm', annualRent: 100000 }], ['cleaning_team'], T);
  assert.equal(pm.annualContractValue, 5000);
});

test('add-ons the monthly list does not price yet keep their current annual price (no other rate changes)', () => {
  const engine = m['functions/pricing/calculateUaeQuote2026.ts'];
  for (const [id, base] of [['water_tank', 2200], ['elevator_amc', 7500], ['hvac_pm', 6680], ['cleaning', 18450], ['move_in_out_inspection', 1200], ['mep_support', 13500], ['waste_management', 6600]]) {
    assert.equal(engine.resolveAddOnAnnualPrice(id), base, id);
  }
});

test('the owner onboarding add-on cards take their prices from the engine resolver', () => {
  const source = readFileSync('src/components/onboarding/SystemsDataStep.tsx', 'utf8');
  assert.match(source, /import \{ resolveAddOnAnnualPrice(?:, SYSTEM_DRIVEN_ADDON_IDS)? \} from '\.\.\/\.\.\/utils\/calculateUaeQuote2026';/);
  const block = source.slice(source.indexOf('const addOns: AddOnItem[] = ['), source.indexOf('];', source.indexOf('const addOns: AddOnItem[] = [')));
  const ids = [...block.matchAll(/\{ id: '([a-z_]+)'/g)].map((match) => match[1]);
  assert.ok(ids.length >= 11);
  assert.doesNotMatch(block, /price: \d/);
  for (const id of ids) {
    const row = block.split('\n').find((line) => line.includes(`{ id: '${id}'`)) || '';
    assert.ok(row.includes(`price: addOnPrice('${id}')`), id);
    assert.notEqual(m['src/utils/calculateUaeQuote2026.ts'].resolveAddOnAnnualPrice(id), null, `${id} must have an automatic annual price`);
  }
});

test('the advisory SmartQuote converts monthly-list add-ons to annual too', () => {
  const base = { propertyType: 'VILLA', ownerType: 'Private', sqft: 1000, age: 1, floors: 1, units: 1, hvacType: 'DX', liftCount: 0, pool: false, landscape: 'Low', assetGrade: 'Standard' };
  const without = m.v2.generateSmartQuote(base);
  const withSecurity = m.v2.generateSmartQuote({ ...base, selectedAddons: ['security'] });
  assert.equal(withSecurity.subtotalAnnualPrice - without.subtotalAnnualPrice, 24000);
});
