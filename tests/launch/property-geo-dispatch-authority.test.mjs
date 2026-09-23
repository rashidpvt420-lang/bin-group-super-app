import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Founder promotion and every dispatch consumer share one canonical property geo contract', async () => {
  const [authority, review, ownerTickets, tenantTickets, adminPins] = await Promise.all([
    read('functions/propertyGeoAuthority.ts'),
    read('functions/adminPropertyReview.ts'),
    read('functions/ownerMaintenanceOperations.ts'),
    read('functions/tenantTicketOperations.ts'),
    read('apps/admin-panel/src/lib/verifiedPropertyPin.ts'),
  ]);

  assert.match(authority, /export function buildFounderVerifiedPropertyGeo/);
  assert.match(authority, /export function resolveDispatchReadyPropertyGeo/);
  assert.match(authority, /verification\.source !== "FOUNDER_MFA_REVIEW"/);
  assert.match(authority, /Number\(verification\.verificationVersion\) !== 1/);
  assert.match(authority, /verifiedBy !== verificationActor/);
  assert.match(authority, /geoVerifiedAtMs !== verificationAtMs/);

  assert.match(review, /buildFounderVerifiedPropertyGeo\(property, actor\.uid, now\)/);
  assert.match(review, /hasDispatchReadyPropertyGeo\(property\)/);
  assert.match(review, /geoOnlyReview/);

  assert.match(ownerTickets, /enforceAppCheck: true/);
  assert.match(ownerTickets, /resolveDispatchReadyPropertyGeo\(property\)/);
  assert.match(ownerTickets, /source: "SERVER_VERIFIED_PROPERTY_GEO"/);
  assert.doesNotMatch(ownerTickets, /property\.location \|\| property\.propertyLocation \|\| property\.geoPoint/);

  assert.match(tenantTickets, /resolveDispatchReadyPropertyGeo\(property\)/);
  assert.match(tenantTickets, /source: "SERVER_VERIFIED_PROPERTY_GEO"/);
  assert.doesNotMatch(tenantTickets, /property\.location \|\| property\.propertyLocation \|\| property\.geoPoint/);

  assert.match(adminPins, /verification\.source !== 'FOUNDER_MFA_REVIEW'/);
  assert.match(adminPins, /Number\(verification\.verificationVersion\) !== 1/);
  assert.match(adminPins, /verifiedAtMs !== verificationAtMs/);
});
