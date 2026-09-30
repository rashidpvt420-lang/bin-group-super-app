// Live incident 2026-09-30 21:34 GST (prod 0b2ac993): "Find Property Address" showed a raw
// "Failed to fetch" because the browser-side Nominatim call was blocked by the Hosting CSP
// connect-src. The lookup now prefers the already-loaded Google Maps JS Geocoder, keeps Nominatim
// as a CSP-permitted fallback, de-duplicates the query suffix and never shows raw browser errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadTypeScriptModule(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, Number, Math, String, Array, Boolean, Promise, Error, RegExp, setTimeout, clearTimeout, encodeURIComponent }), { filename: path });
  return module.exports;
}

const lookup = loadTypeScriptModule('src/components/onboarding/propertyAddressLookup.ts');
const step = readFileSync('src/components/onboarding/PropertyLocationStep.tsx', 'utf8');
const firebaseJson = JSON.parse(readFileSync('firebase.json', 'utf8'));
const founderPreviewJson = JSON.parse(readFileSync('firebase.founder-preview.json', 'utf8'));

const cspFor = (target) => target.headers.flatMap((entry) => entry.headers || []).find((header) => header.key === 'Content-Security-Policy')?.value || '';
const connectSrc = (csp) => csp.match(/connect-src\s+([^;]+)/)?.[1]?.split(/\s+/) || [];

// Objects created inside the vm context have a different Object prototype; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));
const failedToFetch = () => Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' });
const okGoogle = (lat, lng) => ({
  geocode: (_request, callback) => callback([{
    formatted_address: 'Business Bay - Dubai - United Arab Emirates',
    geometry: { location: { lat: () => lat, lng: () => lng } },
    address_components: [
      { long_name: 'Business Bay', types: ['sublocality_level_1', 'sublocality', 'political'] },
      { long_name: 'Dubai', types: ['locality', 'political'] },
      { long_name: 'Dubai', types: ['administrative_area_level_1', 'political'] },
    ],
  }], 'OK'),
});
const statusGoogle = (status) => ({ geocode: (_request, callback) => callback(null, status) });
const nominatimFetch = (body, calls = []) => async (url) => { calls.push(url); return { ok: true, json: async () => body }; };

test('the query does not repeat the emirate or UAE the Owner already typed', () => {
  assert.equal(lookup.buildAddressQuery('Business Bay, Dubai, UAE', 'Dubai'), 'Business Bay, Dubai, UAE');
  assert.equal(lookup.buildAddressQuery('Business Bay', 'Dubai'), 'Business Bay, Dubai, UAE');
  assert.equal(lookup.buildAddressQuery('Business Bay, Dubai', 'Dubai'), 'Business Bay, Dubai, UAE');
  assert.equal(lookup.buildAddressQuery('Al Reem Island, United Arab Emirates', 'Abu Dhabi'), 'Al Reem Island, United Arab Emirates, Abu Dhabi');
  assert.equal(lookup.buildAddressQuery('Dubai Hills Estate, Dubai, U.A.E.', 'Dubai'), 'Dubai Hills Estate, Dubai, U.A.E.');
  assert.equal(lookup.buildAddressQuery('  Marina Gate 1 ,  ', 'Dubai'), 'Marina Gate 1, Dubai, UAE');
  assert.equal(lookup.buildAddressQuery('Dubailand', 'Dubai'), 'Dubailand, Dubai, UAE', 'a word containing the emirate is not the emirate');
  assert.equal(lookup.buildAddressQuery('', 'Dubai'), '');
});

test('browser network failures ("Failed to fetch", Safari "Load failed", Firefox NetworkError) are recognised', () => {
  assert.equal(lookup.isNetworkFetchError(failedToFetch()), true);
  assert.equal(lookup.isNetworkFetchError(Object.assign(new TypeError('Load failed'), { name: 'TypeError' })), true);
  assert.equal(lookup.isNetworkFetchError(Object.assign(new TypeError('NetworkError when attempting to fetch resource.'), { name: 'TypeError' })), true);
  assert.equal(lookup.isNetworkFetchError(new Error('GOOGLE_GEOCODER_REQUEST_DENIED')), false);
  assert.equal(lookup.isNetworkFetchError(null), false);
});

test('Google Geocoder result is used first and Nominatim is not called', async () => {
  const calls = [];
  const outcome = await lookup.resolvePropertyAddress({ query: 'Business Bay, Dubai, UAE', googleGeocoder: okGoogle(25.1815668, 55.2715102), fetchImpl: nominatimFetch([], calls) });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result.provider, 'google');
  assert.equal(outcome.result.lat, 25.1815668);
  assert.equal(outcome.result.emirate, 'Dubai');
  assert.equal(outcome.result.area, 'Business Bay');
  assert.equal(calls.length, 0);
});

