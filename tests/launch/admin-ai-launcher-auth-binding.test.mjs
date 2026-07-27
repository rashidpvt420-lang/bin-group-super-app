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

test('admin AI launcher exposes actionable auth, provider and authority failures', () => {
  assert.match(chat, /Firebase Auth is not attached to the AI callable/);
  assert.match(chat, /deployed live-provider configuration is incomplete/);
  assert.match(chat, /AUTH SESSION NOT YET BOUND/);
  assert.match(chat, /AI SERVICE ERROR — NO LIVE ANSWER/);
  assert.match(chat, /DEGRADED ·/);
  assert.match(chat, /ADVISORY ONLY · APPROVALS, PAYMENTS, ASSIGNMENTS, QUOTATIONS AND COMPLIANCE REMAIN SERVER-AUTHORITATIVE/);
});
