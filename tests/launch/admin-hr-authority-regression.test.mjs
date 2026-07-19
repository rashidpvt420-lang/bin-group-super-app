import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Super Admin and authoritative Admin claims can access HR manager controls', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');

  assert.match(source, /privilegedHRRoles = new Set\(\['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager'\]\)/);
  assert.match(source, /user\?\.claims\?\.admin === true/);
  assert.match(source, /user\?\.isAdmin === true/);
  assert.match(source, /privilegedHRRoles\.has\(String\(user\?\.role\)\)/);
  assert.match(source, /where\('role', 'in', \['technician', 'hr_staff', 'hr_manager', 'hr_admin'\]\)/);
});

test('HR registry filtering and empty state remain wired', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');

  assert.match(source, /const filteredStaff = staff\.filter/);
  assert.match(source, /member\.displayName, member\.email, member\.role, member\.specialization, member\.emirate/);
  assert.match(source, /filteredStaff\.map/);
  assert.match(source, /No HR personnel matched this filter/);
  assert.match(source, /filteredStaff\.length.*TOTAL PERSONNEL/);
});
