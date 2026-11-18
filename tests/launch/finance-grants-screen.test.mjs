// Finance grants screen (Rashid, 18 Nov 2026): the UI only explains and disables; the two-person
// callables stay the authority. These tests pin the UI mirror of the server rules and the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const load = async (file) => {
  const src = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import('data:text/javascript,' + encodeURIComponent(outputText));
};
const policy = await load('apps/admin-panel/src/security/staffAccessPolicy.ts');
const view = await load('apps/admin-panel/src/pages/financials/financeGrantView.ts');
const t = (en) => en;
const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const grant = (overrides = {}) => ({
  authorizationId: 'auth1', actionType: 'REGRANT_FINANCE_AUTHORITY', targetUid: 'target', targetEmail: 't@example.invalid',
  targetRole: 'finance_admin', previousRole: 'finance_admin', requesterId: 'founder', requesterEmail: 'f@example.invalid',
  requesterRole: 'ceo', createdAtMs: NOW - HOUR, expiresAtMs: NOW + 23 * HOUR, isExpired: false,
  viewerIsRequester: false, viewerIsTarget: false, viewerCanApprove: true, viewerCanReject: true, ...overrides,
});
const viewer = (overrides = {}) => ({ uid: 'second', role: 'super_admin', canRequest: true, canApprove: true, ...overrides });

test('UI capability mirror: request = Super Admin/CEO, approve = Super Admin/CEO/Finance Controller, both need MFA', () => {
  const caps = (role, claims = {}, mfa = true) => policy.financeGrantCapabilities({ role, claims: { role, ...claims } }, mfa);
  assert.deepEqual(caps('ceo'), { canView: true, canRequest: true, canApprove: true, mfaReady: true });
  assert.deepEqual(caps('super_admin'), { canView: true, canRequest: true, canApprove: true, mfaReady: true });
  assert.deepEqual(caps('finance_controller'), { canView: true, canRequest: false, canApprove: true, mfaReady: true });
  for (const role of ['admin', 'finance_admin', 'finance_manager', 'finance_staff', 'payroll_admin', 'hr_admin', 'operations_admin', 'manager']) {
    assert.equal(caps(role).canView, false, role);
    assert.equal(caps(role).canRequest, false, role);
    assert.equal(caps(role).canApprove, false, role);
  }
  assert.equal(caps('ceo', {}, false).canRequest, false, 'no MFA, no request');
  assert.equal(caps('ceo', {}, false).canApprove, false, 'no MFA, no approval');
  assert.equal(caps('ceo', { suspended: true }).canView, false, 'suspended sees nothing');
});

test('route guard: /finance/grants opens only for Super Admin, CEO and Finance Controller', () => {
  const user = (role, claims = {}) => ({ role, claims: { role, ...claims } });
  assert.equal(policy.FINANCE_GRANTS_PATH, '/finance/grants');
  assert.equal(policy.canAccessAdminPath(user('ceo', { ceo: true }), '/finance/grants'), true);
  assert.equal(policy.canAccessAdminPath(user('super_admin', { super_admin: true }), '/finance/grants'), true);
  assert.equal(policy.canAccessAdminPath(user('finance_controller', { finance_controller: true }), '/finance/grants'), true);
  for (const role of ['admin', 'finance_admin', 'finance_manager', 'finance_staff', 'hr_admin']) {
    assert.equal(policy.canAccessAdminPath(user(role, { admin: role === 'admin', modules: ['financials', 'transactions'] }), '/finance/grants'), false, role);
  }
  // Painting finance access is unchanged.
  assert.equal(policy.canAccessAdminPath(user('finance_controller', { finance_controller: true }), '/finance/painting-payments'), true);
  assert.equal(policy.canAccessAdminPath(user('finance_controller', { finance_controller: true }), '/dashboard'), false);
});

