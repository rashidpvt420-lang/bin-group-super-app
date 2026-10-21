import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const systems = readFileSync('src/components/onboarding/SystemsDataStep.tsx', 'utf8');
const store = readFileSync('src/store/onboardingStore.ts', 'utf8');
const engine = readFileSync('src/utils/calculateUaeQuote2026.ts', 'utf8');
const serverEngine = readFileSync('functions/pricing/calculateUaeQuote2026.ts', 'utf8');
const terms = readFileSync('src/components/onboarding/CommercialTermsStep.tsx', 'utf8');

test('page 2 derives required add-ons from the same engine input as the quote', () => {
  assert.match(store, /export const buildPropertyQuoteInput = \(property: PropertyData, selectedAddOns: string\[\]\)/);
  assert.match(store, /const input = buildPropertyQuoteInput\(property, selectedAddOns\);/);
  assert.match(store, /export const resolvePropertyMandatoryAddOns = \(property: PropertyData\): string\[\] =>/);
  assert.match(store, /resolveMandatoryAddOns\(input as QuoteInput\)/);
  assert.match(systems, /resolvePropertyMandatoryAddOns\(activeProperty\)/);
});

test('system-driven add-ons are shared by client and server engines and cannot be ticked by hand', () => {
  for (const source of [engine, serverEngine]) assert.match(source, /export const SYSTEM_DRIVEN_ADDON_IDS: ReadonlySet<string> = new Set\(\[/);
  assert.match(systems, /if \(requiredStackIds\.includes\(id\) \|\| SYSTEM_DRIVEN_ADDON_IDS\.has\(id\)\) return;/);
  assert.match(systems, /const unavailable = !locked && SYSTEM_DRIVEN_ADDON_IDS\.has\(addon\.id\);/);
  assert.match(systems, /disabled=\{locked \|\| unavailable\}/);
});

test('required add-ons are persisted on the property when systems change and on Continue', () => {
  assert.match(systems, /updateProperty\(activePropertyIndex, \{ \.\.\.patch, selectedAddOns: normaliseOwnerAddOns\(storedSelectedIds, mandatory\) \}\)/);
  assert.match(systems, /normaliseOwnerAddOns\(property\.selectedAddOns, resolvePropertyMandatoryAddOns\(property\)\)/);
  assert.match(systems, /updateProperty\(activePropertyIndex, \{ selectedAddOns: next \}\)/);
});

test('engine-only mandatory add-ons are shown with engine prices and labelled on page 3', () => {
  for (const id of ['sira_renewal', 'facade_access', 'pool_care', 'pca_audit', 'emergency_priority']) {
    assert.ok(systems.includes(`price: addOnPrice('${id}')`), id);
    assert.ok(terms.includes(`${id}: {`), `page 3 label for ${id}`);
  }
  assert.doesNotMatch(systems, /isMajlisAsset|getHiddenAddOnIds/);
});

test('page 2 uses light theme tokens and a mobile-friendly action row', () => {
  assert.doesNotMatch(systems, /'#fff'|'#FFF'|'#000'|#111112|rgba\(255,\s*255,\s*255/);
  assert.match(systems, /flex: \{ xs: 1, sm: 'none' \}/);
  assert.match(systems, /next: \{ en: 'Continue'/);
  assert.match(systems, /Location, service level and payment plan factors are applied in the Review quote/);
});
