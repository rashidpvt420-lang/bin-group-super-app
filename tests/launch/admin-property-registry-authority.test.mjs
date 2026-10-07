import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin Asset Registry mutations are server-authoritative and audited', async () => {
  const [page, backend, runtime] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/PropertyManagementPage.tsx'),
    read('functions/secureAdminPropertyRegistry.ts'),
    read('functions/runtime.ts'),
  ]);

  assert.match(page, /httpsCallable\(functions, 'adminUpsertPropertyCandidate'\)/);
  assert.match(page, /httpsCallable\(functions, 'adminDeletePropertyCandidate'\)/);
  assert.doesNotMatch(page, /\baddDoc\s*\(/);
  assert.doesNotMatch(page, /\bupdateDoc\s*\(/);
  assert.doesNotMatch(page, /\bdeleteDoc\s*\(/);

  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /sign_in_second_factor/);
  assert.match(backend, /multiFactor/);
  assert.match(backend, /ADMIN_CREATE_PROPERTY_CANDIDATE/);
  assert.match(backend, /ADMIN_UPDATE_PROPERTY_CANDIDATE/);
  assert.match(backend, /ADMIN_DELETE_PROPERTY_CANDIDATE/);
  assert.match(backend, /submittedGeoVerified: false/);
  assert.match(backend, /canonicalGeoChanged: false/);
  assert.match(runtime, /export \* from "\.\/secureAdminPropertyRegistry"/);
});

test('Admin candidate deletion fails closed for live or referenced property records', async () => {
  const backend = await read('functions/secureAdminPropertyRegistry.ts');
  assert.match(backend, /Only non-active review candidates can be deleted/);
  assert.match(backend, /collection\("units"\).*propertyId/s);
  assert.match(backend, /collection\("contracts"\).*propertyId/s);
  assert.match(backend, /collection\("maintenanceTickets"\).*propertyId/s);
  assert.match(backend, /Property has dependent records and cannot be hard-deleted/);
});