test('approve is disabled with a reason for requester, target, non-approver, expired and MFA-less viewers', () => {
  assert.equal(view.approveBlockReason(grant(), viewer(), true, NOW, t), '');
  assert.match(view.approveBlockReason(grant({ requesterId: 'second' }), viewer(), true, NOW, t), /different person/);
  assert.match(view.approveBlockReason(grant({ viewerIsRequester: true }), viewer(), true, NOW, t), /different person/);
  assert.match(view.approveBlockReason(grant({ targetUid: 'second' }), viewer(), true, NOW, t), /your own account/);
  assert.match(view.approveBlockReason(grant(), viewer({ canApprove: false }), true, NOW, t), /Super Admin, CEO or Finance Controller/);
  assert.match(view.approveBlockReason(grant(), viewer(), false, NOW, t), /MFA/);
  assert.match(view.approveBlockReason(grant({ isExpired: true }), viewer(), true, NOW, t), /expired/);
  assert.match(view.approveBlockReason(grant({ expiresAtMs: NOW }), viewer(), true, NOW, t), /expired/, 'exactly 24h is expired (server uses >=)');
  assert.match(view.approveBlockReason(grant({ expiresAtMs: null }), viewer(), true, NOW, t), /expired/, 'missing timestamp fails closed');
  assert.match(view.approveBlockReason(grant(), null, true, NOW, t), /Super Admin, CEO or Finance Controller/);
});

test('reject follows the server: never the requester; the target may reject', () => {
  assert.equal(view.rejectBlockReason(grant(), viewer(), true, NOW, t), '');
  assert.match(view.rejectBlockReason(grant({ requesterId: 'second' }), viewer(), true, NOW, t), /different person/);
  assert.equal(view.rejectBlockReason(grant({ targetUid: 'second', viewerIsTarget: true }), viewer(), true, NOW, t), '');
  assert.match(view.rejectBlockReason(grant(), viewer({ canApprove: false }), true, NOW, t), /Super Admin, CEO or Finance Controller/);
});

test('re-grant request button is disabled for self, inactive, non-explicit, already-pending and non-assigners', () => {
  const account = (overrides = {}) => ({
    uid: 'fa', email: 'fa@example.invalid', displayName: 'FA', role: 'finance_admin', status: 'ACTIVE', active: true,
    explicitClaim: true, totpEnrolled: true, financeApprovalPending: false, grantedAtMs: NOW - 30 * HOUR,
    grantAgeMs: 30 * HOUR, grantExpiresAtMs: NOW - 6 * HOUR, grantFresh: false, pendingRegrant: false,
    viewerIsTarget: false, viewerCanRequestRegrant: true, ...overrides,
  });
  const founder = viewer({ uid: 'founder', role: 'ceo' });
  assert.equal(view.regrantBlockReason(account(), founder, true, t), '');
  assert.match(view.regrantBlockReason(account({ uid: 'founder' }), founder, true, t), /yourself/);
  assert.match(view.regrantBlockReason(account({ active: false }), founder, true, t), /reactivation/);
  assert.match(view.regrantBlockReason(account({ explicitClaim: false }), founder, true, t), /assignment flow/);
  assert.match(view.regrantBlockReason(account({ pendingRegrant: true }), founder, true, t), /already waiting/);
  assert.match(view.regrantBlockReason(account(), viewer({ uid: 'fc', role: 'finance_controller', canRequest: false }), true, t), /Super Admin or CEO/);
  assert.match(view.regrantBlockReason(account(), founder, false, t), /MFA/);
});

test('labels and Dubai times', () => {
  const ar = (en, arText) => arText;
  assert.equal(view.roleLabel('finance_controller', t), 'Finance Controller');
  assert.equal(view.roleLabel('finance_controller', ar), 'المراقب المالي');
  assert.equal(view.roleLabel('finance_manager', ar), 'مدير المالية');
  assert.match(view.actionLabel('REGRANT_FINANCE_AUTHORITY', t), /Re-grant/);
  assert.match(view.actionLabel('REGRANT_FINANCE_AUTHORITY', ar), /تجديد/);
  assert.match(view.formatDubaiTime(Date.UTC(2026, 10, 18, 6, 0), false), /10:00.*\(Dubai\)/);
  assert.equal(view.formatDubaiTime(null, false), '—');
  assert.equal(view.formatDuration(90 * 60 * 1000, t), '1h 30m');
  assert.equal(view.formatDuration(-5 * 60 * 1000, t), '5m ago');
  assert.equal(view.FINANCE_GRANT_TTL_MS, 24 * HOUR);
});

