import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const P = await loadTsModules('functions/hrOvertimeProof.ts', ['functions/hrPayConfig.ts']);

test('overtime claim cap is 120 minutes', () => {
  assert.equal(P.MAX_OVERTIME_CLAIM_MINUTES, 120);
});

test('approved minutes must be 1..min(claimed,120) integers', () => {
  assert.equal(P.validateApprovedMinutes(90, 100), 90);
  assert.equal(P.validateApprovedMinutes(120, 120), 120);
  assert.equal(P.validateApprovedMinutes(121, 200), null);
  assert.equal(P.validateApprovedMinutes(101, 100), null);
  assert.equal(P.validateApprovedMinutes(0, 100), null);
  assert.equal(P.validateApprovedMinutes(30.5, 100), null);
});

test('proof snapshot copies shift and job timestamps, GPS and photos from server records', () => {
  const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
  const proof = P.buildOvertimeProof(
    { clockInTime: ts('2026-11-04T04:00:00Z'), status: 'ACTIVE', totalBreakMinutes: 30 },
    {
      arrivedAt: ts('2026-11-04T13:10:00Z'), startedAt: ts('2026-11-04T13:20:00Z'), completedAt: null,
      arrivalLocation: { lat: 25.2, lng: 55.27, accuracy: 12, capturedAtMs: Date.parse('2026-11-04T13:09:00Z'), locationSource: 'native_android_location_manager' },
      beforePhotos: ['a.jpg'], evidencePhotos: [{ url: 'b.jpg' }, 'b.jpg'],
    },
  );
  assert.equal(proof.shift.clockInAt, '2026-11-04T04:00:00.000Z');
  assert.equal(proof.shift.breakMinutes, 30);
  assert.equal(proof.job.arrivedAt, '2026-11-04T13:10:00.000Z');
  assert.equal(proof.job.startedAt, '2026-11-04T13:20:00.000Z');
  assert.equal(proof.job.completedAt, null);
  assert.equal(proof.job.arrivalLocation.lat, 25.2);
  assert.equal(proof.job.arrivalLocation.capturedAt, '2026-11-04T13:09:00.000Z');
  assert.deepEqual(proof.job.beforePhotos, ['a.jpg']);
  assert.deepEqual(proof.job.afterPhotos, ['b.jpg']);
  assert.equal(P.proofStrength(proof), 'SHIFT_JOB_GPS_PHOTOS');
  assert.equal(P.proofStrength(P.buildOvertimeProof({}, null)), 'SHIFT_ONLY');
});

test('callables: 120 cap, proof on the claim, reviewer roles, no self-review, no settle', () => {
  const src = readFileSync('functions/staffOperatingSystem.ts', 'utf8');
  assert.doesNotMatch(src, /estimatedMinutes > 360/);
  assert.match(src, /estimatedMinutes > MAX_OVERTIME_CLAIM_MINUTES/);
  // P2-17: the claim carries the date of the open shift (today, or yesterday for a night shift).
  assert.match(src, /shiftDate,\s*proof,/);
  assert.match(src, /export const reviewStaffOvertimeClaim = onCall\(CALLABLE_OPTIONS/);
  assert.match(src, /export const listPendingOvertimeClaims = onCall\(CALLABLE_OPTIONS/);
  assert.match(src, /You cannot review your own overtime/);
  const review = src.slice(src.indexOf('export const reviewStaffOvertimeClaim'), src.indexOf('Server-authoritative end-of-shift'));
  assert.match(review, /assertStaffSession\(request\.auth, token\)/);
  assert.doesNotMatch(review, /payroll_entries|settle/i);
});

test('UI caps at 120 and HR has a review panel showing the proof', () => {
  const ui = readFileSync('src/components/staff/StaffTodayDashboard.tsx', 'utf8');
  assert.match(ui, /minutes > 120/);
  assert.match(ui, /max: 120/);
  const panel = readFileSync('apps/admin-panel/src/pages/admin/OvertimeClaimsReviewPanel.tsx', 'utf8');
  assert.match(panel, /reviewStaffOvertimeClaim/);
  assert.match(panel, /GPS/);
  const hr = readFileSync('apps/admin-panel/src/pages/admin/HRManagementPage.tsx', 'utf8');
  assert.match(hr, /<OvertimeClaimsReviewPanel \/>/);
});
