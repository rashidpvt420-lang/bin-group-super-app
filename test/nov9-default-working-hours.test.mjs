// Rashid, 9 Nov 2026 (16:21 GST): the new-hire default is 8 AM - 5 PM with a 1 hour unpaid break,
// i.e. 8 working hours, on the server and in the admin UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const read = (p) => readFileSync(p, 'utf8');
const Server = await loadTsModules('functions/hrPayConfig.ts');
const Ui = await loadTsModules('apps/admin-panel/src/lib/staffScheduleDefaults.ts');
const { computeShiftHours } = await loadTsModules('functions/hrHoursEngine.ts', ['functions/hrPayConfig.ts']);

test('server and admin UI share the same default schedule', () => {
  assert.equal(Server.DEFAULT_WORKING_HOURS, '8 AM - 5 PM (1 h unpaid break)');
  for (const k of ['DEFAULT_WORKING_HOURS', 'DEFAULT_SHIFT_START', 'DEFAULT_SHIFT_END', 'DEFAULT_UNPAID_BREAK_MINUTES']) {
    assert.equal(Ui[k], Server[k], k);
  }
  assert.equal(Server.DEFAULT_SHIFT_START, '08:00');
  assert.equal(Server.DEFAULT_SHIFT_END, '17:00');
  assert.equal(Server.DEFAULT_UNPAID_BREAK_MINUTES, 60);
});

test('the default day is exactly 8 working hours with no overtime', () => {
  const at = (hhmm) => Date.parse(`2026-11-10T${hhmm}:00+04:00`);
  const d = computeShiftHours({ shiftDate: '2026-11-10', clockInMs: at(Server.DEFAULT_SHIFT_START), clockOutMs: at(Server.DEFAULT_SHIFT_END), breakMinutes: Server.DEFAULT_UNPAID_BREAK_MINUTES });
  assert.equal(d.workedMinutes, 8 * 60);
  assert.equal(d.overtimeMinutes, 0);
  assert.equal(Server.HR_PAY_CONFIG.normalDailyMinutes, d.workedMinutes);
});

test('every place that fills the default uses it; no 8 AM - 4 PM / 16:00 default is left', () => {
  for (const f of ['functions/adminStaffLifecycle.ts', 'functions/adminUserProvisioning.ts']) {
    const src = read(f);
    assert.match(src, /import \{ DEFAULT_WORKING_HOURS \} from "\.\/hrPayConfig";/);
    assert.match(src, /workingHours, DEFAULT_WORKING_HOURS\)/);
    assert.doesNotMatch(src, /"8 AM - 4 PM"|"9 AM - 4 PM"/);
  }
  const roster = read('apps/admin-panel/src/pages/admin/StaffRosterEditorDialog.tsx');
  assert.match(roster, /start: DEFAULT_SHIFT_START, end: DEFAULT_SHIFT_END/);
  assert.doesNotMatch(roster, /'16:00'/);
  assert.match(read('apps/admin-panel/src/pages/admin/StaffLifecycleDetailsDialog.tsx'), /placeholder=\{DEFAULT_WORKING_HOURS\}/);
});

test('the legacy clock-out parser still reads the new default as a 9 h span (8 h work + 1 h break)', () => {
  const m = Server.DEFAULT_WORKING_HOURS.match(/(\d+)\s*(AM|PM)\s*-\s*(\d+)\s*(AM|PM)/i);
  assert.ok(m);
  const start = Number(m[1]) + (m[2].toUpperCase() === 'PM' && Number(m[1]) < 12 ? 12 : 0);
  const end = Number(m[3]) + (m[4].toUpperCase() === 'PM' && Number(m[3]) < 12 ? 12 : 0);
  assert.equal((end - start) * 60, 8 * 60 + Server.DEFAULT_UNPAID_BREAK_MINUTES);
});
