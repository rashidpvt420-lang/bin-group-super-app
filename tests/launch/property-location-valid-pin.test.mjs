import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const resolver = readFileSync(new URL('../../src/utils/propertyLocationResolver.ts', import.meta.url), 'utf8');
const geo = readFileSync(new URL('../../src/utils/geoAnchor.ts', import.meta.url), 'utf8');

test('property location treats only a valid pin as exact GPS', () => {
  assert.match(resolver, /import \{ isValidLatLng \} from '\.\/geoAnchor'/);
  assert.match(resolver, /isValidLatLng\(latitude, longitude\)/);
  assert.doesNotMatch(resolver, /const hasExactCoordinates = latitude !== null && longitude !== null;/);
  assert.match(geo, /!\(lat === 0 && lng === 0\)/);
  assert.match(geo, /looksLikeReversedUaeLatLng/);
});
