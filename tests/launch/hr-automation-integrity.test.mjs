import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('HR automation mirrors audit events atomically under one document id', async () => {
  const source = await read('functions/hrAutomation.ts');

  assert.match(source, /function hrAuditPayload/);
  assert.match(source, /const auditRef = db\.collection\(["']audit_logs["']\)\.doc\(\);/);
  assert.match(source, /batch\.set\(auditRef, payload\);/);
  assert.match(source, /batch\.set\(db\.collection\(["']auditLogs["']\)\.doc\(auditRef\.id\), payload\);/);
  assert.match(source, /await batch\.commit\(\);/);
  assert.doesNotMatch(source, /Promise\.allSettled\(\[\s*db\.collection\(["']auditLogs["']\)\.add/);

  assert.match(source, /const auditId = `payroll_settlement_\$\{payrollId\}`;/);
  assert.match(source, /const auditCompatRef = db\.collection\(["']audit_logs["']\)\.doc\(auditId\);/);
  assert.match(source, /transaction\.set\(auditRef, auditPayload\);\s*transaction\.set\(auditCompatRef, auditPayload\);/s);
});

test('HR payroll writes the technician-readable payroll_entries projection', async () => {
  const [source, dashboard, rules] = await Promise.all([
    read('functions/hrAutomation.ts'),
    read('src/technician/pages/TechnicianDashboardPage.tsx'),
    read('firestore.rules'),
  ]);

  assert.match(dashboard, /collection\(db,\s*['"]payroll_entries['"]\)/);
  assert.match(dashboard, /where\(['"]technicianId['"],\s*['"]==['"],\s*user\.uid\)/);
  assert.match(rules, /match \/payroll_entries\/\{entryId\} \{/);
  assert.match(rules, /allow read: if isAdmin\(\) \|\| isTechnicianId\(resource\.data\.get\(['"]technicianId['"],\s*null\)\)/);
  assert.match(source, /function payrollEntryProjection/);
  assert.match(source, /batch\.create\(db\.collection\(["']payroll_entries["']\)\.doc\(payrollId\)/);
  assert.match(source, /transaction\.set\(db\.collection\(["']payroll_entries["']\)\.doc\(payrollId\)/);
  assert.match(source, /technicianId: input\.techId/);
});

test('HR self-service new-hire provisioning is Technician-only and blocks privileged roles', async () => {
  const [source, staffAccess] = await Promise.all([
    read('functions/hrAutomation.ts'),
    read('functions/adminUserProvisioning.ts'),
  ]);

  assert.match(source, /const TECHNICIAN_NEW_HIRE_ROLE = ["']technician["'];/);
  assert.match(source, /requestedRole !== TECHNICIAN_NEW_HIRE_ROLE/);
  assert.match(source, /provisioningStatus: ["']blocked_invalid_role["']/);
  assert.match(source, /provisioningBlocker: ["']technician_self_service_only["']/);
  assert.match(source, /non_technician_role_requires_protected_staff_access/);
  assert.match(source, /const role = TECHNICIAN_NEW_HIRE_ROLE;/);
  assert.match(source, /staffRole: TECHNICIAN_NEW_HIRE_ROLE/);
  assert.doesNotMatch(source, /const role = normalizeRole\(data\.role \|\| data\.staffRole \|\| data\.position/);

  assert.match(staffAccess, /const STAFF_ROLES = new Set\(/);
  assert.match(staffAccess, /function canonicalAccess/);
  assert.match(staffAccess, /permissions are server-derived from the selected modules/);
  assert.match(staffAccess, /Only an authorized Founder or Admin can manage staff access/);
});

test('blocked role provisioning records the blocker and audit in one batch', async () => {
  const source = await read('functions/hrAutomation.ts');
  const start = source.indexOf('async function blockInvalidNewHireRole');
  const end = source.indexOf('async function provisionApprovedNewHire', start);
  assert.ok(start >= 0 && end > start, 'blocked-role handler must exist before provisioning');
  const block = source.slice(start, end);

  assert.match(block, /const batch = db\.batch\(\);/);
  assert.match(block, /batch\.update\(requestRef/);
  assert.match(block, /attachHrAuditToBatch\(batch, ["']HR_NEW_HIRE_PROVISION_BLOCKED["']/);
  assert.match(block, /await batch\.commit\(\);/);
});
