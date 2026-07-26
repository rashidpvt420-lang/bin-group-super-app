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
