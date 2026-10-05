import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2021 },
}).outputText).toString('base64')}`;

test('property names preserve real labels and never expose fallback internal IDs', async () => {
  const { jobPropertyName } = await import(moduleUrl(await read('src/technician/utils/jobPropertyDetails.ts')));
  const id = 'd8bcdb8b-41f9-4172-abdc-377d43500c1e_property_1';
  assert.equal(jobPropertyName({ propertyName: id, propertyId: id }), '');
  assert.equal(jobPropertyName({ propertyName: id }), '');
  assert.equal(jobPropertyName({ propertyName: 'opaque-id', propertyId: 'opaque-id' }), '');
  assert.equal(jobPropertyName({ propertyName: '  Al Ain Villa 12  ', propertyId: id }), 'Al Ain Villa 12');
  assert.equal(jobPropertyName({}), '');
});

test('server-saved ticket jobLocation supplies a complete map pin and address', async () => {
  const geoUrl = moduleUrl((await read('src/utils/geoAnchor.ts')).replace("import { GeoPoint, Timestamp } from 'firebase/firestore';", ''));
  const resolverSource = (await read('src/utils/propertyLocationResolver.ts')).replace("from './geoAnchor'", `from '${geoUrl}'`);
  const { resolvePropertyLocation } = await import(moduleUrl(resolverSource));
  const jobLocation = { lat: 24.2, lng: 55.7, address: 'Villa 12, Al Ain', source: 'SERVER_VERIFIED_PROPERTY_GEO' };
  const resolved = resolvePropertyLocation({ jobLocation, location: { lat: 25, lng: 56 }, address: 'Abu Dhabi, UAE' });
  assert.equal(resolved.hasExactCoordinates, true);
  assert.equal(resolved.latitude, 24.2);
  assert.equal(resolved.longitude, 55.7);
  assert.equal(resolved.address, jobLocation.address);
  assert.match(resolved.googleMapsUrl, /query=24.2,55.7/);
  for (const invalid of [{ lat: 0, lng: 0 }, { lat: 55.7, lng: 24.2 }, { lat: 24.2 }]) {
    assert.equal(resolvePropertyLocation({ jobLocation: invalid }).hasExactCoordinates, false);
  }
  const fallback = resolvePropertyLocation({ jobLocation: { lat: 24.2 }, propertyLocation: { lat: 25, lng: 56 } });
  assert.equal(fallback.latitude, 25);
  assert.equal(fallback.longitude, 56);
});
