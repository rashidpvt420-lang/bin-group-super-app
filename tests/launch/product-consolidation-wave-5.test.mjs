import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Wave 5 makes HR Command the canonical protected employee lifecycle', async () => {
  const [backend, hr, details, access] = await Promise.all([
    read('functions/adminStaffLifecycle.ts'),
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('apps/admin-panel/src/pages/admin/StaffLifecycleDetailsDialog.tsx'),
    read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx'),
  ]);

  expectAll(backend, [
    /HR_MANAGER_ROLES = new Set\(\["hr_admin", "hr_manager"\]\)/,
    /HR_READER_ROLES = new Set\(\["hr_admin", "hr_manager", "hr_staff"\]\)/,
    /requireHrReader/,
    /requireHrManager/,
    /adminGetStaffLifecycle = onCall/,
    /const actor = await requireHrReader\(request\)/,
    /adminGetStaffDetails = onCall/,
    /privateFieldsIncluded: includePrivate/,
    /canManageLifecycle: actor\.canManageLifecycle/,
    /adminUpdateStaffProfile = onCall/,
    /omittedFieldsPreserved: true/,
    /preservedNullableText/,
    /preservedNumber/,
    /adminUpdateStaffOnboarding = onCall/,
    /"PROFILE_COMPLETE"/,
    /"DOCUMENTS_COMPLETE"/,
    /"CONTRACT_COMPLETE"/,
    /"DEVICE_READY"/,
    /activationApproved/,
    /adminOffboardStaff = onCall/,
    /revokeRefreshTokens\(uid\)/,
    /status: "OFFBOARDED"/,
    /recordsPreserved: true/,
    /enforceAppCheck: true/g,
  ], 'canonical staff lifecycle backend');

  expectAll(hr, [
    /Canonical employee authority:/,
    /const provisioningAdminRoles = new Set\(\['super_admin', 'admin', 'ceo'\]\)/,
    /const isProvisioningAdmin = Boolean/,
    /<Tab label="STAFF ACCESS" disabled=\{!isProvisioningAdmin\} \/>/,
    /tab === 4 && isProvisioningAdmin && <StaffAccessPage \/>/,
    /adminGetStaffLifecycle/,
    /adminGetHrOperations/,
    /admin-staff-profile-/,
    /StaffLifecycleDetailsDialog/,
    /SUSPENDED \/ OFFBOARDED/,
  ], 'HR Command canonical workspace');

  expectAll(details, [
    /adminGetStaffDetails/,
    /adminUpdateStaffProfile/,
    /adminUpdateStaffOnboarding/,
    /adminResendStaffInvitation/,
    /adminOffboardStaff/,
    /privateFieldsIncluded/,
    /HR Staff access is read-only/,
    /admin-staff-details-page/,
  ], 'canonical staff profile surface');

  expectAll(access, [
    /adminCreateUser/,
    /adminUpdateStaffAccess/,
    /adminSetStaffStatus/,
    /ADD STAFF \/ TECHNICIAN/,
  ], 'Founder/Admin provisioning surface');
});

test('Wave 5 Technician Corps is an operational roster, not a second employee authority', async () => {
  const [backend, technicians] = await Promise.all([
    read('functions/adminStaffLifecycle.ts'),
    read('apps/admin-panel/src/pages/technicians/TechniciansManagementPage.tsx'),
  ]);

  expectAll(backend, [
    /TECHNICIAN_DIRECTORY_ROLES/,
    /adminGetTechnicianOperationsDirectory = onCall/,
    /requireTechnicianDirectoryReader/,
    /canManageLifecycle: actor\.canManageLifecycle/,
  ], 'protected Technician operational directory');

  expectAll(technicians, [
    /adminGetTechnicianOperationsDirectory/,
    /Operational roster only:/,
    /Employee identity, profile, onboarding, access and offboarding are owned by HR Command/,
    /MANAGE STAFF IN HR/,
    /MANAGE IN HR/,
    /\/hr\?staff=/,
    /admin-technician-operations-directory/,
  ], 'Technician operational roster');

  for (const forbidden of [
    /httpsCallable\(functions, 'adminCreateUser'\)/,
    /httpsCallable\(functions, 'adminUpdateStaffProfile'\)/,
    /httpsCallable\(functions, 'adminOffboardStaff'\)/,
    /CREATE SECURE ACCOUNT/,
    /ADD TECHNICIAN/,
    /SUSPEND & OFFBOARD/,
  ]) {
    assert.doesNotMatch(technicians, forbidden, `Technician Corps must not retain duplicate employee authority: ${forbidden}`);
  }
});

test('Wave 5 preserves Property Contacts as a separate non-employee directory', async () => {
  const contacts = await read('apps/admin-panel/src/pages/ops/StaffDirectoryPage.tsx');

  expectAll(contacts, [
    /Property Contacts Directory/,
    /does not create Firebase Auth users, HR profiles, payroll identities or Technician accounts/,
    /directoryType: 'PROPERTY_CONTACT'/,
    /collection\(db, 'staffDirectory'\)/,
  ], 'Property Contacts boundary');

  assert.doesNotMatch(contacts, /adminCreateUser/);
  assert.doesNotMatch(contacts, /adminUpdateStaffProfile/);
});

test('Wave 5 keeps onboarding access fail-closed, offboarding terminal and technician payroll linked', async () => {
  const [lifecycle, provisioning] = await Promise.all([
    read('functions/adminStaffLifecycle.ts'),
    read('functions/adminUserProvisioning.ts'),
  ]);

  expectAll(lifecycle, [
    /entry\.techId/,
    /entry\.technicianId/,
    /active: state\.active/,
    /suspended: !state\.active/,
    /const nextClaims = \{ \.\.\.previousClaims, suspended: !state\.active \}/,
    /setCustomUserClaims\(uid, nextClaims\)/,
    /portalAccessActive: state\.active/,
    /refreshTokensRevoked: true/,
  ], 'canonical onboarding and payroll integrity');

  expectAll(provisioning, [
    /status: "INVITED"/,
    /onboardingStage: "INVITED"/,
    /onboardingComplete: false/,
    /claimsForAccess\(role, modules, permissions, true\)/,
    /active: false, suspended: true, status: "INVITED"/,
    /portalAccessActive: false/,
    /const lifecycleActive =/,
    /claimsForAccess\(role, modules, permissions, !lifecycleActive\)/,
    /requestedStatus === "ACTIVE" && userSnap\.data\(\)\?\.onboardingComplete !== true/,
    /Complete canonical HR onboarding before activating staff access/,
    /currentStatus === "OFFBOARDED"/,
    /claims\.offboarded === true/,
    /OFFBOARDED is terminal/,
  ], 'canonical provisioning and terminal lifecycle guards');
});
