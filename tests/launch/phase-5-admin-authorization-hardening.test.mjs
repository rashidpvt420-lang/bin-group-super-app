import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 5 retires local Admin claim grant and repair entrypoints', async () => {
  const [repair, grant] = await Promise.all([
    read('scripts/repair-admin-claims.mjs'),
    read('scripts/grant-admin.mjs'),
  ]);

  for (const source of [repair, grant]) {
    assert.match(source, /process\.exit\(1\)/);
    assert.doesNotMatch(source, /\.setCustomUserClaims\s*\(/);
    assert.doesNotMatch(source, /\.createUser\s*\(/);
    assert.doesNotMatch(source, /\.updateUser\s*\(/);
  }
  assert.match(repair, /local privileged-claim repair is retired/i);
  assert.match(grant, /local Admin creation and role escalation are disabled/i);
});

test('Phase 5 protects remaining exported Admin owner mutations', async () => {
  const source = await read('functions/adminOwnerOperations.ts');
  for (const name of [
    'adminSendOwnerOnboardingMessage',
    'adminCreateOwnerPropertyInspection',
    'approveOwnerSubmissionOperationalFlow',
    'adminSuspendOwner',
    'adminResumeOwner',
    'approveOwnerActivation',
  ]) {
    assert.match(source, new RegExp(`export const ${name} = onCall\\(\\{ cors: true, enforceAppCheck: true \\}`));
  }
  assert.match(source, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(source, /sign_in_second_factor/);
  assert.match(source, /email_verified/);
  assert.match(source, /Legacy single-property inspection creation is disabled/);
  assert.match(source, /adminCreateOwnerPortfolioPropertyInspection/);
});

test('Phase 5 protects Admin RERA verification, mail retries and reporting', async () => {
  const [broker, mail, reports] = await Promise.all([
    read('functions/brokerCommissions.ts'),
    read('functions/mailDelivery.ts'),
    read('functions/adminReports.ts'),
  ]);

  assert.match(broker, /setBrokerReraVerification = onCall\(\{ cors: true, region: "europe-west3", enforceAppCheck: true \}/);
  assert.match(broker, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(broker, /sign_in_second_factor/);

  assert.match(mail, /adminRetryMailDelivery = onCall\(\{[\s\S]*?enforceAppCheck: true/);
  assert.match(mail, /ADMIN_RETRY_MAIL_DELIVERY/);
  assert.match(mail, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(mail, /sign_in_second_factor/);

  assert.match(reports, /getAdminReports = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(reports, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
});

test('Phase 5 protects privileged manual rebuild operations and records their actors', async () => {
  const [renewals, reports] = await Promise.all([
    read('functions/contractRenewalPdfSystem.ts'),
    read('functions/monthlyOwnerPropertyReportSystem.ts'),
  ]);

  for (const source of [renewals, reports]) {
    assert.match(source, /requireCurrentAdminMutationAuthority/);
    assert.match(source, /sign_in_second_factor/);
    assert.match(source, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  }
  assert.match(renewals, /rebuildContractRenewalWatch = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(renewals, /ADMIN_REBUILD_CONTRACT_RENEWAL_WATCH/);
  assert.match(reports, /rebuildMonthlyOwnerPropertyReports = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(reports, /ADMIN_REBUILD_MONTHLY_OWNER_PROPERTY_REPORTS/);
});

test('Phase 5 requires live MFA Admin authority for provisioning and rejects stale staff authority', async () => {
  const [provisioning, lifecycle] = await Promise.all([
    read('functions/adminUserProvisioning.ts'),
    read('functions/adminStaffLifecycle.ts'),
  ]);

  assert.match(provisioning, /A verified Admin MFA session is required to manage staff access/);
  assert.match(provisioning, /hasAdminAccess\(actorRecord\.customClaims \|\| \{\}\)/);
  assert.match(provisioning, /sign_in_second_factor/);

  assert.match(lifecycle, /currentClaims = actor\.customClaims \|\| \{\}/);
  assert.match(lifecycle, /currentRole !== tokenRole/);
  assert.match(lifecycle, /Current staff authority is inactive or no longer matches this session/);
});

test('Canonical high-risk Admin flows remain server-authoritative', async () => {
  const [property, payment, brokerKyc, tenantLink, technician, recovery] = await Promise.all([
    read('functions/adminPropertyReview.ts'),
    read('functions/securePaymentApproval.ts'),
    read('functions/secureBrokerKycReview.ts'),
    read('functions/secureTenantUnitLinkOperations.ts'),
    read('functions/secureAdminTechnicianAssignment.ts'),
    read('functions/adminMfaRecovery.ts'),
  ]);

  for (const source of [property, payment, brokerKyc, tenantLink, technician, recovery]) {
    assert.match(source, /enforceAppCheck: true/);
  }
  assert.match(property, /sign_in_second_factor/);
  assert.match(property, /collection\("audit_logs"\)/);
  assert.match(payment, /requireMfaFinanceAdmin/);
  assert.match(payment, /Every property visit must be verified before final payment approval/);
  assert.match(payment, /Immutable 15% receipt evidence is required before final approval/);
  assert.match(brokerKyc, /submissionHash/);
  assert.match(brokerKyc, /ADMIN_APPROVE_BROKER_KYC_PRIVATE_VAULT/);
  assert.match(tenantLink, /ADMIN_APPROVED_TENANT_UNIT_LINK/);
  assert.match(technician, /ADMIN_ASSIGN_READY_TECHNICIAN/);
  assert.match(recovery, /admin_mfa_recovery_requests/);
});
