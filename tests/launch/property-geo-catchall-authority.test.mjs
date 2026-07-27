import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// These regressions keep every rule hardener and its independent launch verifier
// converged on the same server-authoritative canonical property geo boundary.
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const hardening = await read('scripts/harden-final-firestore-authority.mjs');
const privateHrHardening = await read('scripts/harden-private-hr-authority.mjs');
const verifier = await read('scripts/verify-firestore-launch-hardening.mjs');
const rulesTest = await read('test/property-geo-authority-rules.test.js');
const listStart = hardening.indexOf('const liveLocationWriteList');
const listEnd = hardening.indexOf('`;', listStart);
const listBlock = hardening.slice(listStart, listEnd);

test('generic catch-all named list exists', () => {
  assert.ok(listStart >= 0 && listEnd > listStart);
});

test('generic catch-all excludes properties between live locations and users', () => {
  const liveIndex = listBlock.indexOf("'technician_live_locations'");
  const propertyIndex = listBlock.indexOf("'properties'");
  const usersIndex = listBlock.indexOf("'users'");
  assert.ok(liveIndex >= 0 && propertyIndex > liveIndex && usersIndex > propertyIndex);
});

test('canonical generator migrates the previous live-location write list', () => {
  assert.match(hardening, /const legacyLiveLocationWriteList/);
  assert.match(hardening, /text\.replaceAll\(legacyLiveLocationWriteList, hrServerAuthorityWriteList\)/);
  assert.match(hardening, /forbidden = \[[\s\S]*legacyLiveLocationWriteList/);
});

test('private HR hardener preserves the stricter property geo exclusion', () => {
  assert.match(privateHrHardening, /const propertyGeoWritePrefix/);
  assert.match(privateHrHardening, /source\.replaceAll\(liveLocationWritePrefix, hrServerAuthorityWritePrefix\)/);
  assert.match(privateHrHardening, /canonicalWritePrefix = hrServerAuthorityWritePrefix/);
});

test('launch hardening verifier requires property geo exclusion and forbids the old list', () => {
  assert.match(verifier, /canonical property geo omitted from global write fallback exclusions/);
  assert.match(verifier, /live location, canonical property geo, HR cases and private HR/);
});

test('property authority emulator regression names browser denial', () => {
  assert.match(rulesTest, /Owner and Admin browsers cannot mutate canonical geo/);
});

test('property authority emulator regression rejects Admin canonical geo mutation', () => {
  assert.match(rulesTest, /assertFails\(updateDoc\(refAdmin, \{ geo:/);
});
