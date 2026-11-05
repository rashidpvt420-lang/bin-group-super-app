import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reporting = readFileSync('functions/staffPdfReporting.ts', 'utf8');
const automation = readFileSync('functions/hrAutomation.ts', 'utf8');
const vault = readFileSync('functions/unifiedDocumentVault.ts', 'utf8');
const page = readFileSync('src/technician/pages/TechnicianHRPageV2.tsx', 'utf8');
const panel = readFileSync('src/technician/components/MyPayslipsPanel.tsx', 'utf8');

test('technician can list and download only their own official payslips', () => {
  const list = reporting.slice(reporting.indexOf('export const listMyPayslips'), reporting.indexOf('export const openMyPayslip'));
  const open = reporting.slice(reporting.indexOf('export const openMyPayslip'), reporting.indexOf('export const verifyReportPdfHash'));
  assert.match(reporting, /enforceAppCheck: true/);
  assert.match(list, /SECURE_CALLABLE_OPTIONS/);
  assert.match(list, /where\("staffUid", "==", uid\)/);
  assert.match(list, /STAFF_DIGITAL_PAYSLIP/);
  assert.doesNotMatch(list, /request\.data\?\.(uid|staffUid|staffId)/);
  assert.match(open, /You can download only your own payslip/);
  assert.match(open, /staff-reports\/\$\{uid\}\//);
  assert.match(open, /STAFF_PAYSLIP_DOWNLOADED/);
  assert.match(vault, /\["staffUid", actor\.uid\]/);
  assert.match(panel, /httpsCallable\(functions, 'listMyPayslips'\)/);
  assert.match(panel, /httpsCallable\(functions, 'openMyPayslip'\)/);
  assert.match(page, /<MyPayslipsPanel \/>/);
});

test('HR chat does not create a zero-hour payable overtime claim', () => {
  const create = automation.slice(automation.indexOf('export const createStaffHrCase'), automation.indexOf('function attachHrAuditToBatch'));
  assert.match(create, /requestType === "overtime"/);
  assert.match(create, /does not create a payable overtime claim/);
  assert.match(create, /no hours were saved/);
  assert.doesNotMatch(create, /hours:\s*0/);
  assert.match(page, /data-testid="overtime-chat-not-payable"/);
  assert.doesNotMatch(page, /I worked overtime yesterday/);
  assert.doesNotMatch(page, /hours:\s*0/);
});
