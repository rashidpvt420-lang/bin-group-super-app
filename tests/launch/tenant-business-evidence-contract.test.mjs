import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant main business evidence cannot regress to an Admin-seeded completion', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  assert.match(source, /submitRealTenantRequest/);
  assert.match(source, /assignToProtectedTechnician/);
  assert.match(source, /completeThroughTechnicianUi/);
  assert.match(source, /Complete Mission & Request Tenant Feedback/);
  assert.match(source, /Tenant → Technician → Tenant approval/);
  assert.doesNotMatch(source, /APPROVAL_TICKET_ID/);
  assert.doesNotMatch(source, /e2e-tenant-approval-ticket/);
  assert.doesNotMatch(source, /E2E completed work requiring mandatory tenant approval/);
});

test('Tenant main business evidence requires provider delivery, dispute, correction, and non-destructive unit recovery', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  assert.match(source, /assertTenantDeliveryReceipt/);
  assert.match(source, /pushDeliveryState === 'SUCCESS'/);
  assert.match(source, /mail\?\.delivery\?\.state === 'SUCCESS'/);
  assert.match(source, /Tenant dispute opens Admin review/);
  assert.match(source, /TENANT_DISPUTED_TICKET/);
  assert.match(source, /Tenant correction submission and immutable history/);
  assert.match(source, /without mutating an occupied unit/);
  assert.match(source, /createRecoveryTenant/);
  assert.match(source, /e2eTenantRecovery: true/);
  assert.match(source, /verificationCodeHash/);
  assert.doesNotMatch(source, /tenantId:\s*admin\.firestore\.FieldValue\.delete/);
  assert.doesNotMatch(source, /occupancyStatus:\s*'vacant'/);
  assert.doesNotMatch(source, /restoreLinkedUnit/);
});

test('Tenant completion notification and review are server authoritative and App Check protected', () => {
  const source = read('functions/tenantTicketReview.ts');
  assert.match(source, /onTenantCompletionReviewRequired/);
  assert.match(source, /deliverySource: "trigger:onTenantCompletionReviewRequired"/);
  assert.match(source, /tenantCompletionNotificationId/);
  assert.match(source, /tenantCompletionMailId/);
  assert.match(source, /enforceAppCheck: true/);
  assert.match(source, /MIN_DISPUTE_REASON = 8/);
  assert.match(source, /TENANT_DISPUTED_TICKET/);
  assert.match(source, /admin\.auth\(\)\.getUser\(tenantId\)/);
  assert.match(source, /firebase_auth_verified_email/);
  assert.doesNotMatch(source, /firstTenantEmail/);
  assert.doesNotMatch(source, /data\.tenantEmail \|\| data\.requesterEmail/);
});

test('Tenant unit-link request and Admin decision are protected and retain rejection evidence', () => {
  const runtime = read('functions/runtime.ts');
  const request = read('functions/secureTenantUnitLinkRequest.ts');
  const review = read('functions/secureTenantUnitLinkOperations.ts');
  const fallback = read('src/tenant/components/TenantUnitLinkFallback.tsx');

  assert.match(runtime, /tenantRequestUnitLink.*secureTenantUnitLinkRequest/);
  assert.match(request, /enforceAppCheck: true/);
  assert.match(request, /Tenant role required/);
  assert.match(review, /enforceAppCheck: true/);
  assert.match(review, /rejectionReason: reason/);
  assert.match(review, /ADMIN_REJECTED_TENANT_UNIT_LINK/);
  assert.match(fallback, /data-testid="tenant-unit-link-fallback"/);
  assert.match(fallback, /data-testid="tenant-unit-link-submit"/);
});

test('Tenant live-role fixture seeds dispatch-ready canonical property geo', () => {
  const seed = read('scripts/seed-live-role-test-data.mjs');
  assert.match(seed, /const canonicalGeo = \{/);
  assert.match(seed, /source: 'admin_manual'/);
  assert.match(seed, /verified: true/);
  assert.match(seed, /dispatchReady: true/);
  assert.match(seed, /requiresGeoReview: false/);
  assert.match(seed, /verificationVersion: 1/);
  assert.match(seed, /const canonicalGeoVerification = \{/);
  assert.match(seed, /state: 'VERIFIED'/);
  assert.match(seed, /source: 'FOUNDER_MFA_REVIEW'/);
  assert.match(seed, /geo: canonicalGeo/);
  assert.match(seed, /geoVerification: canonicalGeoVerification/);
  assert.match(seed, /propertyId,\s*\n\s*unitId,/);
  assert.match(seed, /assignedPropertyId: propertyId/);
  assert.match(seed, /assignedUnitId: unitId/);
});

test('Tenant request page resolves the canonical dispatch-ready linked unit', () => {
  const page = read('src/tenant/pages/TenantRequestPage.tsx');
  assert.match(page, /profile\?\.unitId \|\| profile\?\.assignedUnitId/);
  assert.match(page, /await queryUnits\('tenantId', user\.uid\)/);
  assert.match(page, /await queryUnits\('tenantUid', user\.uid\)/);
  assert.match(page, /await queryUnits\('currentTenantId', user\.uid\)/);
  assert.match(page, /await queryUnits\('tenantEmail', user\.email\.toLowerCase\(\)\)/);
  assert.match(page, /if \(property && hasCanonicalDispatchGeo\(property\)\)/);
  assert.match(page, /setUnitData\(selectedUnit\)/);
  assert.match(page, /setPropertyData\(selectedProperty\)/);
});