test('screen wiring: thin wrapper over the two-person callables; no client-side grant or claim writes', () => {
  const page = fs.readFileSync('apps/admin-panel/src/pages/financials/FinanceGrantsPage.tsx', 'utf8');
  for (const name of ['adminListFinanceGrantOverview', 'adminRequestFinanceRoleAssignment', 'adminApproveFinanceRoleAssignment', 'adminRejectFinanceRoleAssignment']) {
    assert.ok(page.includes(`'${name}'`), name);
  }
  assert.match(page, /actionType: FINANCE_REGRANT_ACTION/);
  assert.match(page, /disabled=\{!approveConfirmed \|\| busy\}/, 'approve needs explicit independent-review confirmation');
  assert.doesNotMatch(page, /setCustomUserClaims|updateDoc|setDoc|addDoc|writeBatch|financeAuthorizedAt\s*:/);
  const app = fs.readFileSync('apps/admin-panel/src/App.tsx', 'utf8');
  assert.match(app, /<Route path="\/finance\/grants" element=\{<ProtectedRoute><FinanceGrantsPage \/><\/ProtectedRoute>\} \/>/);
});

test('server: re-grant keeps two-person rules, refreshes only financeAuthorizedAt and is consumed at approval', () => {
  const src = fs.readFileSync('functions/adminUserProvisioning.ts', 'utf8');
  assert.match(src, /export const FINANCE_REGRANT_ACTION = "REGRANT_FINANCE_AUTHORITY";/);
  // Same entry points and authority checks as every Finance grant.
  assert.match(src, /export const adminApproveFinanceRoleAssignment = onCall\(\{ cors: true, region: "europe-west3", enforceAppCheck: true \}, async \(request\) => \{\n  const \{ approverId, approverRole \} = await requireIndependentFinanceApprover\(request\);/);
  assert.match(src, /if \(approverId === authData\.requesterId\) \{\n\s+throw new HttpsError\("permission-denied", "Segregation of duties violation: the person requesting/);
  assert.match(src, /if \(approverId === authData\.targetUid\) \{\n\s+throw new HttpsError\("permission-denied", "Self-promotion\/demotion violation/);
  // Re-grant branch sits after the expiry and segregation checks.
  const expiryIndex = src.indexOf('const expiry = isAuthorizationExpired(authData.createdAt);\n      if (expiry.expired) {\n        expiredAuditPayload');
  const segregationIndex = src.indexOf('Segregation of duties violation: the person requesting the Finance role assignment cannot approve it.');
  const regrantIndex = src.indexOf('if (actionType === FINANCE_REGRANT_ACTION) {\n      if (!FINANCE_APPROVER_ROLES.has(targetRole) || liveTargetRole !== targetRole)');
  assert.ok(expiryIndex > 0 && segregationIndex > expiryIndex && regrantIndex > segregationIndex, 'expiry -> segregation -> re-grant');
  assert.match(src, /consumed: true,\n\s+consumedAt: now,\n\s+consumedBy: approverId,/);
  assert.match(src, /financeApprovalPending: false,\n\s+financeAuthorizedAt: Date\.now\(\),\n\s+\}\);/);
  // Overview is read-only, MFA-gated and limited to request/approve authorities.
  const overview = src.slice(src.indexOf('export const adminListFinanceGrantOverview'), src.indexOf('export const adminSetStaffStatus'));
  assert.match(overview, /enforceAppCheck: true/);
  assert.match(overview, /await requirePrivilegedMfaSession\(request\.auth\);/);
  assert.match(overview, /if \(!isFinanceTierAssigner\(token\) && !isIndependentFinanceApprover\(token\)\)/);
  assert.doesNotMatch(overview, /setCustomUserClaims|\.update\(|\)\.set\(|\.delete\(|runTransaction|updateUser\(/);
  // The TTL itself is unchanged.
  const mfa = fs.readFileSync('functions/financeAdminMfa.ts', 'utf8');
  assert.match(mfa, /FINANCE_AUTHORIZATION_TTL_MS = 24 \* 60 \* 60 \* 1000;/);
});

test('emulator coverage exists for self-approval refusal, expiry and the role matrix', () => {
  const src = fs.readFileSync('test/emulator-callables/finance-grant-screen.test.cjs', 'utf8');
  for (const marker of [
    'The requester can neither approve nor reject; the target cannot approve.',
    're-grant expires after 24 hours',
    'approval role matrix',
    'Request matrix: only Super Admin / CEO',
    'cannot be used to reactivate or change staff access',
  ]) assert.ok(src.includes(marker), marker);
});
