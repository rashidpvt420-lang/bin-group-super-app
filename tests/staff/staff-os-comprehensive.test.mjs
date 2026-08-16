import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const staffBackend = () => read('functions/staffOperatingSystem.ts');
const inventoryBackend = () => read('functions/staffInventoryEngine.ts');
const pdfBackend = () => read('functions/staffPdfReporting.ts');
const todayUi = () => read('src/components/staff/StaffTodayDashboard.tsx');
const quickUi = () => read('src/components/staff/ContextQuickActionsFab.tsx');
const voiceUi = () => read('src/components/staff/StaffVoicePaperworkDialog.tsx');
const finishUi = () => read('src/components/staff/FinishShiftChecklistModal.tsx');
const exceptionsUi = () => read('apps/admin-panel/src/pages/ops/StaffExceptionsManagerPage.tsx');

test('Staff callables require App Check and do not contain invented authoritative IDs', () => {
  const source = staffBackend();
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /assertActiveAccount/);
  assert.doesNotMatch(source, /VEHICLE-1|JOB-1/);
  assert.doesNotMatch(source, /estimatedMinutes\s*\|\|\s*90/);
  assert.doesNotMatch(source, /overtimeMinutes\s*\|\|\s*95/);
});

test('Job completion is preview-first, assignment-bound, state-validated and evidence-gated', () => {
  const source = staffBackend();
  assert.match(source, /confirmCompletion\s*=\s*data\.confirmCompletion\s*===\s*true/);
  assert.match(source, /if\s*\(!confirmCompletion\)/);
  assert.match(source, /assignedTechnicianUid/);
  assert.match(source, /\["ARRIVED",\s*"IN_PROGRESS"\]/);
  assert.match(source, /hasCompletionPhotoEvidence/);
  assert.match(source, /Work-order assignment changed before completion/);
  assert.match(source, /STAFF_JOB_COMPLETED/);
  assert.doesNotMatch(source, /materialsDeducted:\s*proposedMaterials/);
});

test('Overtime and shift finish use server-side shift/job evidence instead of fabricated defaults', () => {
  const source = staffBackend();
  assert.match(source, /Overtime can be requested only from an active shift/);
  assert.match(source, /The overtime work order is not assigned to this staff member/);
  assert.match(source, /An active overtime request is already pending review/);
  assert.match(source, /Cannot finish shift with .*active work order/);
  assert.match(source, /verificationSource:\s*"SERVER"/);
  assert.match(source, /NOT_ASSERTED_BY_SHIFT_WORKFLOW/);
  assert.doesNotMatch(source, /jobsCompletedCount\s*\|\|\s*1/);
  assert.doesNotMatch(source, /photosUploadedCount\s*\|\|\s*2/);
  assert.doesNotMatch(source, /RETURNED_CLEAN/);
  assert.doesNotMatch(source, /ALL_ACCOUNTED_FOR/);
});

test('Inventory confirmation is idempotent and uses existing server stock/cost only', () => {
  const source = inventoryBackend();
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /confirmationId/);
  assert.match(source, /staff_inventory_confirmations/);
  assert.match(source, /Stock records may not be invented during consumption/);
  assert.match(source, /server-side unit cost/);
  assert.match(source, /replayed/);
  assert.doesNotMatch(source, /10\s*-\s*qty/);
  assert.doesNotMatch(source, /\|\|\s*50/);
  assert.doesNotMatch(source, /text\(item\.name\).*SKU/);
});

test('Staff report functions create real PDF bytes from Firestore records with private Storage metadata', () => {
  const source = pdfBackend();
  assert.match(source, /PDFDocument/);
  assert.match(source, /getStorage/);
  assert.match(source, /staff_shifts/);
  assert.match(source, /staff_request_trackers/);
  assert.match(source, /payroll_entries/);
  assert.match(source, /createHash\("sha256"\)\.update\(args\.buffer\)/);
  assert.match(source, /staff-reports\/\$\{args\.staffUid\}/);
  assert.doesNotMatch(source, /totalShiftsCompleted:\s*22/);
  assert.doesNotMatch(source, /totalHoursWorked:\s*176/);
  assert.doesNotMatch(source, /570/);
  assert.doesNotMatch(source, /6,500|8,855|1,500/);
});

test('Public PDF verifier returns minimal issuance metadata and not payroll/private storage data', () => {
  const source = pdfBackend();
  const verifierStart = source.indexOf('export const verifyReportPdfHash');
  assert.ok(verifierStart >= 0, 'verifyReportPdfHash must exist');
  const verifier = source.slice(verifierStart);
  assert.match(verifier, /verified/);
  assert.match(verifier, /reportType/);
  assert.match(verifier, /generatedAt/);
  assert.doesNotMatch(verifier, /netSalary/);
  assert.doesNotMatch(verifier, /baseSalary/);
  assert.doesNotMatch(verifier, /storagePath/);
  assert.doesNotMatch(verifier, /signedUrl/);
});

test('Admin exception UI consumes server-scoped queue and requires a human decision reason', () => {
  const source = exceptionsUi();
  assert.match(source, /getStaffExceptionsQueue/);
  assert.match(source, /resolveStaffException/);
  assert.match(source, /Run Rules Review/);
  assert.match(source, /Decision reason/);
  assert.doesNotMatch(source, /collection\(db,\s*["']staff_exceptions["']\)/);
  assert.doesNotMatch(source, /Ahmed Al-Mansoori|Khalid Omer|Fatima Al-Nuaimi|Saeed Rashidi|Villa 104|Hilux 18/);
});

test('TODAY, Quick Actions, voice report and shift finish contain no simulated operational evidence', () => {
  const combined = [todayUi(), quickUi(), voiceUi(), finishUi()].join('\n');
  assert.doesNotMatch(combined, /Hilux 18|Villa 104|JOB-184|Dubai GPS|REG-UAE/);
  assert.doesNotMatch(combined, /Fuel 82%|1h 35m|2 Photos verified|compressor was damaged/i);
  assert.doesNotMatch(voiceUi(), /setTimeout\(/);
  assert.doesNotMatch(finishUi(), /useState\(\{\s*jobsUpdated:\s*true/);
  assert.match(todayUi(), /submitStaffQuickAction/);
  assert.match(todayUi(), /requestStaffOvertime/);
  assert.match(voiceUi(), /completeStaffJobWithAi/);
  assert.match(finishUi(), /triggerStaffShiftFinish/);
});

test('Generated rules hardening keeps authoritative Staff OS writes server-only and protects report storage', () => {
  const firestoreHardener = read('scripts/harden-owner-trust-rules.mjs');
  const storageHardener = read('scripts/harden-private-hr-storage.mjs');

  assert.match(firestoreHardener, /match \/staff_shifts\/\{shiftId\}/);
  assert.match(firestoreHardener, /match \/staff_inventory_confirmations\/\{confirmationId\}/);
  assert.match(firestoreHardener, /match \/job_costs\/\{costId\}/);
  assert.match(firestoreHardener, /match \/pdf_reports\/\{reportId\}/);
  assert.match(firestoreHardener, /allow create, update, delete: if false/);

  assert.match(storageHardener, /match \/staff-reports\/\{staffId\}\/\{allPaths=\*\*\}/);
  assert.match(storageHardener, /collection != 'staff-reports'/);
  assert.match(storageHardener, /allow write: if false/);
});
