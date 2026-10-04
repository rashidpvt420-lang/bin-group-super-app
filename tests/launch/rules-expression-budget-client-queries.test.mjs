// Gap 12 (client half): pages must only issue queries the Firestore rules can prove from the
// query constraints. Unprovable shapes are rejected outright (1000-expression limit or rules
// evaluation errors) and the page renders empty. Rule-side behaviour is covered by
// test/ticket-list-expression-budget-rules.test.js under the emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('tenant community queries approved posts and own posts separately (no propertyId-only query)', () => {
  const source = read('src/tenant/pages/TenantCommunityPage.tsx');
  assert.match(source, /where\('propertyId', '==', propertyId\),\s*where\('status', '==', 'approved'\)/);
  assert.match(source, /where\('propertyId', '==', propertyId\),\s*where\('authorUid', '==', user\.uid\)/);
  assert.doesNotMatch(source, /collection\(db, 'communityPosts'\),\s*where\('propertyId', '==', propertyId\)\s*\)/);
});

test('tenant keys and key movements are constrained by unit AND property', () => {
  const source = read('src/tenant/pages/TenantKeysPage.tsx');
  assert.match(source, /collection\(db, 'keyRegister'\), where\('unitId', '==', unitId\), where\('propertyId', '==', propertyId\)/);
  assert.match(source, /collection\(db, 'keyMovements'\), where\('unitId', '==', unitId\), where\('propertyId', '==', propertyId\)/);
  assert.doesNotMatch(source, /where\('unitId', '==', unitId\)\);/);
});

test('owner unit drill-down degrades per unit when a tenant profile is not readable', () => {
  const source = read('src/pages/PropertyUnitsPage.tsx');
  assert.match(source, /try \{\s*const tenantSnap = await getDoc\(doc\(db, 'users', u\.currentTenantId\)\);[\s\S]*?\} catch \(tenantErr\) \{[\s\S]*?return \{ \.\.\.u, tenant: null \};/);
});

test('owner contracts page does not issue always-denied nested e-mail lookups', () => {
  const source = read('src/owner/pages/OwnerContractsResolvedPage.tsx');
  assert.doesNotMatch(source, /safeQueryContracts\('emailDelivery\.recipient'/);
  assert.doesNotMatch(source, /safeQueryContracts\('companyProfile\.email'/);
  assert.match(source, /safeQueryContracts\('ownerEmail', email\)/);
});
