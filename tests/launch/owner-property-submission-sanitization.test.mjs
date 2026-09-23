import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('five-page server strips browser privilege flags and creates only unverified geo', async () => {
  const source = await readFile(new URL('../../functions/inspectionFirstOwnerOnboarding.ts', import.meta.url), 'utf8');
  const normalized = source.slice(source.indexOf('const normalizedProperties: PlainRecord[] = properties.map'), source.indexOf('transaction.set(intakeRef', source.indexOf('const normalizedProperties: PlainRecord[] = properties.map')));
  for (const field of ['geoVerification', 'verifiedBy', 'dispatchReady', 'adminApproved', 'paymentVerified', 'inspectionVerified', 'dashboardUnlocked']) {
    assert.match(normalized, new RegExp(`"${field}"`));
  }
  assert.match(normalized, /\.\.\.ownerFields/);
  assert.doesNotMatch(normalized, /\.\.\.property,/);
  assert.match(normalized, /verified: false/);
  assert.match(normalized, /dispatchReady: false/);
  const geo = source.slice(source.indexOf('function normalizeGeo('), source.indexOf('function quoteFor('));
  assert.match(geo, /source: "owner_submission"/);
  assert.doesNotMatch(geo, /\.\.\.\(cleanPlain\(value\?\.geo/);
});
