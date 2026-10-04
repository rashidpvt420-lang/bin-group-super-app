// Default technician home: automatic dispatch only routes to on-duty technicians and Admin's
// manual assignment needs a fresh availability GPS fix, but the duty toggle and the availability
// GPS reporter existed only on the advanced dashboard (/technician/dashboard/full). A technician on
// the default home (/technician) could never become dispatchable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync(new URL('../../src/technician/components/TechnicianDutyAvailabilityCard.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../src/technician/pages/TechnicianSimpleDashboardPage.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/technician/TechnicianApp.tsx', import.meta.url), 'utf8');

async function loadHelpers() {
  const start = card.indexOf('export type DutyState');
  const end = card.indexOf('function errorText');
  assert.ok(start >= 0 && end > start);
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(card.slice(start, end), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

test('the default technician home renders the duty + availability card', () => {
  assert.match(home, /import TechnicianDutyAvailabilityCard from '\.\.\/components\/TechnicianDutyAvailabilityCard';/);
  assert.match(home, /<TechnicianDutyAvailabilityCard isRTL=\{isRTL\} \/>/);
  // The default technician route is the simple home.
  assert.match(app, /<Route path="\/" element=\{<TechnicianSimpleDashboardPage \/>\} \/>/);
});

test('duty changes go through the server duty callables and surface their errors', () => {
  for (const name of ['startTechnicianDuty', 'takeTechnicianBreak', 'resumeTechnicianDuty', 'endTechnicianDuty']) {
    assert.match(card, new RegExp(`'${name}'`));
  }
  assert.match(card, /httpsCallable\(functions, dutyCallableFor\(duty, target\)\)/);
  assert.match(card, /setDutyError\(errorText\(err,/);
  assert.match(card, /data-testid="technician-activate-duty"/);
  assert.doesNotMatch(card, /updateDoc|setDoc/, 'duty is never written from the client');
});

test('availability GPS is reported only while on duty with no active job, on the shared interval', () => {
  assert.match(card, /const shouldReportAvailability = Boolean\(user\?\.uid\) && duty === 'ON_DUTY' && activeJobCount === 0;/);
  assert.match(card, /reportTechnicianAvailabilityLocation\(\)/);
  assert.match(card, /window\.setInterval\(report, AVAILABILITY_REPORT_INTERVAL_MS\)/);
  assert.match(card, /window\.clearInterval\(timer\)/);
  assert.match(card, /data-testid="technician-availability-gps-error"/);
  assert.match(card, /onSnapshotSplitIn\(collection\(db, 'maintenanceTickets'\), \{ field: 'assignedTechnicianId', value: user\.uid \}, 'status', ALL_TECHNICIAN_ACTIVE_STATUSES/);
});

test('duty state and callable selection', async () => {
  const { normalizeDutyState, dutyCallableFor } = await loadHelpers();
  assert.equal(normalizeDutyState('ON_DUTY'), 'ON_DUTY');
  assert.equal(normalizeDutyState('working'), 'ON_DUTY');
  assert.equal(normalizeDutyState('on break'), 'ON_BREAK');
  assert.equal(normalizeDutyState('OFF_DUTY'), 'OFF_DUTY');
  assert.equal(normalizeDutyState(undefined), 'OFF_DUTY');
  assert.equal(normalizeDutyState('', true), 'ON_DUTY');
  assert.equal(dutyCallableFor('OFF_DUTY', 'ON_DUTY'), 'startTechnicianDuty');
  assert.equal(dutyCallableFor('ON_BREAK', 'ON_DUTY'), 'resumeTechnicianDuty');
  assert.equal(dutyCallableFor('ON_DUTY', 'ON_BREAK'), 'takeTechnicianBreak');
  assert.equal(dutyCallableFor('ON_DUTY', 'OFF_DUTY'), 'endTechnicianDuty');
});
