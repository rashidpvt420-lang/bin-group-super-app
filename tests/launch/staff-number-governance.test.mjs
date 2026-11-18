import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relPath) => readFileSync(relPath, 'utf8');

test('staff number governance: server-only transaction, 5-digit sequence starting at 10001, protected backfill, UI and rules', () => {
  // 1. Backend functions: adminUserProvisioning.ts
  const provisioningSrc = read('functions/adminUserProvisioning.ts');

  assert.match(provisioningSrc, /const STAFF_NUMBER_START\s*=\s*10001;/, 'STAFF_NUMBER_START must be 10001');
  assert.match(provisioningSrc, /const STAFF_NUMBER_COUNTER_DOC\s*=\s*['"]staff_number['"];/, 'STAFF_NUMBER_COUNTER_DOC must be "staff_number"');
  assert.match(provisioningSrc, /export async function resolveStaffUid\(/, 'resolveStaffUid helper must be exported');
  assert.match(provisioningSrc, /db\.collection\(["']system_counters["']\)\.doc\(STAFF_NUMBER_COUNTER_DOC\)/, 'Counter doc path must be system_counters/staff_number');
  assert.match(provisioningSrc, /db\.runTransaction\(async\s*\(tx\)\s*=>/, 'adminCreateUser must use Firestore transaction for counter and creation');
  assert.match(provisioningSrc, /export const adminBackfillStaffNumbers\s*=\s*onCall\(/, 'adminBackfillStaffNumbers must be an onCall callable');
  assert.match(provisioningSrc, /requireProvisioningAdmin\(request\)/, 'adminBackfillStaffNumbers must be gated by requireProvisioningAdmin');
  assert.match(provisioningSrc, /targetStaffNumber/, 'adminRequestFinanceRoleAssignment must record targetStaffNumber');

  // 2. Employee Identity & ID Card PDF
  const policySrc = read('functions/employeeCredentialPolicy.ts');
  assert.match(policySrc, /staffNumber\?:\s*string;/, 'EmployeeIdentity must declare staffNumber');
  assert.match(policySrc, /const staffNumber\s*=\s*text\(user\.staffNumber/, 'employeeIdentityFrom must map staffNumber');

  const credentialsSrc = read('functions/employeeCredentials.ts');
  assert.match(credentialsSrc, /identity\.staffNumber/, 'renderEmployeeCardPdf must render identity.staffNumber on card front');
  assert.match(credentialsSrc, /staffNumber:\s*data\.staffNumber/, 'adminListEmployeeCredentials must return staffNumber');

  // 3. UI: FinanceGrantsPage.tsx
  const grantsPageSrc = read('apps/admin-panel/src/pages/financials/FinanceGrantsPage.tsx');
  assert.match(grantsPageSrc, /Staff number or UID/, 'Finance grants input must be labeled "Staff number or UID"');
  assert.match(grantsPageSrc, /الرقم الوظيفي أو معرّف الموظف/, 'Finance grants input must include Arabic label');
  assert.match(grantsPageSrc, /assignUid\.trim\(\)\.length\s*<\s*5/, 'Finance grants input must allow 5-digit staff numbers');
  assert.match(grantsPageSrc, /targetStaffNumber/, 'Finance grants pending table must display targetStaffNumber');
  assert.match(grantsPageSrc, /account\.staffNumber/, 'Finance grants accounts table must display account.staffNumber');

  // 4. UI: StaffAccessPage.tsx
  const staffAccessSrc = read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');
  assert.match(staffAccessSrc, /STAFF #/, 'Staff access table must include "STAFF #" column header');
  assert.match(staffAccessSrc, /member\.staffNumber/, 'Staff access table must display member.staffNumber');

  // 5. UI: EmployeeCredentialsPanel.tsx
  const credsPanelSrc = read('apps/admin-panel/src/pages/admin/EmployeeCredentialsPanel.tsx');
  assert.match(credsPanelSrc, /row\.staffNumber/, 'Employee credentials panel must display row.staffNumber');

  // 6. Firestore Rules: firestore.rules
  const rulesSrc = read('firestore.rules');
  assert.match(rulesSrc, /match\s*\/system_counters\/\{counterDoc\}\s*\{\s*allow read,\s*write:\s*if false;/, 'system_counters collection must deny client read and write');
  assert.match(rulesSrc, /!\('staffNumber' in request\.resource\.data\)/, 'users create rule must deny client-provided staffNumber');
  assert.match(rulesSrc, /!\('staffNumberStr' in request\.resource\.data\)/, 'users create rule must deny client-provided staffNumberStr');
  assert.match(rulesSrc, /!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\['staffNumber',\s*'staffNumberStr'\]\)/, 'users update rule must deny modifying staffNumber or staffNumberStr');
});
