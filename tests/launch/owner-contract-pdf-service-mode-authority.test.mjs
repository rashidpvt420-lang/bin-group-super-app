import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('functions/pdfEngine.ts', 'utf8');

test('owner contract PDF recognizes canonical BOTH as combined service', () => {
  assert.match(
    source,
    /\['both', 'total_care', 'total-care', 'maintenance_and_property_management'\]\.includes\(raw\).*MAINTENANCE_AND_PROPERTY_MANAGEMENT/s,
  );
});

test('owner contract PDF keeps three distinct service scopes', () => {
  assert.match(source, /PROPERTY_MANAGEMENT_ONLY/);
  assert.match(source, /MAINTENANCE_ONLY/);
  assert.match(source, /MAINTENANCE_AND_PROPERTY_MANAGEMENT/);
  assert.match(source, /Property Management Only: BIN GROUP is responsible only/);
  assert.match(source, /Maintenance Only: BIN GROUP is responsible only/);
  assert.match(source, /Maintenance \+ Property Management: BIN GROUP may provide both/);
});