test('Nominatim is the fallback when Google has no result or is unavailable', async () => {
  const body = [{ lat: '25.1794564', lon: '55.2683707', display_name: 'Business Bay, Dubai, UAE', address: { state: 'Dubai', suburb: 'Business Bay' } }];
  for (const googleGeocoder of [null, statusGoogle('ZERO_RESULTS'), statusGoogle('REQUEST_DENIED')]) {
    const calls = [];
    const outcome = await lookup.resolvePropertyAddress({ query: 'Business Bay, Dubai, UAE', googleGeocoder, fetchImpl: nominatimFetch(body, calls) });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.provider, 'nominatim');
    assert.equal(outcome.result.lng, 55.2683707);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/nominatim\.openstreetmap\.org\/search\?.*q=Business%20Bay%2C%20Dubai%2C%20UAE$/);
  }
});

test('a CSP-blocked fetch resolves to "unavailable", never a thrown "Failed to fetch"', async () => {
  const blocked = async () => { throw failedToFetch(); };
  assert.deepEqual(plain(await lookup.resolvePropertyAddress({ query: 'Business Bay, Dubai, UAE', googleGeocoder: null, fetchImpl: blocked })), { ok: false, reason: 'unavailable' });
  assert.deepEqual(plain(await lookup.resolvePropertyAddress({ query: 'Business Bay, Dubai, UAE', googleGeocoder: statusGoogle('REQUEST_DENIED'), fetchImpl: blocked })), { ok: false, reason: 'unavailable' });
  assert.deepEqual(plain(await lookup.resolvePropertyAddress({ query: 'x', googleGeocoder: null, fetchImpl: null })), { ok: false, reason: 'unavailable' });
});

test('an address nobody can find resolves to "not_found"', async () => {
  assert.deepEqual(plain(await lookup.resolvePropertyAddress({ query: 'zzzz', googleGeocoder: statusGoogle('ZERO_RESULTS'), fetchImpl: nominatimFetch([]) })), { ok: false, reason: 'not_found' });
  assert.deepEqual(plain(await lookup.resolvePropertyAddress({ query: 'zzzz', googleGeocoder: statusGoogle('ZERO_RESULTS'), fetchImpl: async () => { throw failedToFetch(); } })), { ok: false, reason: 'not_found' });
});

test('invalid geocoder coordinates are rejected', async () => {
  const outcome = await lookup.resolvePropertyAddress({ query: 'x', googleGeocoder: okGoogle(123, 55), fetchImpl: nominatimFetch([{ lat: 'abc', lon: '55' }]) });
  assert.deepEqual(plain(outcome), { ok: false, reason: 'not_found' });
});

test('the location step uses the lookup module and never shows the raw browser error', () => {
  assert.match(step, /from '\.\/propertyAddressLookup'/);
  assert.match(step, /resolvePropertyAddress\(\{/);
  assert.match(step, /buildAddressQuery\(cleanAddress \|\| plusCodeField, selectedEmirate\)/);
  assert.match(step, /new google\.maps\.Geocoder\(\)/);
  assert.doesNotMatch(step, /setLocationError\(error\?\.message \|\| copy\('Property-address lookup failed\./);
  assert.doesNotMatch(step, /fetch\(`https:\/\/nominatim/);
  assert.doesNotMatch(step, /\$\{cleanAddress \|\| plusCodeField\}, \$\{selectedEmirate\}, UAE/);
  // The failure copy points the Owner to the manual fallbacks that do not need a network lookup.
  assert.match(step, /Address search is unavailable right now\. You can still continue: drag the pin on the map, paste an expanded Google Maps link, or enter the latitude and longitude and select Save Coordinates\./);
  assert.match(step, /copy\('Save Coordinates'|Save Coordinates/);
});

test('Hosting CSP connect-src allows every endpoint the lookup calls', () => {
  const app = firebaseJson.hosting.find((target) => target.target === 'app');
  const preview = founderPreviewJson.hosting.find((target) => target.target === 'founder-preview');
  for (const target of [app, preview]) {
    const sources = connectSrc(cspFor(target));
    assert.ok(sources.includes('https://nominatim.openstreetmap.org'), `${target.target} connect-src must allow Nominatim`);
    assert.ok(sources.includes('https://*.googleapis.com'), `${target.target} connect-src must allow maps.googleapis.com`);
  }
  const script = cspFor(app).match(/script-src\s+([^;]+)/)?.[1] || '';
  assert.match(script, /https:\/\/maps\.googleapis\.com/, 'the Google Maps JS Geocoder is loaded from maps.googleapis.com');
  assert.equal(lookup.NOMINATIM_SEARCH_ENDPOINT, 'https://nominatim.openstreetmap.org/search');
});
