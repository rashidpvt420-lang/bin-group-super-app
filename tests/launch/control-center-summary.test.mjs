import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { summarizeControlCentreMoney } from '../../apps/admin-panel/src/lib/controlCentreMoney.mjs';

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(p, 'utf8');

test('functions copy of control-centre money is generated from the Admin source and not stale', () => {
  execFileSync(process.execPath, ['scripts/sync-control-centre-money.mjs', '--check'], { stdio: 'pipe' });
  const server = require('../../functions/shared/controlCentreMoney.js');
  const payments = [
    { recordType: 'OWNER_RENT_PAYMENT', paymentStatus: 'VERIFIED', amount: 1000.5, rentDue: 1500, rentPaid: 1000.5 },
    { recordType: 'RENT_COLLECTION', status: 'REJECTED', amount: 99 },
    { transactionType: 'REFUND', status: 'PAID', amount: 10 },
  ];
  const contracts = [{ status: 'ACTIVE', annualRent: 60000 }, { status: 'DRAFT', annualRent: 1 }];
  assert.deepEqual(server.summarizeControlCentreMoney(payments, contracts), summarizeControlCentreMoney(payments, contracts));
  assert.deepEqual(server.summarizeControlCentreMoney(payments, contracts, { paymentsTruncated: true }), summarizeControlCentreMoney(payments, contracts, { paymentsTruncated: true }));
});

test('summary job is scheduled, App Check + MFA gated on refresh, and writes the single summary doc', () => {
  const src = read('functions/controlCenterSummary.ts');
  assert.match(src, /onSchedule\(\s*\{ schedule: "every 15 minutes"/);
  assert.match(src, /system_health\/control_center_summary/);
  assert.match(src, /adminRefreshControlCenterSummary = onCall\(\s*\{[^}]*region: "europe-west3"[^}]*enforceAppCheck: true/s);
  assert.match(src, /requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(src, /\.count\(\)\.get\(\)/);
  assert.match(src, /transport\.verify\(\)/);
  assert.doesNotMatch(src, /sendMail\(/, 'health check must never send mail');
  assert.match(read('functions/index.ts'), /export \* from "\.\/controlCenterSummary";/);
});

test('control center page reads the summary doc and no longer scans collections or hard-codes health', () => {
  const page = read('apps/admin-panel/src/pages/ProductionControlCenter.tsx');
  assert.doesNotMatch(page, /getDocs\(/);
  assert.doesNotMatch(page, /Version 2\.4\.1/);
  assert.doesNotMatch(page, /sendGrid: 'operational'/);
  assert.match(page, /system_health\/control_center_summary/);
  assert.match(page, /adminRefreshControlCenterSummary/);
});

test('staff and technician directories are paginated with a hard cap', () => {
  const staff = read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');
  assert.match(staff, /where\('role', 'in', staffRoleValues\), limit\(staffPageLimit \+ 1\)/);
  assert.match(staff, /STAFF_MAX_ROWS = 500/);
  const tech = read('apps/admin-panel/src/pages/technicians/TechnicianDutyMonitorPage.tsx');
  assert.match(tech, /where\('role', '==', 'technician'\), limit\(pageLimit \+ 1\)/);
  assert.match(tech, /TECHNICIAN_MAX_ROWS = 500/);
});
