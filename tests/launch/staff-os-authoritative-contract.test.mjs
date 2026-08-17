import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

test('staff OS launch contract: sensitive callables require App Check and server-side authority', () => {
  const source = read('functions/staffOperatingSystem.ts');
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /assertActiveAccount/);
  assert.match(source, /assignedTechnicianUid/);
  assert.match(source, /Work-order assignment changed before completion/);
  assert.match(source, /The overtime work order is not assigned to this staff member/);
  assert.match(source, /Only the assigned driver or authorized Fleet\/Operations manager/);
  assert.doesNotMatch(source, /VEHICLE-1|JOB-1/);
  assert.doesNotMatch(source, /jobsCompletedCount\s*\|\|\s*1|photosUploadedCount\s*\|\|\s*2|overtimeMinutes\s*\|\|\s*95/);
});

test('staff OS launch contract: inventory never invents stock or trusts client cost', () => {
  const source = read('functions/staffInventoryEngine.ts');
  assert.match(source, /confirmationId/);
  assert.match(source, /staff_inventory_confirmations/);
  assert.match(source, /Stock records may not be invented during consumption/);
  assert.match(source, /server-side unit cost/);
  assert.doesNotMatch(source, /\|\|\s*50/);
  assert.doesNotMatch(source, /10\s*-\s*qty/);
});

test('staff OS launch contract: generated PDFs use real records and PDF bytes', () => {
  const source = read('functions/staffPdfReporting.ts');
  assert.match(source, /PDFDocument/);
  assert.match(source, /getStorage/);
  assert.match(source, /staff_shifts/);
  assert.match(source, /staff_request_trackers/);
  assert.match(source, /payroll_entries/);
  assert.doesNotMatch(source, /totalShiftsCompleted:\s*22|totalHoursWorked:\s*176|6,500|8,855/);
});

test('staff OS launch contract: exception UI is server scoped and runtime demos are absent', () => {
  const exceptionUi = read('apps/admin-panel/src/pages/ops/StaffExceptionsManagerPage.tsx');
  const runtimeUi = [
    read('src/components/staff/StaffTodayDashboard.tsx'),
    read('src/components/staff/ContextQuickActionsFab.tsx'),
    read('src/components/staff/StaffVoicePaperworkDialog.tsx'),
    read('src/components/staff/FinishShiftChecklistModal.tsx'),
  ].join('\n');

  assert.match(exceptionUi, /getStaffExceptionsQueue/);
  assert.doesNotMatch(exceptionUi, /collection\(db,\s*["']staff_exceptions["']\)/);
  assert.doesNotMatch(`${exceptionUi}\n${runtimeUi}`, /Ahmed Al-Mansoori|Khalid Omer|Fatima Al-Nuaimi|Saeed Rashidi|Hilux 18|Villa 104|JOB-184|REG-UAE|Dubai GPS/);
});

test('staff OS launch contract: rules generators preserve server-only writes and private staff reports', () => {
  const firestoreHardener = read('scripts/harden-owner-trust-rules.mjs');
  const storageHardener = read('scripts/harden-private-hr-storage.mjs');
  assert.match(firestoreHardener, /match \/staff_shifts\/\{shiftId\}/);
  assert.match(firestoreHardener, /match \/staff_inventory_confirmations\/\{confirmationId\}/);
  assert.match(firestoreHardener, /match \/job_costs\/\{costId\}/);
  assert.match(firestoreHardener, /match \/pdf_reports\/\{reportId\}/);
  assert.match(firestoreHardener, /allow create, update, delete: if false/);
  assert.match(storageHardener, /match \/staff-reports\/\{staffId\}\/\{allPaths=\*\*\}/);
  assert.match(storageHardener, /collection != 'staff-reports'/);
});
