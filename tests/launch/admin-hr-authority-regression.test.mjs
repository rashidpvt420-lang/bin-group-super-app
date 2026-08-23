import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const CANONICAL_STAFF_ROLES = [
  'technician',
  'operations_admin',
  'operations_manager',
  'finance_admin',
  'finance_staff',
  'hr_admin',
  'hr_manager',
  'hr_staff',
  'support_admin',
  'account_manager',
  'dispatcher',
  'manager',
  'admin_assistant',
];

test('Super Admin and authoritative Admin claims can access HR manager controls', async () => {
  const [source, lifecycle] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('functions/adminStaffLifecycle.ts'),
  ]);

  assert.match(source, /user\?\.claims\?\.admin === true/);
  assert.match(source, /user\?\.isAdmin === true/);
  assert.match(source, /user\?\.claims\?\.ceo === true/);
  assert.match(source, /new Set\(\['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager'\]\)/);
  assert.match(source, /where\('role', 'in', STAFF_ROLE_VALUES\)/);
});

test('HR registry uses the canonical complete staff role catalog instead of the legacy four-role subset', async () => {
  const [source, catalog] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('apps/admin-panel/src/constants/staffRoles.ts'),
  ]);

  for (const role of CANONICAL_STAFF_ROLES) {
    assert.match(catalog, new RegExp(`value: '${role}'`), `canonical staff catalog must include ${role}`);
  }
  assert.match(source, /where\('role', 'in', STAFF_ROLE_VALUES\)/);
  assert.doesNotMatch(source, /where\('role', 'in', \['technician', 'hr_staff', 'hr_manager', 'hr_admin'\]\)/);
});

test('HR registry filtering and empty state remain wired through the shared registry table', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');

  assert.match(source, /const filteredStaff = useMemo/);
  assert.match(source, /member\.displayName, member\.email, member\.role, member\.department, member\.specialization, member\.emirate/);
  assert.match(source, /<StaffRegistryTable staff=\{filteredStaff\}/);
  assert.match(source, /No staff matched this filter/);
  assert.match(source, /filteredStaff\.length} PERSONNEL/);
});
