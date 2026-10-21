// R4 of the 2026-10-21 redesign: owner home = numbers, one to-do list, live repairs, money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('src/owner/pages/OwnerSimpleDashboardPage.tsx', 'utf8');

test('layout order: stat tiles, Needs you today, live repairs, money', () => {
  const idx = ['<OwnerKpiTiles', 'owner-needs-you-today', '<OwnerRecentComplaintsCard />', '<OwnerFinancialTruthCard />'].map((s) => home.indexOf(s));
  idx.forEach((v, i) => assert.ok(v > 0 && (i === 0 || v > idx[i - 1]), `order ${idx}`));
});

test('no marketing banner, repeated to-do blocks or promise card', () => {
  for (const s of ['OWNER SIMPLE MODE', 'Find a Room Rent — BIN handles', 'CanonicalNextActions', 'RoleQuickActionsPanel', 'OwnerApprovalCommandStrip', 'Monthly report promise']) assert.ok(!home.includes(s), s);
});

test('rent, occupancy, lease and repair tiles read server KPIs (F9) and never show an invented 0', async () => {
  const tiles = await readFile('src/owner/components/OwnerKpiTiles.tsx', 'utf8');
  assert.equal([...tiles.matchAll(/<StatTile /g)].length, 4);
  assert.match(tiles, /kpi && !kpi\.error/);
  assert.match(tiles, /owner\.home\.couldNotLoad/);
  assert.doesNotMatch(home, /<ComingSoon /, 'the "numbers are coming" placeholder is gone');
});

test('owner home is read-only', () => {
  assert.doesNotMatch(home, /updateDoc|setDoc|addDoc|httpsCallable/);
});
