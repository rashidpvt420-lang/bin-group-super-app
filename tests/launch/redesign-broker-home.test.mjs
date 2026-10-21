// R7 of the 2026-10-21 redesign: broker home with real numbers and plain copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('src/broker/pages/BrokerSimpleDashboardPage.tsx', 'utf8');

test('numbers come from the live attribution signals and never show fake zeros', () => {
  assert.match(home, /const ready = !signals\.loading && !signals\.error;/);
  assert.match(home, /value=\{ready \? signals\.activeLeads : null\}/);
  assert.match(home, /<ErrorState /);
});

test('jargon removed; vacancies are a labelled placeholder until F6', () => {
  for (const s of ['BROKER SIMPLE MODE', 'identity-bound attribution', 'masked KYC', 'CanonicalNextActions', 'RoleQuickActionsPanel', "'#B8932F'"]) assert.ok(!home.includes(s), s);
  assert.match(home, /broker\.home\.vacanciesSoon/);
});

test('broker home is read-only', () => {
  assert.doesNotMatch(home, /updateDoc|setDoc|addDoc|httpsCallable/);
});
