import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const staffOs = readFileSync(new URL('../../functions/staffOperatingSystem.ts', import.meta.url), 'utf8');
const today = readFileSync(new URL('../../src/components/staff/StaffTodayDashboard.tsx', import.meta.url), 'utf8');

test('staff quick actions cannot mark arrival or start work without mission evidence', () => {
  const arrive = staffOs.indexOf('actionType === "ARRIVE" || actionType === "START_JOB"');
  assert.ok(arrive >= 0, 'ARRIVE and START_JOB must fail closed together');
  const block = staffOs.slice(arrive, arrive + 700);
  assert.match(block, /failed-precondition/);
  assert.match(block, /secured mission lifecycle/);
  assert.doesNotMatch(block, /status:\s*"ARRIVED"/);
  assert.doesNotMatch(block, /status:\s*"IN_PROGRESS"/);
  assert.match(staffOs, /actionType === "CLOCK_IN"/);
});

test('today dashboard sends arrival and job start to the mission screen', () => {
  assert.match(today, /actionType === "ARRIVE" \|\| actionType === "START_JOB"/);
  assert.match(today, /navigate\(`\/technician\/job\/\$\{activeJob\.id\}`\)/);
  assert.doesNotMatch(today, /callQuickAction\("ARRIVE"\)/);
  assert.doesNotMatch(today, /callQuickAction\("START_JOB"\)/);
  assert.match(today, /callQuickAction\("CLOCK_IN"\)/);
});
