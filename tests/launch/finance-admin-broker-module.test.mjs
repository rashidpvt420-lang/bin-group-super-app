// Finance Admin broker access (Rashid, 18 Nov 2026): 'broker' is an ALLOWED (never default) module for
// finance_admin only, so a two-person-granted Finance Admin can open /broker for payout approval. The UI
// mirrors the server allow-list; payout decisions stay behind requireMfaFinanceAdminActor + the 24h grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const load = async (src) => {
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import('data:text/javascript,' + encodeURIComponent(outputText));
};
const policy = await load(fs.readFileSync('apps/admin-panel/src/security/staffAccessPolicy.ts', 'utf8'));
const server = fs.readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const staffPage = fs.readFileSync('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'utf8');

const block = (source, name) => source.slice(source.indexOf(`const ${name}`), source.indexOf('};', source.indexOf(`const ${name}`)));
const roleLine = (source, role) => {
  const line = source.split('\n').find((entry) => entry.trim().startsWith(`${role}: [`));
  return line ? line.slice(line.indexOf('[') + 1, line.indexOf(']')) : '';
};

test('server and UI allow broker for finance_admin only, never as a default', () => {
  for (const source of [server, staffPage]) {
    const allowed = block(source, 'ROLE_ALLOWED_MODULES');
    const defaults = block(source, 'ROLE_DEFAULT_MODULES');
    assert.match(roleLine(allowed, 'finance_admin'), /broker/);
    assert.doesNotMatch(roleLine(defaults, 'finance_admin'), /broker/);
    for (const role of ['finance_staff', 'finance_manager', 'finance_controller', 'payroll_admin', 'operations_admin', 'hr_admin', 'manager', 'support_admin']) {
      assert.doesNotMatch(roleLine(allowed, role), /broker/, role);
    }
  }
  assert.doesNotMatch(roleLine(block(fs.readFileSync('apps/admin-panel/src/security/staffAccessPolicy.ts', 'utf8'), 'ROLE_DEFAULT_MODULES'), 'finance_admin'), /broker/);
});

test('a finance_admin opens /broker only with the broker module', () => {
  const fa = (modules) => ({ role: 'finance_admin', claims: { role: 'finance_admin', finance_admin: true, modules } });
  assert.equal(policy.canAccessAdminPath(fa(['dashboard', 'financials', 'transactions', 'broker']), '/broker'), true);
  assert.equal(policy.canAccessAdminPath(fa(['dashboard', 'financials', 'transactions', 'broker']), '/broker-commissions'), true);
  assert.equal(policy.canAccessAdminPath(fa(['dashboard', 'financials', 'transactions']), '/broker'), false);
  assert.equal(policy.canAccessAdminPath({ role: 'finance_staff', claims: { role: 'finance_staff', modules: ['dashboard'] } }, '/broker'), false);
});

test('the broker page payout buttons still require an explicit Finance approver with MFA', () => {
  const page = fs.readFileSync('apps/admin-panel/src/pages/brokers/BrokerManagementPage.tsx', 'utf8');
  assert.match(page, /canApproveBrokerPayout = \(user: any, mfaVerified: boolean\): boolean => \(\s*claimsGrantFinanceApproverUi\(user, mfaVerified\)/);
  const payout = fs.readFileSync('functions/adminBrokerPayoutReview.ts', 'utf8');
  assert.match(payout, /await requireMfaFinanceAdminActor\(request\)/);
});

test('rules open only broker document metadata reads for a broker-module, MFA Finance Admin', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const fn = rules.slice(rules.indexOf('function isBrokerModuleFinanceAdmin()'), rules.indexOf('match /brokerDocuments/{documentId}'));
  assert.match(fn, /hasAdminSecondFactor\(\)/);
  assert.match(fn, /claimedRole\(\) == 'finance_admin'/);
  assert.match(fn, /'broker' in request\.auth\.token\.get\('modules', \[\]\)/);
  const match = rules.slice(rules.indexOf('match /brokerDocuments/{documentId}'), rules.indexOf('match /move_out_requests/'));
  assert.match(match, /allow read: if isAdmin\(\) \|\| isBrokerModuleFinanceAdmin\(\) \|\|/);
  assert.doesNotMatch(match.replace(/allow read:[^\n]*/, ''), /isBrokerModuleFinanceAdmin/);
  const storage = fs.readFileSync('storage.rules', 'utf8');
  assert.doesNotMatch(storage, /finance_admin[^\n]*brokerDocuments|brokerDocuments[^\n]*finance_admin/);
});
