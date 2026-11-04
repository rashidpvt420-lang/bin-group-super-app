import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fn = readFileSync('functions/hrAutomation.ts', 'utf8');
const callable = fn.slice(fn.indexOf('export const getMyHours'), fn.indexOf('export const onStaffRequestReviewed'));

test('getMyHours is App Check enforced, staff-only and reads only the caller\'s own records', () => {
  assert.match(callable, /enforceAppCheck: true/);
  assert.match(callable, /assertStaffActor\(request\.auth\)/);
  assert.match(callable, /SHIFT_\$\{uid\}_\$\{d\}/);
  assert.match(callable, /where\("staffId", "==", uid\)/);
  assert.doesNotMatch(callable, /request\.data\?\.(uid|staffId)/);
  assert.doesNotMatch(callable, /\.set\(|\.update\(|\.create\(/);
});

test('getMyHours uses the server hours engine and only counts approved overtime as payable', () => {
  assert.match(callable, /computeShiftHours\(/);
  assert.match(callable, /payableDays\(engineDays, approvedByDate\)/);
  assert.match(callable, /\["APPROVED", "PAYROLL_INCLUDED", "PAID"\]/);
  assert.match(callable, /missedClockOut/);
  assert.match(callable, /proof: t\.proof/);
});

test('My Hours panel is on the HR screen and shows times, overtime and claim proof', () => {
  const panel = readFileSync('src/technician/components/MyHoursPanel.tsx', 'utf8');
  assert.match(panel, /httpsCallable\(functions, 'getMyHours'\)/);
  assert.match(panel, /MISSED CLOCK-OUT/);
  assert.match(panel, /GPS/);
  assert.match(panel, /Photos/);
  const page = readFileSync('src/technician/pages/TechnicianHRPageV2.tsx', 'utf8');
  assert.match(page, /<MyHoursPanel \/>/);
});
