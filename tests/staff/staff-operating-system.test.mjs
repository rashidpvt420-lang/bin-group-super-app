import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

test('TODAY dashboard uses live records and callable actions instead of local clock/demo state', () => {
  const source = read('src/components/staff/StaffTodayDashboard.tsx');
  assert.match(source, /onSnapshot\(/);
  assert.match(source, /submitStaffQuickAction/);
  assert.match(source, /requestStaffOvertime/);
  assert.match(source, /triggerStaffShiftFinish|FinishShiftChecklistModal/);
  assert.doesNotMatch(source, /setClockedIn\(!clockedIn\)/);
  assert.doesNotMatch(source, /Hilux 18|Villa 104|REG-UAE|Dubai, UAE/);
  assert.doesNotMatch(source, /label="VERIFIED"/);
});

test('Quick Actions expose only wired contextual staff workflows and no fake assignment defaults', () => {
  const source = read('src/components/staff/ContextQuickActionsFab.tsx');
  for (const action of ['CLOCK_IN_OUT', 'ARRIVE', 'START_JOB', 'FINISH_JOB', 'REQUEST_OVERTIME', 'VEHICLE_BREAKDOWN', 'ACCIDENT_REPORT']) {
    assert.equal(source.includes(action), true, `Expected Quick Action ${action}`);
  }
  assert.doesNotMatch(source, /JOB-184|Hilux 18|Dubai GPS/);
  assert.match(source, /No active job assigned/);
  assert.match(source, /No vehicle is assigned/);
});

test('Voice/text paperwork uses browser dictation only when available and server preview/confirm', () => {
  const source = read('src/components/staff/StaffVoicePaperworkDialog.tsx');
  assert.match(source, /SpeechRecognition/);
  assert.match(source, /confirmCompletion:\s*false/);
  assert.match(source, /confirmCompletion:\s*true/);
  assert.match(source, /completeStaffJobWithAi/);
  assert.match(source, /stock is unchanged|does not deduct stock/i);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.doesNotMatch(source, /compressor was damaged|R410A|2\.5HP/i);
});

test('Finish Shift UI delegates truth to server and never pre-checks evidence', () => {
  const source = read('src/components/staff/FinishShiftChecklistModal.tsx');
  assert.match(source, /triggerStaffShiftFinish/);
  assert.match(source, /The server—not this checklist—decides/);
  assert.match(source, /NOT_ASSERTED|Not asserted|not asserted/i);
  assert.doesNotMatch(source, /jobsUpdated:\s*true|vehicleReturned:\s*true|photosUploaded:\s*true|toolsReturned:\s*true/);
  assert.doesNotMatch(source, /Hilux 18|Villa 104|82%|1h 35m/);
});

test('Incomplete Staff OS modules remain explicitly feature-flagged off', () => {
  const source = read('src/config/staffFeatureFlags.ts');
  for (const flag of [
    'ENABLE_ORG_CHART_TREE',
    'ENABLE_PROBATION_CARD',
    'ENABLE_CAREER_TRANSITIONS',
    'ENABLE_SHIFT_SWAP_MODAL',
    'ENABLE_ACTING_MANAGER_DRAWER',
    'ENABLE_SUPPLIERS_PORTAL',
    'ENABLE_RECRUITMENT_PIPELINE',
    'ENABLE_CANDIDATE_MESSAGING',
  ]) {
    assert.equal(source.includes(`${flag}: false`), true, `Expected ${flag} to remain disabled`);
  }
});
