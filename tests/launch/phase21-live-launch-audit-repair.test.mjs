import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 21 live audit keeps visible icon controls accessible', () => {
  const invoice = read('src/pages/public/InvoiceVerificationPage.tsx');
  const owner = read('src/owner/pages/OwnerPropertiesPage.tsx');
  const tenant = read('src/tenant/pages/TenantMoveInspectionPage.tsx');
  const admin = read('apps/admin-panel/src/components/AdminPageFrame.tsx');
  const broker = read('src/broker/pages/BrokerLeadsPage.tsx');

  assert.match(invoice, /aria-label=\{proofType === 'contract'/);
  assert.match(owner, /aria-label=\{\`Open \$\{prop\.propertyName \|\| 'property'\} passport\`\}/);
  assert.match(tenant, /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/);
  assert.match(tenant, /aria-label=\{isRTL \? \`إرفاق صورة لـ \$\{item\}\`/);
  assert.match(admin, /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/);
  assert.match(broker, /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/);
  assert.match(broker, /navigate\('\/broker\/leads'\)/);
});

test('Owner tenant directory uses the UID-bound property query authorized by Firestore rules', () => {
  const ownerTenants = read('src/owner/pages/OwnerTenantsPage.tsx');
  assert.match(ownerTenants, /where\('ownerId', '==', user\.uid\)/);
  assert.doesNotMatch(ownerTenants, /where\('ownerEmail', '==', user\.email\.toLowerCase\(\)\)/);
  assert.match(ownerTenants, /\}, \[user\?\.uid\]\);/);
});

test('Admin Google Maps receives a real Firebase App Check token before map creation', () => {
  const firebase = read('apps/admin-panel/src/lib/firebase.ts');
  const maps = read('apps/admin-panel/src/lib/googleMaps.ts');
  assert.match(firebase, /getToken as getAppCheckToken/);
  assert.match(firebase, /getAdminMapsAppCheckToken/);
  assert.match(firebase, /getAppCheckToken\(adminAppCheck, false\)/);
  assert.match(maps, /Settings\.getInstance\(\)\.fetchAppCheckToken = \(\) => getAdminMapsAppCheckToken\(\)/);
  assert.match(maps, /await configureMapsAppCheck\(w\)/);
});
