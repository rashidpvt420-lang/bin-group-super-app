import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const rootUrl = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), 'utf8');

test('new staff accounts are staged, never born onboarding-complete', async () => {
  const source = await read('functions/adminUserProvisioning.ts');

  assert.match(source, /status: "INVITED"/);
  assert.match(source, /onboardingStage: "INVITED"/);
  assert.match(source, /onboardingComplete: false/);
  assert.match(source, /approvalStatus: "PENDING"/);
  assert.match(source, /available: false/);
  assert.match(source, /invitationStatus: "QUEUED"/);
  assert.doesNotMatch(source, /const operationalProfile = \{[\s\S]*?onboardingComplete: true/);
});

test('HR lifecycle mutations are App Check-protected and offboarding preserves history', async () => {
  const source = await read('functions/hrLifecycle.ts');

  assert.match(source, /enforceAppCheck: true/);
  for (const callable of [
    'adminUpdateStaffProfile', 'adminResendStaffInvitation', 'adminUpdateStaffOnboarding',
    'submitStaffLeaveRequest', 'adminResolveStaffLeaveRequest', 'adminRecordAttendanceAdjustment',
    'adminRegisterHrDocument', 'adminOffboardStaff', 'adminGetHrCommandSnapshot',
  ]) {
    assert.match(source, new RegExp(`export const ${callable} = onCall`), `missing ${callable}`);
  }
  assert.match(source, /admin\.auth\(\)\.updateUser\(uid, \{ disabled: true \}\)/);
  assert.match(source, /admin\.auth\(\)\.revokeRefreshTokens\(uid\)/);
  assert.match(source, /status: "OFFBOARDED"/);
  assert.match(source, /recordsArchived: true/);
  assert.doesNotMatch(source, /deleteUser\(/);
  assert.doesNotMatch(source, /\.delete\(\)/);
});

test('HR snapshot redacts private HR fields from hr_staff readers', async () => {
  const source = await read('functions/hrLifecycle.ts');

  assert.match(source, /const includePrivate = isHrManager\(actor\.token\)/);
  assert.match(source, /const privateSnap = includePrivate \? await db\.collection\("private_hr_profiles"\)/);
  assert.match(source, /employeeId: includePrivate \?/);
  assert.match(source, /salaryPackage: includePrivate \?/);
  assert.match(source, /privateFieldsIncluded: includePrivate/);
});

test('technician admin UI contains no direct identity edit or delete path', async () => {
  const source = await read('apps/admin-panel/src/pages/technicians/TechniciansManagementPage.tsx');

  assert.match(source, /navigate\('\/hr\?register=technician'\)/);
  assert.match(source, /adminUpdateStaffProfile/);
  assert.match(source, /adminSetStaffStatus/);
  assert.match(source, /adminOffboardStaff/);
  assert.doesNotMatch(source, /updateDoc\(/);
  assert.doesNotMatch(source, /deleteDoc\(/);
  assert.doesNotMatch(source, /setDoc\(/);
  assert.doesNotMatch(source, /Disable the Firebase Auth user separately/i);
});

test('property contacts are explicitly separate and never default to prop_a', async () => {
  const source = await read('apps/admin-panel/src/pages/ops/StaffDirectoryPage.tsx');

  assert.match(source, /Property Contacts Directory/);
  assert.match(source, /This is not employee registration/);
  assert.match(source, /collection\(db, 'properties'\)/);
  assert.match(source, /if \(!propertyId\)/);
  assert.doesNotMatch(source, /prop_a/);
});

test('obsolete RegisterStaffDialog implementation remains retired', async () => {
  await assert.rejects(access(new URL('apps/admin-panel/src/components/RegisterStaffDialog.tsx', rootUrl)));
});

test('Staff Access imports one canonical role/module policy and supports rich HR provisioning', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');

  assert.match(source, /PROVISIONABLE_STAFF_ROLE_OPTIONS/);
  assert.match(source, /ROLE_ALLOWED_MODULES/);
  assert.match(source, /ROLE_DEFAULT_MODULES/);
  assert.match(source, /employeeId/);
  assert.match(source, /emiratesId/);
  assert.match(source, /basicSalary/);
  assert.match(source, /emergencyContactName/);
  assert.match(source, /primaryEmirate/);
  assert.match(source, /adminCreateUser/);
  assert.doesNotMatch(source, /BinGroupPass2026!/);
  assert.doesNotMatch(source, /initialPassword/);
});

test('invitation delivery outcome is synchronized into staff lifecycle state', async () => {
  const source = await read('functions/mailDelivery.ts');

  assert.match(source, /syncStaffInvitationDelivery/);
  assert.match(source, /"PROCESSING" \| "DELIVERED" \| "ERROR"/);
  assert.match(source, /invitationStatus: state/);
  assert.match(source, /invitationLastError/);
});

test('Admin Command Center consumes live HR and operational summaries instead of hard-coded pilot percentages', async () => {
  const dashboard = await read('apps/admin-panel/src/pages/dashboard/AdminSimpleDashboardPage.tsx');
  const backend = await read('functions/adminCommandCenter.ts');

  assert.match(dashboard, /adminGetHrCommandSnapshot/);
  assert.match(dashboard, /adminGetCommandCenterSummary/);
  assert.match(dashboard, /Pending staff invitations/);
  assert.match(dashboard, /Open emergency tickets/);
  assert.doesNotMatch(dashboard, /Not measured/);
  assert.doesNotMatch(dashboard, /progress:\s*0/);
  assert.match(backend, /maintenanceTickets/);
  assert.match(backend, /security_audit_logs/);
  assert.match(backend, /enforceAppCheck: true/);
});

test('runtime deploy entrypoint exports the HR lifecycle and Command Center callables', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \* from "\.\/hrLifecycle"/);
  assert.match(runtime, /export \* from "\.\/adminCommandCenter"/);
});
