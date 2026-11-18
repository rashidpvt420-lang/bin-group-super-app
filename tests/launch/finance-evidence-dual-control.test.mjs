// Protected evidence after PR #2014: money steps use explicit Finance identities, never the Founder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FINANCE_AUTHORIZATION_TTL_MS,
  FINANCE_EVIDENCE_MIN_REMAINING_MS,
  assessFinanceEvidenceAccount,
  requireFreshFinanceEvidenceAccounts,
} from '../../scripts/lib/finance-evidence-preflight.mjs';
import { FINANCE_APPROVER_ROLES, signInFinanceApproverMfa } from '../../scripts/lib/finance-approver-mfa.mjs';
import { financeEvidenceAccounts, missingFinanceEvidenceSecrets } from '../../scripts/verify-finance-evidence-accounts.mjs';

const read = (path) => readFileSync(path, 'utf8');
const NOW = Date.UTC(2026, 10, 18, 6, 0, 0);
const HOUR = 3_600_000;
const user = (overrides = {}, claims = {}) => ({
  uid: 'finance-uid-0001', email: 'finance@example.invalid', emailVerified: true, disabled: false,
  multiFactor: { enrolledFactors: [{ factorId: 'totp' }] },
  customClaims: { role: 'finance_admin', financeAuthorizedAt: NOW - HOUR, modules: ['transactions', 'broker'], ...claims },
  ...overrides,
});
const assess = (record, options = {}) => assessFinanceEvidenceAccount(record, { label: 'Fixture', nowMs: NOW, ...options });

