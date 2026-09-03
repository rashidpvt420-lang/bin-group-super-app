import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Super Admin and authoritative Admin claims can access HR manager controls', async () => {
  const [source, lifecycle] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('functions/adminStaffLifecycle.ts'),
  ]);

  assert.match(source, /privilegedHRRoles = new Set\(\['super_admin', 'admin', 'ceo', 'hr_admin', 'hr_manager'\]\)/);
  assert.match(source, /user\?\.claims\?\.admin === true/);
  assert.match(source, /user\?\.isAdmin === true/);
  assert.match(source, /privilegedHRRoles\.has\(String\(user\?\.role\)\)/);
  assert.match(source, /httpsCallable\(functions, 'adminGetStaffLifecycle'\)/);
  assert.doesNotMatch(source, /where\('role', 'in', \['technician', 'hr_staff', 'hr_manager', 'hr_admin'\]\)/);
  assert.match(lifecycle, /enforceAppCheck:\s*true/);
});

test('HR registry filtering and empty state remain wired to protected lifecycle rows', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');

  assert.match(source, /const filteredStaff = useMemo\(\(\) => staff\.filter/);
  assert.match(source, /member\.displayName, member\.email, member\.role, member\.specialization, member\.department, member\.lifecycleState/);
  assert.match(source, /filteredStaff\.map/);
  assert.match(source, /No staff matched this filter/);
  assert.match(source, /filteredStaff\.length} OF \${staff\.length} STAFF/);
});
