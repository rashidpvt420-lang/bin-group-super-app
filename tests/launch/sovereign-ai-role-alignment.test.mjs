import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/components/AuthenticatedShell.tsx', 'utf8');
const chat = readFileSync('src/components/SovereignAIChat.tsx', 'utf8');
const assistant = readFileSync('functions/aiAssistant.ts', 'utf8');
const quota = readFileSync('functions/aiUsageQuota.ts', 'utf8');

const aiEnabledStaffRoles = [
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'finance_admin',
  'hr_admin',
  'support_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'account_manager',
  'dispatcher',
  'operations_manager',
];

test('every staff role exposed by the AI launcher is accepted by Sovereign AI chat authority', () => {
  for (const role of aiEnabledStaffRoles) {
    assert.match(shell, new RegExp(`['\"]${role}['\"]`), `frontend must expose ${role}`);
    assert.match(assistant, new RegExp(`['\"]${role}['\"]`), `backend must authorize ${role}`);
  }
});

test('staff roles use the admin advisory persona without impersonating privileged admin claims', () => {
  assert.match(shell, /function sovereignRoleForPortal\(role: string\): SovereignRole/);
  assert.match(shell, /ADMIN_STAFF_ROLES\.includes\(role\)\) return 'admin'/);
  assert.match(shell, /role=\{aiRole\}/);

  assert.match(
    quota,
    /const ADMIN_ROLES = new Set\(\["admin", "super_admin", "ceo", "operations_admin"\]\);/,
    'AI role alignment must not broaden privileged admin/evidence-probe authority',
  );
});

test('AI chat history cannot cross signed-in identities through browser session storage', () => {
  assert.match(shell, /key=\{`\$\{aiRole\}:\$\{currentUserId\}`\}/);
  assert.doesNotMatch(shell, /sessionStorage/);
  assert.doesNotMatch(chat, /bin_chat_history_/);
  assert.doesNotMatch(chat, /sessionStorage\.(?:getItem|setItem)/);
});

test('Sovereign AI security controls remain fail closed', () => {
  assert.match(assistant, /enforceAppCheck: true/);
  assert.match(assistant, /if \(!request\.auth\?\.uid\)/);
  assert.match(assistant, /reserveAiUsageQuota\(/);
  assert.match(assistant, /advisoryOnly: true/);
  assert.match(assistant, /clientContextAuthoritative: false/);
});