test('pre-flight TTL mirrors the server 24h financeAuthorizedAt rule and never relaxes it', () => {
  const server = read('functions/financeAdminMfa.ts');
  assert.match(server, /FINANCE_AUTHORIZATION_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(server, /FINANCE_AUTHORIZED_AT_CLAIM = "financeAuthorizedAt"/);
  assert.equal(FINANCE_AUTHORIZATION_TTL_MS, 24 * HOUR);
  assert.ok(FINANCE_EVIDENCE_MIN_REMAINING_MS > 0, 'margin only ever shortens the usable window');
});

test('fresh explicit Finance Admin with TOTP and modules passes', () => {
  const result = assess(user(), { allowedRoles: new Set(['finance_admin']), requiredModules: ['transactions', 'broker'] });
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.doesNotMatch(result.summary, /finance@example\.invalid/, 'summary masks the identity');
});

test('missing, malformed, expired, nearly expired and future grants are BLOCKED', () => {
  for (const [label, value] of [
    ['missing', undefined], ['null', null], ['malformed', 'not-a-date'],
    ['expired', NOW - 25 * HOUR], ['exactly 24h', NOW - 24 * HOUR],
    ['expires during run', NOW - 23 * HOUR], ['future', NOW + 10 * 60_000],
  ]) {
    const result = assess(user({}, { financeAuthorizedAt: value }));
    assert.equal(result.ok, false, label);
    assert.match(result.failures.join('\n'), /financeAuthorizedAt/, label);
  }
  assert.equal(assess(user({}, { financeAuthorizedAt: { _seconds: Math.floor((NOW - HOUR) / 1000), _nanoseconds: 0 } })).ok, true);
  assert.equal(assess(user({}, { financeAuthorizedAt: new Date(NOW - HOUR).toISOString() })).ok, true);
});

test('CEO, Super Admin and Admin never pass the Finance evidence pre-flight', () => {
  for (const claims of [
    { role: 'ceo' }, { role: 'super_admin' }, { role: 'admin' },
    { role: '', admin: true }, { role: '', superAdmin: true, ceo: true },
  ]) {
    const result = assess(user({}, claims));
    assert.equal(result.ok, false, JSON.stringify(claims));
    assert.match(result.failures.join('\n'), /no explicit Finance approver role/);
  }
});

test('disabled, unverified, suspended, no TOTP, wrong role slot and missing modules are BLOCKED', () => {
  assert.equal(assess(user({ disabled: true })).ok, false);
  assert.equal(assess(user({ emailVerified: false })).ok, false);
  assert.equal(assess(user({}, { suspended: true })).ok, false);
  assert.equal(assess(user({ multiFactor: { enrolledFactors: [{ factorId: 'phone' }] } })).ok, false);
  assert.equal(assess(user(), { allowedRoles: new Set(['finance_manager', 'finance_controller']) }).ok, false,
    'the receipt recorder may not be a second finance_admin (removed by privileged cleanup)');
  assert.equal(assess(user({}, { modules: ['transactions'] }), { requiredModules: ['transactions', 'broker'] }).ok, false);
  assert.equal(assess(null).ok, false);
});

test('pre-flight is read-only, requires two distinct people, and throws BLOCKED without secrets', async () => {
  const calls = [];
  const records = {
    'a@example.invalid': user({ uid: 'same-person', email: 'a@example.invalid' }, { role: 'finance_controller' }),
    'b@example.invalid': user({ uid: 'same-person', email: 'b@example.invalid' }),
  };
  const auth = new Proxy({}, {
    get: (_, name) => {
      if (name === 'getUserByEmail') return async (email) => { calls.push(name); return records[email]; };
      return () => { throw new Error(`write attempted: ${String(name)}`); };
    },
  });
  await assert.rejects(requireFreshFinanceEvidenceAccounts({
    auth, nowMs: NOW, log: () => undefined,
    accounts: [
      { label: 'Recorder', email: 'a@example.invalid', allowedRoles: new Set(['finance_controller']) },
      { label: 'Approver', email: 'b@example.invalid', allowedRoles: new Set(['finance_admin']) },
    ],
  }), (error) => /^BLOCKED:/.test(error.message) && /different person/.test(error.message));
  assert.deepEqual(calls, ['getUserByEmail', 'getUserByEmail']);
});

test('pre-flight CLI names missing secrets only and wires the two Finance roles', () => {
  const missing = missingFinanceEvidenceSecrets({ E2E_FINANCE_APPROVER_EMAIL: 'x', E2E_FINANCE_APPROVER_PASSWORD: 'y', E2E_FINANCE_APPROVER_TOTP_SECRET: 'z' });
  assert.deepEqual(missing, ['E2E_FINANCE_RECORDER_EMAIL', 'E2E_FINANCE_RECORDER_PASSWORD', 'E2E_FINANCE_RECORDER_TOTP_SECRET']);
  const [approver, recorder] = financeEvidenceAccounts({});
  assert.deepEqual([...approver.allowedRoles], ['finance_admin']);
  assert.deepEqual(approver.requiredModules, ['transactions', 'broker']);
  assert.deepEqual([...recorder.allowedRoles].sort(), ['finance_controller', 'finance_manager']);
  const runner = read('scripts/run-protected-business-evidence.mjs');
  assert.ok(runner.indexOf("run('scripts/verify-finance-evidence-accounts.mjs');") > 0);
  assert.ok(runner.indexOf("run('scripts/verify-finance-evidence-accounts.mjs');") < runner.indexOf('runCriticalBusinessEvidence(releaseId, 1)'));
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  for (const name of ['E2E_FINANCE_RECORDER_EMAIL', 'E2E_FINANCE_RECORDER_PASSWORD', 'E2E_FINANCE_RECORDER_TOTP_SECRET']) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
});

test('Finance approver sign-in helper matches the server role list exactly', async () => {
  const server = read('functions/financeAdminMfa.ts');
  assert.match(server, /FINANCE_ADMIN_ROLES = new Set\(\["finance_admin", "finance_manager", "finance_controller"\]\)/);
  assert.deepEqual([...FINANCE_APPROVER_ROLES], ['finance_admin', 'finance_manager', 'finance_controller']);
  const base = {
    uid: 'finance-b', email: 'reviewer@example.invalid', email_verified: true,
    firebase: { sign_in_second_factor: 'totp', second_factor_identifier: 'factor-b' },
  };
  const signIn = (decoded) => signInFinanceApproverMfa({
    apiKey: 'fixture-key', email: base.email, password: 'fixture-password', totpSecret: 'JBSWY3DPEHPK3PXP',
    recorderUid: 'finance-a', nowImpl: () => 30_001,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ idToken: 'fixture.token.signature' }) }),
    verifyIdTokenImpl: async () => decoded,
  });
  for (const claims of [{ role: 'ceo' }, { role: 'super_admin' }, { role: 'admin' }, { admin: true }, { isAdmin: true }, { superAdmin: true }, { super_admin: true }, { ceo: true }]) {
    await assert.rejects(signIn({ ...base, ...claims }), /Finance Admin authority/, JSON.stringify(claims));
  }
  for (const role of ['finance_admin', 'finance_manager', 'finance_controller']) {
    assert.equal((await signIn({ ...base, role })).uid, 'finance-b');
  }
});

