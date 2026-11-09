// Nov 9 audit P1-9: HR can edit the roster, staff see today's roster, 8-hour default.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('HR page opens a roster editor that saves through hrSetStaffRoster', () => {
  const page = readFileSync('apps/admin-panel/src/pages/admin/HRManagementPage.tsx', 'utf8');
  const dialog = readFileSync('apps/admin-panel/src/pages/admin/StaffRosterEditorDialog.tsx', 'utf8');
  assert.match(page, /<StaffRosterEditorDialog /);
  assert.match(dialog, /httpsCallable\(functions, 'hrSetStaffRoster'\)/);
});

test('technician Home duty card shows the roster for today', () => {
  const card = readFileSync('src/technician/components/TechnicianDutyAvailabilityCard.tsx', 'utf8');
  assert.match(card, /'getMyRoster'/);
  assert.match(card, /data-testid="technician-roster-today"/);
});

test('default working hours are 8 hours (8 AM - 5 PM with a 1 h unpaid break)', () => {
  for (const f of ['functions/adminStaffLifecycle.ts', 'functions/adminUserProvisioning.ts']) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /9 AM - 4 PM|"8 AM - 4 PM"/);
    assert.match(src, /DEFAULT_WORKING_HOURS/);
  }
});
