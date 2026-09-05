import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/components/onboarding/AssetProfileStep.tsx', import.meta.url), 'utf8');

test('Event operation assets use measured service area as the visible FM pricing driver', () => {
  assert.match(source, /const EVENT_OPERATION_TYPES = new Set\(\['Stadium', 'Sports Complex', 'Event Venue'\]\)/);
  assert.match(source, /const isEventOperations = EVENT_OPERATION_TYPES\.has\(active\?\.propertyType \|\| ''\)/);
  assert.match(source, /required=\{SQFT_PRICED_TYPES\.has\(active\.propertyType\)\}/);
  assert.match(source, /Required for the FM quote — measured service area is the pricing driver/);
  assert.match(source, /Operational capacity only — does not affect base FM price/);
});

test('Event operation FM intake does not ask for unsupported PM revenue', () => {
  assert.match(source, /!isGym && !isEventOperations/);
  assert.match(source, /Event operations are FM-only in the automatic quote/);
  assert.match(source, /annual rent \/ managed revenue is not requested here/);
});

test('required measurement fields do not present zero as completed mobile input', () => {
  assert.match(source, /value=\{Number\(active\.units\) > 0 \? active\.units : ''\}/);
  assert.match(source, /value=\{Number\(active\.floors\) > 0 \? active\.floors : ''\}/);
  assert.match(source, /value=\{Number\(active\.sqft\) > 0 \? active\.sqft : ''\}/);
  assert.match(source, /e\.g\. Yas Island, Al Reem Island/);
});
