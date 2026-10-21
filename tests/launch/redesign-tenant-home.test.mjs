// R5 of the 2026-10-21 redesign: tenant home built on the tenant's real home data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('src/tenant/pages/TenantSimpleDashboardPage.tsx', 'utf8');
const hook = await readFile('src/tenant/hooks/useTenantHomeData.ts', 'utf8');

test('layout order: unit header, rent, lease, active request, report, services, emergency', () => {
  const idx = ['<AppHeader', 'tenant-home-rent', 'tenant-home-lease', 'tenant-home-active-request', 'tenant-home-report', "navigate('/tenant/emergency')"].map((s) => home.indexOf(s));
  idx.forEach((v, i) => assert.ok(v > 0 && (i === 0 || v > idx[i - 1]), `order ${idx}`));
});

test('unlinked tenants see the link-your-home card', () => {
  assert.match(home, /!unitLoading && !unit && <TenantUnitLinkFallback/);
});

test('rent stays a placeholder until the rent schedule (F1) lands; lease uses a real end date only', () => {
  assert.match(home, /tenant\.home\.rentSoon/);
  assert.match(home, /endMs \? \(/);
  assert.match(home, /tenant\.home\.leaseMissing/);
});

test('reads are identity-bound and read-only', () => {
  assert.match(hook, /where\('tenantId', '==', user\.uid\)/);
  assert.match(hook, /where\('tenantEmail', '==', user\.email\.toLowerCase\(\)\)/);
  assert.doesNotMatch(hook + home, /updateDoc|setDoc|addDoc|httpsCallable/);
});

test('old explainer copy and duplicate blocks are gone', () => {
  for (const s of ['TENANT SIMPLE MODE', 'CanonicalNextActions', 'RoleQuickActionsPanel', 'ONE-TAP MAINTENANCE', 'Emergency SLA']) assert.ok(!home.includes(s), s);
});
