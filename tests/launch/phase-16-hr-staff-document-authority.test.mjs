import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Phase 16 attendance, overtime and payslip PDFs are server-authoritative immutable artifacts', async () => {
  const source = await read('functions/staffPdfReporting.ts');
  for (const token of ['generateStaffAttendancePdf','staff_shifts','generateStaffOvertimePdf','staff_request_trackers','generateStaffPayslipPdf','payroll_entries','createHash("sha256").update(args.buffer)','storageGeneration','SERVER_STAFF_PDF_REPORTING','batch.create(reportRef','HR_DOCUMENT_ISSUED']) assert.ok(source.includes(token), 'Missing ' + token);
});

test('Phase 16 official salary/NOC/experience/other HR letters are issued only by server HR authority', async () => {
  const [source, rules] = await Promise.all([read('functions/staffPdfReporting.ts'), read('firestore.rules')]);
  for (const token of ['issueOfficialStaffHrDocument','SALARY_CERTIFICATE','NOC_LETTER','EXPERIENCE_LETTER','OTHER_HR_LETTER','canIssueOfficialHrDocument','HR Manager authority is required','staffLetters']) assert.ok(source.includes(token), 'Official HR issuance missing ' + token);
  assert.match(rules, /match \/staffLetters\/\{letterId\}[\s\S]*?allow create, update, delete: if false;/);
});

test('Phase 16 salary certificate fails closed without canonical salary data', async () => {
  const source = await read('functions/staffPdfReporting.ts');
  assert.ok(source.includes('db.collection("payroll_entries")'));
  assert.ok(source.includes('identity.salaryPackage'));
  assert.ok(source.includes('Canonical salary data is missing; salary certificate issuance is blocked.'));
  assert.ok(source.includes('payroll_entries/${latestPayroll.id}'));
});

test('Phase 16 NOC and experience issuance validate authoritative prerequisites', async () => {
  const source = await read('functions/staffPdfReporting.ts');
  assert.ok(source.includes('NOC purpose is required.'));
  assert.ok(source.includes('Joining date is required before issuing an experience letter.'));
  assert.ok(source.includes('OTHER_HR_LETTER'));
  assert.ok(source.includes('Official HR letter subject and body are required.'));
});

test('Phase 16 every issued HR artifact binds SHA-256, Storage path/generation and immutable audit trail', async () => {
  const source = await read('functions/staffPdfReporting.ts');
  for (const token of ['sha256Hash: hash','storagePath','storageGeneration: generation','canonicalSource: "SERVER_STAFF_PDF_REPORTING"','audit_logs','immutable: true','sourceRecordIds']) assert.ok(source.includes(token), 'Immutable issuance identity missing ' + token);
});

test('Phase 16 payroll settlement persists the canonical payslip artifact identity', async () => {
  const [automation, pdf] = await Promise.all([read('functions/hrAutomation.ts'), read('functions/pdfEngine.ts')]);
  for (const token of ['generatePayslipPdfArtifact','payslipPdfSha256','payslipStoragePath','payslipStorageGeneration','payslipCanonicalSource: "SERVER_PDF_ENGINE"']) assert.ok(automation.includes(token), 'Payroll settlement missing ' + token);
  assert.ok(pdf.includes('export async function generatePayslipPdfArtifact'));
  assert.ok(pdf.includes('Promise<CanonicalPdfArtifact>'));
});

test('Phase 16 generated staff PDF Storage remains browser immutable and staff-readable', async () => {
  const rules = await read('storage.rules');
  assert.match(rules, /match \/staff-reports\/\{staffId\}\/\{allPaths=\*\*\}/);
  assert.match(rules, /request\.auth\.uid == staffId/);
  assert.match(rules, /allow write: if false;/);
});

test('Phase 16 public verifier exposes integrity metadata without salary/private HR data', async () => {
  const source = await read('functions/staffPdfReporting.ts');
  const start = source.indexOf('export const verifyReportPdfHash');
  const verifier = source.slice(start);
  assert.ok(verifier.includes('sha256Hash'));
  assert.ok(verifier.includes('verified'));
  assert.ok(!verifier.includes('baseSalary'));
  assert.ok(!verifier.includes('salaryPackage'));
  assert.ok(!verifier.includes('storagePath'));
});