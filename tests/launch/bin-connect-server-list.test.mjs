import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('BIN Connect enumeration and mutations stay behind authenticated App Check server authority', async () => {
  const [callable, runtime, inbox, chatbox, rules, hardener] = await Promise.all([
    read('functions/binConnectOperations.ts'),
    read('functions/runtime.ts'),
    read('src/components/BinConnectInboxPage.tsx'),
    read('src/components/BinConnectChatBox.tsx'),
    read('firestore.rules'),
    read('scripts/harden-bin-connect-rules.mjs'),
  ]);

  for (const name of [
    'listMyBinConnectThreads',
    'createBinConnectThread',
    'sendBinConnectMessage',
    'resolveBinConnectThread',
  ]) {
    assert.match(callable, new RegExp(`export const ${name} = onCall`));
  }
  assert.match(callable, /enforceAppCheck:\s*true/g);
  assert.match(callable, /if \(!uid\) throw new HttpsError\("unauthenticated"/);
  assert.match(callable, /\.where\("participantIds", "array-contains", actor\.uid\)/);
  assert.match(callable, /permission-denied/);
  assert.match(callable, /BIN_CONNECT_THREAD_CREATED/);
  assert.match(callable, /BIN_CONNECT_MESSAGE_SENT/);
  assert.match(callable, /BIN_CONNECT_THREAD_RESOLVED/);
  assert.match(callable, /db\.collection\("audit_logs"\)/);
  assert.match(runtime, /export \* from "\.\/binConnectOperations"/);

  assert.match(chatbox, /createBinConnectThread/);
  assert.match(inbox, /sendBinConnectMessage/);
  assert.match(inbox, /resolveBinConnectThread/);
  for (const source of [inbox, chatbox]) {
    assert.match(source, /listMyBinConnectThreads/);
    assert.doesNotMatch(source, /\baddDoc\b/);
    assert.doesNotMatch(source, /\bupdateDoc\b/);
    assert.doesNotMatch(source, /\bserverTimestamp\b/);
  }

  assert.match(rules, /allow get: if isAdmin\(\) \|\| isBinConnectParticipant\(resource\.data\);/);
  assert.match(rules, /allow list: if isAdmin\(\);/);
  assert.match(rules, /allow create, update: if false;/);
  assert.match(rules, /match \/messages\/\{messageId\}[\s\S]*allow create, update: if false;/);
  assert.match(hardener, /Cloud Functions own all thread mutations/);
  assert.match(hardener, /Cloud Functions own all message mutations/);
});
