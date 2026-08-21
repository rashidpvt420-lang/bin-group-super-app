import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const roles = ['technician','operations_admin','operations_manager','finance_admin','finance_staff','hr_admin','hr_manager','hr_staff','support_admin','account_manager','dispatcher','manager','admin_assistant'];

test('Admin Staff Registry and secure provisioning share the complete staff role catalog', () => {
  const constants = read('apps/admin-panel/src/constants/staffRoles.ts');
  const hr = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
  const access = read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');
  for (const role of roles) assert.match(constants, new RegExp(`value: '${role}'`));
  assert.match(hr, /where\('role', 'in', STAFF_ROLE_VALUES\)/);
  assert.match(access, /where\('role', 'in', STAFF_ROLE_VALUES\)/);
  assert.doesNotMatch(hr, /where\('role', 'in', \['technician', 'hr_staff'/);
});

test('Admin staff lifecycle exports fail-closed callable operations', () => {
  const backend = read('functions/adminStaffLifecycle.ts');
  const runtime = read('functions/runtime.ts');
  for (const callable of ['adminGetStaffOperations','adminUpdateStaffProfile','adminRecordStaffAttendance','adminManageStaffLeave','adminRegisterStaffDocument','adminDeleteStaffDocument','adminResendStaffInvitation','adminOffboardStaff']) assert.match(backend, new RegExp(`export const ${callable} = onCall`));
  assert.match(backend, /enforceAppCheck: true/g);
  assert.match(backend, /Target identity is not a provisioned BIN GROUP staff account/);
  assert.match(backend, /Privileged Founder\/Admin identities are not managed through the staff lifecycle/);
  assert.match(runtime, /export \* from "\.\/adminStaffLifecycle"/);
});

test('HR lifecycle UI exposes working profile onboarding attendance leave documents payroll KPI audit and offboarding controls', () => {
  const dialog = read('apps/admin-panel/src/pages/admin/StaffLifecycleDialog.tsx');
  for (const id of ['staff-lifecycle-profile-tab','staff-lifecycle-onboarding-tab','staff-lifecycle-attendance-tab','staff-lifecycle-leave-tab','staff-lifecycle-documents-tab','staff-lifecycle-payroll-tab','staff-lifecycle-audit-tab','save-staff-profile','resend-staff-invitation','record-staff-attendance','create-staff-leave','upload-staff-document','offboard-staff']) assert.match(dialog, new RegExp(`data-testid="${id}"`));
  assert.match(dialog, /hrDocuments\/\$\{uid\}/);
  assert.match(dialog, /Only PDF and image HR documents are allowed/);
  assert.match(dialog, /Missing evidence remains N\/A/);
});

test('Offboarding revokes access while preserving historical evidence', () => {
  const backend = read('functions/adminStaffLifecycle.ts');
  assert.match(backend, /updateUser\(uid, \{ disabled: true \}\)/);
  assert.match(backend, /revokeRefreshTokens\(uid\)/);
  assert.match(backend, /status: 'EXITED'/);
  assert.match(backend, /historyPreserved: true/);
  assert.doesNotMatch(backend, /deleteUser\(uid\)/);
});
