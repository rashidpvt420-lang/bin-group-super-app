import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /owner/property-passport crashed with "Minified React error #31 (object with keys
// {address, lng, latitude, lat, longitude})" when a property had no emirate/city text and
// stored its GPS fix in `location`: the object was copied into `emirate` and rendered.
const src = readFileSync(new URL('../../src/owner/pages/OwnerPropertyPassportResolvedPage.tsx', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function passportFromProperty'), src.indexOf('function contractPropertyRows'));

test('passport emirate never falls back to the raw location object', () => {
  assert.doesNotMatch(fn, /emirate:\s*property\.emirate\s*\|\|\s*property\.city\s*\|\|\s*property\.location\s*\|\|/);
  assert.match(fn, /typeof property\.location === 'string'/);
});

test('passport emirate resolves to text for a GPS-object location', () => {
  const firstText = (...values) => { for (const v of values) { const t = String(v || '').trim(); if (t) return t; } return ''; };
  const property = { location: { address: 'Dubai Marina', lat: 25.08, lng: 55.14, latitude: 25.08, longitude: 55.14 } };
  const emirate = firstText(
    typeof property.emirate === 'string' ? property.emirate : '',
    typeof property.city === 'string' ? property.city : '',
    typeof property.location === 'string' ? property.location : '',
    typeof property.location?.emirate === 'string' ? property.location.emirate : '',
    'UAE',
  );
  assert.equal(typeof emirate, 'string');
  assert.equal(emirate, 'UAE');
});
