import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hr = readFileSync('functions/adminHrOperations.ts', 'utf8');
const automation = readFileSync('functions/hrAutomation.ts', 'utf8');
const lifecycle = readFileSync('functions/adminStaffLifecycle.ts', 'utf8');
const page = readFileSync('apps/admin-panel/src/pages/admin/HRManagementPage.tsx', 'utf8');
const dialog = readFileSync('apps/admin-panel/src/pages/admin/StaffLifecycleDetailsDialog.tsx', 'utf8');

test('admin leave approval updates the technician staffRequests record and recalculates the balance', () => {
  assert.match(hr, /AUTHORITATIVE_LEAVE_COLLECTION = "staffRequests"/);
  assert.match(hr, /await applyApprovedLeaveDeduction\(requestId\)/);
  assert.match(hr, /legacy_staffLeaveRequests_not_authoritative/);
  assert.match(hr, /This is not the technician leave record/);
  assert.doesNotMatch(hr, /collection\("staffLeaveRequests"\)\.doc\(\)/);
  assert.doesNotMatch(hr, /targetType: "staffLeaveRequests"/);
  assert.match(automation, /export async function applyApprovedLeaveDeduction/);
  assert.match(automation, /await recordLeaveDeduction\(requestId, snap\.data\(\) \|\| \{\}\)/);
  assert.match(lifecycle, /collection\("staffRequests"\)\.where\("uid", "==", uid\)/);
  assert.doesNotMatch(lifecycle, /staffLeaveRequests/);
  assert.match(page, /entry\.open &&/);
  assert.match(page, /annual_leave/);
});

test('attendance sheet does not invent a second clock; pay hours stay on staff_shifts', () => {
  assert.match(hr, /OFFICIAL_ATTENDANCE_HOURS_SOURCE = "staff_shifts"/);
  assert.match(hr, /Attendance hours are not entered on this sheet/);
  assert.match(hr, /checkIn: FieldValue\.delete\(\)/);
  assert.match(hr, /collection\("staff_shifts"\)/);
  assert.doesNotMatch(hr, /checkIn: clean\(request\.data\?\.checkIn\)/);
  assert.match(page, /Official hours and pay use the shift clock/);
  assert.doesNotMatch(page, /label="Check in"/);
  assert.match(dialog, /No shift clock — no hours recorded/);
  assert.doesNotMatch(dialog, /entry\.checkIn/);
});
