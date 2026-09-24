import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('BIN Connect enumeration stays behind authenticated App Check server authority', async () => {
  const [callable, runtime, inbox, chatbox, rules, hardener] = await Promise.all([
    read('functions/binConnectOperations.ts'),
    read('functions/runtime.ts'),
    read('src/components/BinConnectInboxPage.tsx'),
    read('src/components/BinConnectChatBox.tsx'),
    read('firestore.rules'),
    read('scripts/harden-bin-connect-rules.mjs'),
  ]);

  assert.match(callable, /export const listMyBinConnectThreads = onCall/);
  assert.match(callable, /enforceAppCheck:\s*true/);
  assert.match(callable, /if \(!uid\) throw new HttpsError\("unauthenticated"/);
  assert.match(callable, /\.where\("participantIds", "array-contains", uid\)/);
  assert.match(runtime, /export \* from "\.\/binConnectOperations"/);

  for (const source of [inbox, chatbox]) {
    assert.match(source, /listMyBinConnectThreads/);
    assert.doesNotMatch(source, /where\(['"]participantIds['"],\s*['"]array-contains['"]/);
  }

  assert.match(rules, /allow get: if isAdmin\(\) \|\| isBinConnectParticipant\(resource\.data\);/);
  assert.match(rules, /allow list: if isAdmin\(\);/);
  assert.match(hardener, /allow list: if isAdmin\(\);/);
});
