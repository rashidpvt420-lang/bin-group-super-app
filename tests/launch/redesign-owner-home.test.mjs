// R4 of the 2026-10-21 redesign: owner home = numbers, one to-do list, live repairs, money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('src/owner/pages/OwnerSimpleDashboardPage.tsx', 'utf8');

test('layout order: stat tiles, Needs you today, live repairs, money', () => {
  const idx = ['<StatGrid>', 'owner-needs-you-today', '<OwnerRecentComplaintsCard />', '<OwnerFinancialTruthCard />'].map((s) => home.indexOf(s));
  idx.forEach((v, i) => assert.ok(v > 0 && (i === 0 || v > idx[i - 1]), `order ${idx}`));
});

test('no marketing banner, repeated to-do blocks or promise card', () => {
  for (const s of ['OWNER SIMPLE MODE', 'Find a Room Rent — BIN handles', 'CanonicalNextActions', 'RoleQuickActionsPanel', 'OwnerApprovalCommandStrip', 'Monthly report promise']) assert.ok(!home.includes(s), s);
});

test('rent, occupancy and lease tiles are placeholders until F1/F3/F5 land (no invented numbers)', () => {
  assert.equal([...home.matchAll(/value=\{null\} placeholder=/g)].length, 3);
  assert.match(home, /<ComingSoon /);
});

test('owner home is read-only', () => {
  assert.doesNotMatch(home, /updateDoc|setDoc|addDoc|httpsCallable/);
});
