import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant parcel collection is App Check-protected and server-authoritative', () => {
  const page = read('src/tenant/pages/TenantParcelsPage.tsx');
  const backend = read('functions/tenantParcelOperations.ts');
  const runtime = read('functions/runtime.ts');
  const writer = read('scripts/write-production-firestore-rules.mjs');

  assert.match(page, /httpsCallable\(functions, 'confirmTenantParcelCollection'\)/);
  assert.doesNotMatch(page, /updateDoc\(doc\(db, 'parcels'/);
  assert.match(page, /confirmingParcelId/);
  assert.match(page, /disabled=\{confirmingParcelId === p\.id\}/);

  assert.match(backend, /confirmTenantParcelCollection = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /tenantUid !== request\.auth\?\.uid/);
  assert.match(backend, /TENANT_PARCEL_COLLECTION_CONFIRMED/);
  assert.match(runtime, /tenantParcelOperations/);

  const parcelBlock = writer.slice(
    writer.indexOf("replaceRuleBlock('    match /parcels/{parcelId} {'"),
    writer.indexOf("replaceRuleBlock('    match /amenities/{amenityId} {'"),
  );
  assert.match(parcelBlock, /confirmTenantParcelCollection/);
  assert.doesNotMatch(parcelBlock, /tenantUidOwns\(resource\.data\).*allow update/s);
});

test('Phase 2 every-control matrix is required by both primary validation workflows', () => {
  const pkg = read('package.json');
  const pr = read('.github/workflows/pr-validation.yml');
  const profiles = read('.github/workflows/five-profile-onboarding-audit.yml');
  const matrix = read('scripts/verify-interactive-control-inventory.mjs');

  assert.match(pkg, /"test:phase2:controls"/);
  assert.match(pr, /Phase 2 every-control source inventory guard/);
  assert.match(pr, /npm run test:phase2:controls/);
  assert.match(profiles, /Enforce Phase 2 every-control matrix/);
  assert.match(profiles, /npm run test:phase2:controls/);
  assert.match(matrix, /Remote\/mutation-like action controls without disabled\/loading protection/);
  assert.match(matrix, /must survive browser refresh/);
  assert.match(matrix, /must remain exact in mobile Arabic mode/);
  assert.match(matrix, /must expose a route-aware back control/);
  assert.match(matrix, /must not render an access denial/);
});
