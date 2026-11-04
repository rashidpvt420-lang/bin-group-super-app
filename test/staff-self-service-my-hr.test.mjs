import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('apps/admin-panel/src/pages/admin/MyHrSelfServicePage.tsx', 'utf8');
const policy = readFileSync('apps/admin-panel/src/security/staffAccessPolicy.ts', 'utf8');
const app = readFileSync('apps/admin-panel/src/App.tsx', 'utf8');
const nav = readFileSync('apps/admin-panel/src/components/Navigation.tsx', 'utf8');

test('My HR reads only own payslips, documents and requests by uid', () => {
  for (const c of ['staffPayslips', 'staffDocuments', 'staffRequests']) assert.match(page, new RegExp(`'${c}'`));
  assert.match(page, /where\('uid', '==', uid\)/);
  assert.doesNotMatch(page, /\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch)\b/, 'no client writes');
  assert.match(page, /httpsCallable\(functions, 'createStaffHrCase'\)/);
});

test('/my-hr is open to every non-suspended employee, routed and linked', () => {
  assert.match(policy, /MY_HR_PATH = '\/my-hr'/);
  assert.match(policy, /normalizedPath === MY_HR_PATH\) \{\s*return !user\?\.claims\?\.suspended && \(STAFF_PORTAL_ROLES\.has\(role\) \|\| PAINTING_FINANCE_ROLES\.has\(role\)\)/);
  assert.match(app, /path="\/my-hr" element={<ProtectedRoute><MyHrSelfServicePage \/>/);
  assert.match(nav, /path: '\/my-hr'/);
  assert.match(nav, /path: '\/hr\/payroll-prep'/);
});
