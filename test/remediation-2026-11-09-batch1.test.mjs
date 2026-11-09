// Batch 1 of the 9 Nov 2026 audit remediation (P1-1, P1-2 UI, P1-7, P1-8 UI).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const rules = await loadTsModules('src/components/onboarding/ownerLocationRules.ts');
const EMIRATES = [{ lat: 25.2048, lng: 55.2708 }, { lat: 24.4539, lng: 54.3773 }];
const read = (path) => readFileSync(path, 'utf8');

test('P1-1: a property counts as pinned only with its own valid, non-centroid coordinates', () => {
  assert.equal(rules.propertyHasPin({ geo: { lat: 25.1, lng: 55.2 } }, EMIRATES), true);
  assert.equal(rules.propertyHasPin({ geo: { lat: '25.1', lng: '55.2' } }, EMIRATES), true);
  assert.equal(rules.propertyHasPin({ geo: { lat: 25.2048, lng: 55.2708 } }, EMIRATES), false, 'emirate centroid is not a pin');
  assert.equal(rules.propertyHasPin({ geo: { lat: '', lng: '' } }, EMIRATES), false);
  assert.equal(rules.propertyHasPin({ geo: { lat: 0, lng: 0 } }, EMIRATES), false);
  assert.equal(rules.propertyHasPin({}, EMIRATES), false);
  assert.equal(rules.propertyHasPin(null, EMIRATES), false);
});

test('P1-1: the first unpinned property is found so Continue can send the owner to it', () => {
  const pinned = { geo: { lat: 25.1, lng: 55.2 } };
  assert.equal(rules.firstPropertyMissingPin([pinned, pinned], EMIRATES), -1);
  assert.equal(rules.firstPropertyMissingPin([pinned, {}], EMIRATES), 1);
  assert.equal(rules.firstPropertyMissingPin([{}, pinned], EMIRATES), 0);
  assert.equal(rules.firstPropertyMissingPin([], EMIRATES), -1);
});

test('P1-1: the location step edits the selected property, never a hard-coded first property', () => {
  const src = read('src/components/onboarding/PropertyLocationStep.tsx');
  assert.doesNotMatch(src, /properties\[0\]/);
  assert.doesNotMatch(src, /updateProperty\(0\s*,/);
  assert.match(src, /const activeProperty = properties\[propertyIndex\]/);
  assert.match(src, /<PropertyLocationEditor key=\{safeIndex\} propertyIndex=\{safeIndex\}/);
  assert.match(src, /firstPropertyMissingPin\(latest, EMIRATES_LIST\)/);
  assert.match(src, /data-testid=\{`property-location-chip-\$\{index\}`\}/);
  const review = read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(review, /Property GPS is missing for property \$\{which\}/);
});

test('P1-7: HR example prompts only fill the message box and never call createStaffHrCase', () => {
  const src = read('src/technician/pages/TechnicianHRPageV2.tsx');
  assert.doesNotMatch(src, /Quick Training Tests/);
  assert.doesNotMatch(src, /quickPrompts/);
  assert.match(src, /examplePrompts\.map\(\(prompt\) => <Chip [^>]*onClick=\{\(\) => setMessage\(prompt\)\}/);
  assert.doesNotMatch(src, /examplePrompts\.map\([^\n]*createAiCase/);
  assert.doesNotMatch(src, /unsafe electric shock accident risk/);
});

test('P1-2: the admin payroll preview comes from the server and the page reads no salary field', () => {
  const page = read('apps/admin-panel/src/pages/financials/PayrollManagementPage.tsx');
  assert.doesNotMatch(page, /baseSalary/);
  assert.doesNotMatch(page, /where\('role', '==', 'technician'\)/);
  assert.match(page, /previewPayroll\(\{ month: currentMonth, preview: true/);
  const fn = read('functions/hrAutomation.ts');
  assert.match(fn, /\.where\("role", "in", \[\.\.\.PAYROLL_ELIGIBLE_ROLES\]\)/);
  assert.match(fn, /db\.collection\("private_hr_profiles"\)\.doc\(doc\.id\)/);
  assert.doesNotMatch(fn, /where\("role", "==", "technician"\)\s*\n\s*\.orderBy\(admin\.firestore\.FieldPath\.documentId\(\)\)\s*\n\s*\.limit\(200\)/);
});

test('P1-8: finance_manager and finance_controller are provisionable everywhere with no modules', () => {
  for (const path of ['functions/adminUserProvisioning.ts', 'functions/adminStaffLifecycle.ts']) {
    const src = read(path);
    assert.match(src, /"finance_manager"/, `${path} finance_manager`);
    assert.match(src, /"finance_controller"/, `${path} finance_controller`);
  }
  const prov = read('functions/adminUserProvisioning.ts');
  assert.match(prov, /finance_manager: \[\],\n  finance_controller: \[\],\n\};\n\nconst ROLE_DEFAULT_MODULES/);
  for (const path of ['apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'apps/admin-panel/src/security/staffAccessPolicy.ts']) {
    const src = read(path);
    assert.match(src, /value: 'finance_manager', label: 'Finance Manager'/);
    assert.match(src, /value: 'finance_controller', label: 'Finance Controller'/);
  }
  // Admin claims still never grant painting payment authority, and MFA stays mandatory.
  const approver = read('functions/paintingFinanceApprover.ts');
  assert.match(approver, /new Set\(\["finance_manager", "finance_controller"\]\)/);
  assert.match(approver, /sign_in_second_factor/);
});
