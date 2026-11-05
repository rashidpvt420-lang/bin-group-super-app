import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const L = await loadTsModules('functions/hrLeaveEngine.ts');
const uid = 'tech1';
const today = '2026-11-04';
const cert = `staffDocuments/${uid}/medical_certificate/1-note.pdf`;

test('valid annual leave form: server computes the day count', () => {
  const r = L.validateLeaveForm({ leaveType: 'annual_leave', startDate: '2026-11-10', endDate: '2026-11-14', leaveDays: 1 }, uid, today);
  assert.equal(r.ok, true);
  assert.equal(r.leaveDays, 5); // client value 1 ignored
  assert.equal(r.certificatePath, null);
});

test('sick leave needs a certificate from the caller\'s own folder', () => {
  assert.equal(L.validateLeaveForm({ leaveType: 'sick_leave', startDate: today, endDate: today }, uid, today).ok, false);
  assert.equal(L.validateLeaveForm({ leaveType: 'sick_leave', startDate: today, endDate: today, certificatePath: 'staffDocuments/other/medical_certificate/x.pdf' }, uid, today).ok, false);
  assert.equal(L.validateLeaveForm({ leaveType: 'sick_leave', startDate: today, endDate: today, certificatePath: `staffDocuments/${uid}/medical_certificate/../x` }, uid, today).ok, false);
  const ok = L.validateLeaveForm({ leaveType: 'sick_leave', startDate: today, endDate: '2026-11-05', certificatePath: cert }, uid, today);
  assert.equal(ok.ok, true);
  assert.equal(ok.leaveDays, 2);
});

test('rejects bad type, reversed dates, too long, too old', () => {
  assert.equal(L.validateLeaveForm({ leaveType: 'holiday', startDate: today, endDate: today }, uid, today).ok, false);
  assert.equal(L.validateLeaveForm({ leaveType: 'annual_leave', startDate: '2026-11-10', endDate: '2026-11-09' }, uid, today).ok, false);
  assert.equal(L.validateLeaveForm({ leaveType: 'annual_leave', startDate: '2026-11-10', endDate: '2027-03-10' }, uid, today).ok, false);
  assert.equal(L.validateLeaveForm({ leaveType: 'annual_leave', startDate: '2026-08-01', endDate: '2026-08-02' }, uid, today).ok, false);
  assert.equal(L.validateLeaveForm(null, uid, today).ok, false);
});

test('callable stores validated dates and day count instead of today/today', () => {
  const fn = readFileSync('functions/hrAutomation.ts', 'utf8');
  assert.match(fn, /validateLeaveForm\(request\.data\.leave, uid, dubaiDateOf\(Date\.now\(\)\)\)/);
  assert.match(fn, /leaveDays: leaveForm\.leaveDays/);
  assert.match(fn, /startDate: leaveForm \? leaveForm\.startDate/);
});

test('HR page has the leave form with dates, day count and certificate, and keeps the free-text box', () => {
  const page = readFileSync('src/technician/pages/TechnicianHRPageV2.tsx', 'utf8');
  assert.match(page, /data-testid="leave-request-form"/);
  // Labels are translated through the HR string helper (PR HR H), so accept the plain or ht('...') form.
  assert.match(page, /type="date" label=(?:"Start date"|\{ht\('Start date'\)\})/);
  assert.match(page, /type="date" label=(?:"End date"|\{ht\('End date'\)\})/);
  assert.match(page, /data-testid="leave-day-count"/);
  assert.match(page, /medical_certificate\/\$\{Date\.now\(\)\}/);
  assert.match(page, /CREATE AI HR CASE/);
});
