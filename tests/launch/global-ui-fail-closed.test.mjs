import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('tests/e2e/business-global.spec.ts', 'utf8');

test('global language evidence requires the rendered language controls', () => {
  assert.match(source, /language control is required and must be visible/i);
  assert.match(source, /Selecting Arabic must switch the rendered document to RTL/);
  assert.match(source, /Selecting English must restore LTR rendering/);
  assert.doesNotMatch(source, /localStorage\.setItem\('bin_language'/);
  assert.doesNotMatch(source, /Fallback: directly drive via localStorage/i);
});

test('global Maps evidence fails when the production map UI is absent', () => {
  assert.match(source, /Contact page must render the production map UI/);
  assert.match(source, /Google Maps must load without a visible provider or configuration error/);
  assert.match(source, /toBeVisible\(\{ timeout: 15_000 \}\)/);
  assert.doesNotMatch(source, /if \(await mapContainer\.isVisible/);
});
