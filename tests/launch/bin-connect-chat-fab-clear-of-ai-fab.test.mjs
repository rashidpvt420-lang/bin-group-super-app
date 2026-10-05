import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Sovereign AI button defaults to 30px from the bottom-right corner (56px, z-index 2500).
// BIN Connect chat sat at bottom 28 (desktop) / 74 (phone), so the AI button covered it and
// the chat button could not be tapped in the owner and technician portals.
const chat = readFileSync(new URL('../../src/components/BinConnectChatBox.tsx', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../../src/components/SovereignAIChat.tsx', import.meta.url), 'utf8');

test('chat FAB sits fully above the default AI FAB on every breakpoint', () => {
  const size = Number(ai.match(/const FAB_SIZE = (\d+)/)[1]);
  const offset = Number(ai.match(/window\.innerHeight - FAB_SIZE - (\d+)/)[1]);
  const aiTop = offset + size; // distance from viewport bottom to the AI button's top edge
  const m = chat.match(/position: 'fixed', right: \{[^}]+\}, bottom: \{ xs: (\d+), md: (\d+) \}/);
  assert.ok(m, 'chat FAB position not found');
  for (const bottom of [Number(m[1]), Number(m[2])]) assert.ok(bottom >= aiTop, `chat bottom ${bottom} overlaps AI button (top edge ${aiTop})`);
});

test('chat send failure does not tell users to check Firestore rules', () => {
  assert.doesNotMatch(chat, /Check Firestore rules/);
});
