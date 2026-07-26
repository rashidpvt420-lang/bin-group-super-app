import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('canonical property geo is server-authoritative and Owner submissions remain unverified', async () => {
  const [rules, backend, rootLocation, ownerLocation, legacyAdminPage, pinResolver] = await Promise.all([
    read('firestore.rules'),
    read('functions/adminPropertyReview.ts'),
    read('src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
    read('apps/admin-panel/src/lib/verifiedPropertyPin.ts'),
  ]);

  assert.match(rules, /function ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /safeOwnerPropertyCreate/);
  assert.match(rules, /'geoVerification'/);
  assert.match(rules, /canManageProperties\(\) && canonicalPropertyGeoUnchanged\(\)/);

  for (const component of [rootLocation, ownerLocation]) {
    assert.match(component, /submittedGeo:/);
    assert.match(component, /source: 'owner_submission'/);
    assert.match(component, /verified: false/);
    assert.match(component, /dispatchReady: false/);
    assert.match(component, /requiresGeoReview: true/);
    assert.doesNotMatch(component, /geo: geo as any/);
  }

  assert.match(backend, /canonicalVerifiedGeo/);
  assert.match(backend, /new admin\.firestore\.GeoPoint/);
  assert.match(backend, /update\.geo = canonicalGeo/);
  assert.match(backend, /source: "admin_manual"/);
  assert.match(backend, /verified: true/);
  assert.match(backend, /dispatchReady: true/);
  assert.match(backend, /requiresGeoReview: false/);
  assert.match(backend, /geoDispatchReady/);

  assert.match(legacyAdminPage, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(legacyAdminPage, /updateDoc\s*\(/);
  assert.doesNotMatch(legacyAdminPage, /addDoc\s*\(/);
  assert.doesNotMatch(pinResolver, /owner_submission/);
});