test('Owner runner records the 15% receipt as Finance identity A and approves as distinct identity B', () => {
  const runner = read('scripts/run-owner-inspection-first-production-evidence.mjs');
  const record = runner.slice(runner.indexOf("callFunction('adminRecordOwnerMobilizationPaymentEvidence'"));
  assert.match(record.slice(0, record.indexOf(';')), /recorderSession\.idToken\)$/);
  assert.doesNotMatch(runner, /adminRecordOwnerMobilizationPaymentEvidence[\s\S]{0,400}founderSession\.idToken/);
  assert.match(runner, /callFunction\('adminApprovePayment', approvalPayload, appCheckToken, approverSession\.idToken\)/);
  assert.match(runner, /recorderUid: recorderSession\.uid/);
  assert.match(runner, /paymentEvidenceRecordedBy\) === recorderSession\.uid/);
  assert.match(runner, /BLOCKED: Owner 15% dual-control evidence needs a second, distinct Finance identity/);
  assert.ok(runner.indexOf('await requireFreshFinanceEvidenceAccounts(') < runner.indexOf('  await resetOwnerAccount();'),
    'read-only pre-flight runs before any evidence record is reset or created');
});

test('Admin proof keeps the Founder on non-money steps and moves every money step to a Finance Admin session', () => {
  const spec = read('tests/e2e/business-admin.spec.ts');
  assert.doesNotMatch(spec, /test\.skip|test\.fixme/);
  const founderGate = spec.indexOf("'Founder session must not be able to approve a payment'");
  const financeSwitch = spec.indexOf('page = financePage;');
  const approveClick = spec.indexOf("await activationRow.getByTestId('admin-payment-approve').click();");
  const returnClick = spec.indexOf('rejectPaymentRow.getByRole(');
  const founderPayoutGate = spec.indexOf("'Founder session must not be able to approve a broker payout'");
  const secondFinanceSwitch = spec.indexOf('page = financePage;', founderPayoutGate);
  const payoutApprove = spec.indexOf("await approvePayoutCard.getByRole('button', { name: 'Approve', exact: true }).click();");
  const markPaid = spec.indexOf("getByRole('button', { name: /Mark paid/i }).click()");
  const payoutReject = spec.indexOf("await rejectPayoutCard.getByRole('button', { name: 'Reject', exact: true }).click();");
  const backToFounder = spec.indexOf('page = founderPage;', payoutReject);
  for (const index of [founderGate, financeSwitch, approveClick, returnClick, founderPayoutGate, secondFinanceSwitch, payoutApprove, markPaid, payoutReject, backToFounder]) {
    assert.ok(index > 0);
  }
  assert.ok(founderGate < financeSwitch && financeSwitch < approveClick && approveClick < returnClick);
  assert.ok(returnClick < founderPayoutGate && founderPayoutGate < secondFinanceSwitch);
  assert.ok(secondFinanceSwitch < payoutApprove && payoutApprove < markPaid && markPaid < payoutReject && payoutReject < backToFounder);
  assert.match(spec, /toBeDisabled\(\{ timeout: 15_000 \}\)/);
  assert.match(spec, /Approve stays off until this session is Finance Admin, Finance Manager or Finance Controller with MFA\./);
  assert.match(spec, /admin-mfa-totp-selected'\), 'the Finance Admin proof requires the enrolled TOTP factor'/);
  assert.match(spec, /financeMonitor\.assertClean\(/);
});

test('payment approval gate copy no longer names Admin or CEO as approvers (EN and AR)', () => {
  for (const file of ['src/context/LanguageContext.tsx', 'packages/shared/src/context/LanguageContext.tsx']) {
    const src = read(file);
    const lines = src.split('\n').filter((line) => line.includes("'fin.payment_approval_gate'"));
    assert.equal(lines.length, 2, file);
    assert.match(lines[0], /Finance Admin, Finance Manager or Finance Controller/);
    assert.doesNotMatch(lines[0], /limited to Admin, CEO/);
    assert.match(lines[1], /المسؤول المالي أو المدير المالي أو المراقب المالي/);
    assert.doesNotMatch(lines[1], /مقتصرة على المسؤول والرئيس التنفيذي/);
  }
});
