import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Founder legacy and physical-inspection geo feed the same fail-closed dispatch consumers', async () => {
  const [authority, review, completion, ownerTickets, tenantTickets, adminPins] = await Promise.all([
    read('functions/propertyGeoAuthority.ts'),
    read('functions/adminPropertyReview.ts'),
    read('functions/canonicalOwnerInspectionCompletion.ts'),
    read('functions/ownerMaintenanceOperations.ts'),
    read('functions/tenantTicketOperations.ts'),
    read('apps/admin-panel/src/lib/verifiedPropertyPin.ts'),
  ]);

  assert.match(authority, /export function buildFounderVerifiedPropertyGeo/);
  assert.match(authority, /export function buildInspectionVerifiedPropertyGeo/);
  assert.match(authority, /export function resolveDispatchReadyPropertyGeo/);
  assert.match(authority, /const founderVerified =/);
  assert.match(authority, /verification\.source === "FOUNDER_MFA_REVIEW"/);
  assert.match(authority, /const physicalVerified =/);
  assert.match(authority, /verification\.source === "PHYSICAL_INSPECTION_EVIDENCE"/);
  assert.match(authority, /geo\.source === "physical_inspection"/);
  assert.match(authority, /verification\.evidenceHash/);
  assert.match(authority, /verification\.evidenceGeneration/);
  assert.match(authority, /text\(geo\.inspectionId, 240\) === text\(verification\.inspectionId, 240\)/);
  assert.match(authority, /verifiedBy === verificationActor/);
  assert.match(authority, /geoVerifiedAtMs === verificationAtMs/);
  assert.match(authority, /if \(!founderVerified && !physicalVerified\)/);

  assert.match(review, /buildFounderVerifiedPropertyGeo\(property, actor\.uid, now\)/);
  assert.match(review, /hasDispatchReadyPropertyGeo\(property\)/);
  assert.match(review, /geoOnlyReview/);
  assert.match(completion, /buildInspectionVerifiedPropertyGeo/);
  assert.match(completion, /PHYSICAL_INSPECTION_EVIDENCE_V2/);

  assert.match(ownerTickets, /enforceAppCheck: true/);
  assert.match(ownerTickets, /resolveDispatchReadyPropertyGeo\(property\)/);
  assert.match(ownerTickets, /source: "SERVER_VERIFIED_PROPERTY_GEO"/);
  assert.doesNotMatch(ownerTickets, /property\.location \|\| property\.propertyLocation \|\| property\.geoPoint/);

  assert.match(tenantTickets, /resolveDispatchReadyPropertyGeo\(property\)/);
  assert.match(tenantTickets, /source: "SERVER_VERIFIED_PROPERTY_GEO"/);
  assert.doesNotMatch(tenantTickets, /property\.location \|\| property\.propertyLocation \|\| property\.geoPoint/);

  assert.match(adminPins, /const founderVerified =/);
  assert.match(adminPins, /verification\.source === 'FOUNDER_MFA_REVIEW'/);
  assert.match(adminPins, /const physicalVerified =/);
  assert.match(adminPins, /verification\.source === 'PHYSICAL_INSPECTION_EVIDENCE'/);
  assert.match(adminPins, /geo\.source === 'physical_inspection'/);
  assert.match(adminPins, /evidenceHash/);
  assert.match(adminPins, /evidenceGeneration/);
  assert.match(adminPins, /verifiedBy !== verificationActor/);
  assert.match(adminPins, /verifiedAtMs !== verificationAtMs/);
  assert.match(adminPins, /if \(!founderVerified && !physicalVerified\) return null/);
});
