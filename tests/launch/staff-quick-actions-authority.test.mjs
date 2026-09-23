import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const fab = read('src/components/staff/ContextQuickActionsFab.tsx');
const dashboard = read('src/components/staff/StaffTodayDashboard.tsx');
const backend = read('functions/staffOperatingSystem.ts');

const visibleActions = [
  'CLOCK_IN_OUT',
  'ARRIVE',
  'START_JOB',
  'FINISH_JOB',
  'REQUEST_OVERTIME',
  'VEHICLE_BREAKDOWN',
  'ACCIDENT_REPORT',
];

test('every visible Staff quick action has an explicit authoritative handler', () => {
  for (const action of visibleActions) {
    assert.ok(fab.includes(`type: "${action}"`), `quick-action FAB is missing ${action}`);
    assert.ok(dashboard.includes(`actionType === "${action}"`), `StaffTodayDashboard is missing an explicit handler for ${action}`);
  }

  assert.match(dashboard, /CLOCK_IN_OUT[\s\S]*callQuickAction\("CLOCK_IN"\)/);
  assert.match(dashboard, /actionType === "ARRIVE"[\s\S]*callQuickAction\("ARRIVE"\)/);
  assert.match(dashboard, /actionType === "START_JOB"[\s\S]*callQuickAction\("START_JOB"\)/);
  assert.match(dashboard, /actionType === "FINISH_JOB"[\s\S]*setVoiceDialogOpen\(true\)/);
  assert.match(dashboard, /actionType === "REQUEST_OVERTIME"[\s\S]*setOvertimeDialogOpen\(true\)/);
  assert.match(dashboard, /actionType === "VEHICLE_BREAKDOWN"[\s\S]*callQuickAction\("BREAKDOWN_REPORT"\)/);
  assert.match(dashboard, /actionType === "ACCIDENT_REPORT"[\s\S]*httpsCallable\(functions, "executeMultiDeptAutomation"\)/);
  assert.match(dashboard, /httpsCallable\(functions, "requestStaffOvertime"\)/);
});

test('direct Staff quick-action callable only accepts the exact UI-mapped server actions', () => {
  assert.match(
    backend,
    /supportedActions = new Set\(\["CLOCK_IN", "ARRIVE", "START_JOB", "BREAKDOWN_REPORT"\]\)/,
  );
  assert.match(backend, /if \(!supportedActions\.has\(actionType\)\)/);

  // Composite UI actions must remain routed through their dedicated workflows,
  // not be silently added to the generic callable without a reviewed contract.
  for (const composite of ['FINISH_JOB', 'REQUEST_OVERTIME', 'ACCIDENT_REPORT']) {
    assert.doesNotMatch(
      backend,
      new RegExp(`supportedActions[^;]+${composite}`),
      `${composite} must keep using its dedicated authoritative workflow`,
    );
  }
});