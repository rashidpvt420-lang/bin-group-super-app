import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Super Admin and authoritative HR roles can access HR manager controls', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');

  assert.match(source, /privilegedHRRoles = new Set\(\['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager'\]\)/);
  assert.match(source, /user\?\.claims\?\.admin === true/);
  assert.match(source, /user\?\.isAdmin === true/);
  assert.match(source, /privilegedHRRoles\.has\(String\(user\?\.role\)\)/);
  assert.match(source, /httpsCallable\(functions, 'adminGetHrCommandSnapshot'\)/);
  assert.doesNotMatch(source, /where\('role', 'in', \['technician', 'hr_staff', 'hr_manager', 'hr_admin'\]\)/);
});

test('HR registry consumes the canonical protected staff snapshot for every supported staff role', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
  const policy = await read('apps/admin-panel/src/security/staffAccessPolicy.ts');

  for (const role of [
    'technician', 'manager', 'operations_admin', 'hr_admin', 'support_admin', 'hr_staff', 'hr_manager',
    'finance_staff', 'dispatcher', 'admin_assistant', 'account_manager', 'operations_manager', 'finance_admin',
  ]) {
    assert.match(policy, new RegExp(`value: '${role}'`), `missing provisionable role ${role}`);
  }

  assert.match(source, /const filteredStaff = useMemo\(\(\) => snapshot\.staff\.filter/);
  assert.match(source, /member\.displayName, member\.email, member\.role, member\.specialization, member\.department, member\.employeeId/);
  assert.match(source, /filteredStaff\.map/);
  assert.match(source, /The registry covers all 13 provisionable staff roles/);
});

test('Attendance, leave, HR documents and lifecycle controls are operational rather than placeholders', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');

  assert.match(source, /adminRecordAttendanceAdjustment/);
  assert.match(source, /adminResolveStaffLeaveRequest/);
  assert.match(source, /adminRegisterHrDocument/);
  assert.match(source, /uploadBytes\(fileRef, documentFile/);
  assert.match(source, /adminUpdateStaffProfile/);
  assert.match(source, /adminUpdateStaffOnboarding/);
  assert.match(source, /adminResendStaffInvitation/);
  assert.match(source, /adminOffboardStaff/);
  assert.doesNotMatch(source, /attendance collections are not activated/i);
  assert.doesNotMatch(source, /should attach here after Storage rules/i);
});
