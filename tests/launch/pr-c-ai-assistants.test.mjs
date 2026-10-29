import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('public assistant is a separate App Check callable that reads no customer collections', () => {
  const src = read('functions/publicAppAssistant.ts');
  assert.match(src, /export const askPublicAppAssistant = onCall\(\{[^}]*enforceAppCheck: true/s);
  assert.match(src, /consumePublicAiQuota/);
  for (const col of ['users', 'properties', 'active_contracts', 'payments', 'tickets', 'invoices']) {
    assert.doesNotMatch(src, new RegExp(`collection\\(["']${col}["']\\)`), col);
  }
  assert.doesNotMatch(src, /from "\.\/aiAssistant"/);
});

test('runSovereignAI still requires sign-in and App Check', () => {
  const src = read('functions/aiAssistant.ts');
  assert.match(src, /export const runSovereignAI = onCall\(\{[^}]*enforceAppCheck: true/s);
  assert.match(src, /Sign in before using Sovereign AI/);
});

test('dashboard AI requires confirm, App Check, and forbids money/approval actions', () => {
  const src = read('functions/dashboardAiActions.ts');
  assert.match(src, /proposeDashboardAiAction = onCall\(\{[^}]*enforceAppCheck: true/);
  assert.match(src, /confirmDashboardAiAction = onCall\(\{[^}]*enforceAppCheck: true/);
  assert.match(src, /FORBIDDEN_INTENT = .*approv.*pay.*refund.*cheque.*cash/);
  assert.doesNotMatch(src, /collection\(["'](payments|payment_records|invoices|active_contracts)["']\)/);
});

test('logged-out chat uses the public assistant; dashboard chat shows confirm buttons', () => {
  assert.match(read('src/App.tsx'), /isAuthenticated=\{false\} authUserId=\{null\} publicAssistant \/>/);
  const chat = read('src/components/SovereignAIChat.tsx');
  assert.match(chat, /httpsCallable\(functions, 'askPublicAppAssistant'\)/);
  assert.match(chat, /httpsCallable\(functions, 'confirmDashboardAiAction'\)/);
  assert.match(chat, /Nothing changes until you confirm/);
});

test('AI proposal and audit collections are excluded from the admin catch-all', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  for (const name of ['ai_action_proposals', 'ai_action_audit']) {
    assert.equal((rules.match(new RegExp(`'${name}'`, 'g')) || []).length, 2, name);
  }
});
