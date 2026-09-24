import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('turnover quote decisions are server-authoritative, owner-bound and idempotent', async () => {
  const [backend, runtime, rules] = await Promise.all([
    read('functions/ownerTurnoverOperations.ts'),
    read('functions/runtime.ts'),
    read('firestore.rules'),
  ]);

  assert.match(backend, /ownerDecideTurnoverQuote = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /role !== "owner"/);
  assert.match(backend, /email_verified !== true/);
  assert.match(backend, /quote\.ownerId \|\| quote\.ownerUid/);
  assert.match(backend, /if \(currentStatus === decision\)/);
  assert.match(backend, /idempotent = true/);
  assert.match(backend, /\["PENDING", "PENDING_APPROVAL"\]/);
  assert.match(backend, /OWNER_TURNOVER_QUOTE_APPROVED/);
  assert.match(backend, /OWNER_TURNOVER_QUOTE_REJECTED/);
  assert.match(backend, /OWNER_PORTAL_CALLABLE/);
  assert.match(runtime, /export \* from "\.\/ownerTurnoverOperations"/);

  const marker = 'match /turnover-quotes/{quoteId}';
  const start = rules.indexOf(marker);
  assert.ok(start >= 0, 'turnover rules must exist');
  const block = rules.slice(start, start + 650);
  assert.match(block, /allow update: if false/);
  assert.doesNotMatch(block, /request\.resource\.data\.get\('status'/);
});

for (const pagePath of [
  'src/pages/TurnoverEnginePage.tsx',
  'apps/owner-app/src/pages/TurnoverEnginePage.tsx',
]) {
  test(`${pagePath} uses the callable once-only UI contract`, async () => {
    const page = await read(pagePath);
    assert.match(page, /httpsCallable\(functions, 'ownerDecideTurnoverQuote'\)/);
    assert.match(page, /if \(decisionBusy\) return/);
    assert.match(page, /setDecisionBusy\(decision\)/);
    assert.match(page, /finally \{[\s\S]*setDecisionBusy\(null\)/);
    assert.match(page, /data-testid="turnover-reject"/);
    assert.match(page, /data-testid="turnover-approve"/);
    assert.match(page, /disabled=\{decisionBusy !== null\}/);
    assert.doesNotMatch(page, /updateDoc\(doc\(db, 'turnover-quotes'/);
  });
}
