import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signInFinanceApproverMfa } from '../../scripts/lib/finance-approver-mfa.mjs';

const verified = {
  uid: 'finance-b', email: 'reviewer@example.invalid', email_verified: true, role: 'finance_admin',
  firebase: { sign_in_second_factor: 'totp', second_factor_identifier: 'factor-b' },
};
const options = {
  apiKey: 'fixture-key', email: verified.email, password: 'fixture-password',
  totpSecret: 'JBSWY3DPEHPK3PXP', recorderUid: 'finance-a', nowImpl: () => 30_001,
};
const response = (payload) => ({ ok: true, status: 200, json: async () => payload });

test('Finance reviewer completes a genuine TOTP challenge and verifies the distinct identity', async () => {
  const requests = [];
  const session = await signInFinanceApproverMfa({ ...options,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return response(requests.length === 1
        ? { mfaPendingCredential: 'fixture-challenge', mfaInfo: [{ totpInfo: {}, mfaEnrollmentId: 'factor-b' }] }
        : { idToken: 'fixture.token.signature' });
    },
    verifyIdTokenImpl: async (token, revoked) => {
      assert.equal(token, 'fixture.token.signature'); assert.equal(revoked, true); return verified;
    },
  });
  assert.equal(session.uid, 'finance-b');
  assert.equal(session.secondFactorType, 'totp');
  assert.match(requests[1].body.totpVerificationInfo.verificationCode, /^\d{6}$/);
  assert.equal(requests[1].body.mfaEnrollmentId, 'factor-b');
});

test('Finance reviewer refuses missing configuration before sending any request', async () => {
  let calls = 0;
  await assert.rejects(signInFinanceApproverMfa({ ...options, password: '', fetchImpl: async () => { calls++; } }), /required/);
  assert.equal(calls, 0);
});

test('Finance reviewer rejects same UID, wrong identity, missing MFA, wrong role, suspension and revoked token', async () => {
  for (const decoded of [
    { ...verified, uid: options.recorderUid }, { ...verified, email: 'other@example.invalid' },
    { ...verified, email_verified: false }, { ...verified, role: 'operations_admin' },
    { ...verified, suspended: true }, { ...verified, firebase: {} },
    { ...verified, firebase: { sign_in_second_factor: 'totp' } },
  ]) {
    await assert.rejects(signInFinanceApproverMfa({ ...options,
      fetchImpl: async () => response({ idToken: 'fixture.token.signature' }),
      verifyIdTokenImpl: async () => decoded,
    }));
  }
  await assert.rejects(signInFinanceApproverMfa({ ...options,
    fetchImpl: async () => response({ idToken: 'fixture.token.signature' }),
    verifyIdTokenImpl: async () => { throw new Error('revoked'); },
  }), /Firebase rejected/);
});

test('Finance reviewer refuses a token bound to a different TOTP challenge', async () => {
  let count = 0;
  await assert.rejects(signInFinanceApproverMfa({ ...options,
    fetchImpl: async () => response(++count === 1
      ? { mfaPendingCredential: 'fixture-challenge', mfaInfo: [{ totpInfo: {}, mfaEnrollmentId: 'other-factor' }] }
      : { idToken: 'fixture.token.signature' }),
    verifyIdTokenImpl: async () => verified,
  }), /challenge binding/);
});

test('Admin recording stops before approval; evidence runner uses a second MFA identity before changing records', () => {
  const page = readFileSync('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx', 'utf8');
  const recorded = page.indexOf('await recordEvidence(');
  const approval = page.indexOf("httpsCallable(functions, 'adminApprovePayment')", recorded);
  assert.match(page.slice(recorded, approval), /second Finance Admin/);
  assert.match(page.slice(recorded, approval), /return;/);
  const runner = readFileSync('scripts/run-owner-inspection-first-production-evidence.mjs', 'utf8');
  assert.ok(runner.indexOf('const approverSession =') < runner.indexOf('  await resetOwnerAccount();'));
  assert.match(runner, /callFunction\('adminApprovePayment', approvalPayload, appCheckToken, approverSession\.idToken\)/);
  assert.doesNotMatch(runner, /callFunction\('adminApprovePayment', approvalPayload, appCheckToken, founderSession\.idToken\)/);
});
