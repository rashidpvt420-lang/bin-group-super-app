import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('canonical property geo is server-authoritative and Owner submissions remain unverified', async () => {
  const [rules, backend, authority, rootLocation, ownerLocation, legacyAdminPage, pinResolver] = await Promise.all([
    read('firestore.rules'),
    read('functions/adminPropertyReview.ts'),
    read('functions/propertyGeoAuthority.ts'),
    read('src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
    read('apps/admin-panel/src/lib/verifiedPropertyPin.ts'),
  ]);

  assert.match(rules, /function ownerCannotSupplyCanonicalPropertyGeo/);
  assert.match(rules, /function ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /function safeOwnerPropertyCreate[\s\S]*ownerCannotSupplyCanonicalPropertyGeo\(data\)[\s\S]*ownerSubmittedPropertyGeoIsUnverified\(data\)/);
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
  assert.match(backend, /buildFounderVerifiedPropertyGeo/);
  assert.match(backend, /update\.geo = canonicalGeo/);
  assert.match(backend, /geoDispatchReady/);
  assert.match(authority, /new admin\.firestore\.GeoPoint/);
  assert.match(authority, /source: "admin_manual"/);
  assert.match(authority, /verificationVersion: 1/);
  assert.match(authority, /state: "VERIFIED"/);
  assert.match(authority, /source: "FOUNDER_MFA_REVIEW"/);

  assert.match(legacyAdminPage, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(legacyAdminPage, /updateDoc\s*\(/);
  assert.doesNotMatch(legacyAdminPage, /addDoc\s*\(/);
  assert.doesNotMatch(pinResolver, /owner_submission/);
  assert.match(pinResolver, /geoVerification/);
});

test('verified properties keep ordinary Owner updates while canonical geo stays immutable', async () => {
  const [rules, emulatorTest] = await Promise.all([
    read('firestore.rules'),
    read('test/property-geo-authority-rules.test.js'),
  ]);
  const updateStart = rules.indexOf('function safeOwnerPropertyUpdate()');
  const updateEnd = rules.indexOf('\n    }', updateStart) + '\n    }'.length;
  const updateBlock = rules.slice(updateStart, updateEnd);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.match(updateBlock, /canonicalPropertyGeoUnchanged\(\)/);
  assert.match(updateBlock, /ownerSubmittedPropertyGeoIsUnverified\(request\.resource\.data\)/);
  assert.doesNotMatch(updateBlock, /ownerCannotSupplyCanonicalPropertyGeo/);
  assert.match(emulatorTest, /Owner-updated ordinary property name/);
  assert.match(emulatorTest, /assertFails\(updateDoc\(refOwner, \{ geo:/);
});
