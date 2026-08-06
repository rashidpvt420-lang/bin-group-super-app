// Owner-authored validation trigger for the exact fifth-round repair candidate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('authenticated profile data cannot replace the Firebase Auth identity', () => {
  const source = read('src/context/RoleContext.tsx');
  const mergedProfile = source.match(/setUser\(\{[\s\S]*?\.\.\.currentUser,[\s\S]*?\.\.\.data,[\s\S]*?role: resolvedRole,[\s\S]*?\}\s+as SovereignUser\);/);
  assert.ok(mergedProfile, 'Expected the approved-profile setUser merge.');
  assert.match(mergedProfile[0], /uid:\s*currentUser\.uid/);
  assert.match(mergedProfile[0], /email:\s*currentUser\.email\s*\|\|\s*data\.email\s*\|\|\s*null/);
  assert.match(mergedProfile[0], /emailVerified:\s*currentUser\.emailVerified/);
  assert.ok(
    mergedProfile[0].indexOf('uid: currentUser.uid') > mergedProfile[0].indexOf('...data'),
    'The authoritative UID must be written after profile fields are spread.',
  );
});

test('legal consent becomes actionable when all terms already fit without scrolling', () => {
  const source = read('src/components/LegalModal.tsx');
  assert.match(source, /scrollHeight\s*<=\s*clientHeight\s*\+\s*20/);
  assert.match(source, /requestAnimationFrame\(evaluateScrollReadiness\)/);
  assert.match(source, /new ResizeObserver\(evaluateScrollReadiness\)/);
  assert.match(source, /data-testid="legal-agreement-content"/);
});

test('Owner financial streams fail visibly instead of holding an infinite loader', () => {
  const source = read('src/owner/pages/OwnerFinancialsPage.tsx');
  assert.doesNotMatch(source, /where\('ownerEmail',\s*'==',\s*email\),\s*orderBy\('createdAt'/);
  assert.match(source, /\.sort\(\(a:\s*any,\s*b:\s*any\)\s*=>\s*timestampMs\(b\.createdAt/);
  assert.match(source, /Owner payout stream failed/);
  assert.match(source, /Owner invoice stream failed/);
  assert.match(source, /setLoading\(false\)/);
  assert.match(source, /<Alert severity="warning"/);
});

test('Admin production evidence waits for the actual browser alerts', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  assert.match(source, /page\.waitForEvent\('dialog',\s*\{\s*timeout:\s*30_000\s*\}\)/);
  assert.match(source, /propertyApprovalBrowserDialog\.message\(\)/);
  assert.match(source, /rejectionDialog\.message\(\)/);
});

test('Tenant cross-role arrival includes server-verifiable GPS accuracy', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  assert.match(source, /geolocation:\s*\{\s*longitude:\s*coordinates\.longitude,\s*latitude:\s*coordinates\.latitude,\s*accuracy:\s*15\s*\}/);
});

test('Technician fixture canonicalizes all identity binding fields', () => {
  const source = read('tests/e2e/business-technician.spec.ts');
  assert.match(source, /uid:\s*technicianUid/);
  assert.match(source, /authUid:\s*technicianUid/);
  assert.match(source, /userId:\s*technicianUid/);
  assert.match(source, /email:\s*EMAIL\.toLowerCase\(\)/);
});
