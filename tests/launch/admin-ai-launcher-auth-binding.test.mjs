import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminApp = await readFile('apps/admin-panel/src/App.tsx', 'utf8');
const chat = await readFile('packages/shared/src/components/SovereignAIChat.tsx', 'utf8');

test('admin AI launcher uses the Admin Firebase Functions instance', () => {
  assert.match(adminApp, /import \{ functions as adminFunctions \} from ['"]\.\/lib\/firebase['"]/);
  assert.match(adminApp, /<SovereignAIChat[\s\S]*functionsOverride=\{adminFunctions\}[\s\S]*authUserId=\{user\?\.uid \|\| null\}/);
});

test('shared SovereignAIChat supports host auth-bound Functions override', () => {
  assert.match(chat, /functionsOverride\?: Functions/);
  assert.match(chat, /const callableFunctions = functionsOverride \|\| defaultFunctions/);
  assert.match(chat, /httpsCallable\(callableFunctions, ['"]runSovereignAI['"]\)/);
});

test('admin AI launcher no longer hides unauthenticated callable root causes', () => {
  assert.match(chat, /Firebase Auth session is not attached to the AI callable/);
  assert.match(chat, /ADMIN AUTH SESSION NOT YET BOUND/);
  assert.doesNotMatch(chat, /Live AI status: \$\{message\}/);
});
