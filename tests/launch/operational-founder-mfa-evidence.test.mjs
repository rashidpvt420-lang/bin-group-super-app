import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signInWithRequiredTotpMfa } from '../../scripts/lib/firebase-mfa-sign-in.mjs';

const workflow = readFileSync('.github/workflows/operational-application-evidence.yml', 'utf8');
const verifier = readFileSync('scripts/verify-operational-application-evidence.mjs', 'utf8');
const provenance = readFileSync('scripts/verify-operational-application-provenance.mjs', 'utf8');
const helper = readFileSync('scripts/lib/firebase-mfa-sign-in.mjs', 'utf8');

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('canonical Founder operational evidence completes a real Firebase TOTP challenge', async () => {
  const requests = [];
  const idToken = jwt({
    user_id: 'founder-uid',
    firebase: { sign_in_second_factor: 'totp-enrollment-id' },
  });
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(String(options.body || '{}')) });
    if (String(url).includes('accounts:signInWithPassword')) {
      return response({
        mfaPendingCredential: 'pending-credential',
        mfaInfo: [{ mfaEnrollmentId: 'totp-enrollment-id', totpInfo: {} }],
      });
    }
    if (String(url).includes('mfaSignIn:finalize')) return response({ idToken });
    return response({}, 404);
  };

  const result = await signInWithRequiredTotpMfa({
    apiKey: 'firebase-api-key',
    email: 'ceo@bin-groups.com',
    password: 'protected-password',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    fetchImpl,
  });

  assert.equal(result.uid, 'founder-uid');
  assert.equal(result.secondFactor, 'totp-enrollment-id');
  assert.equal(result.idToken, idToken);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.email, 'ceo@bin-groups.com');
  assert.equal(requests[1].body.mfaPendingCredential, 'pending-credential');
  assert.equal(requests[1].body.mfaEnrollmentId, 'totp-enrollment-id');
  assert.match(requests[1].body.totpVerificationInfo.verificationCode, /^\d{6}$/);
});

test('Founder MFA helper refuses a direct token without a verified second factor', async () => {
  const directToken = jwt({ user_id: 'founder-uid', firebase: {} });
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: 'firebase-api-key',
      email: 'ceo@bin-groups.com',
      password: 'protected-password',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      fetchImpl: async () => response({ idToken: directToken }),
    }),
    /verified second-factor session/,
  );
});

test('malformed Firebase provider responses never enter error diagnostics', async () => {
  const malformed = {
    ok: false,
    status: 502,
    async json() { throw new Error('sensitive-pending-credential'); },
  };
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: 'firebase-api-key',
      email: 'ceo@bin-groups.com',
      password: 'protected-password',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      fetchImpl: async () => malformed,
    }),
    (error) => {
      assert.match(error.message, /HTTP 502/);
      assert.doesNotMatch(error.message, /sensitive-pending-credential/);
      return true;
    },
  );
});

test('operational evidence workflow injects only protected canonical Founder MFA credentials', () => {
  for (const name of [
    'E2E_FOUNDER_EMAIL',
    'E2E_FOUNDER_PASSWORD',
    'E2E_FOUNDER_TOTP_SECRET',
  ]) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /production_deploy_run_id/);
});

test('operational payment and commission replays are bound to the verified second factor', () => {
  assert.match(verifier, /signInWithRequiredTotpMfa/);
  assert.match(verifier, /email !== 'ceo@bin-groups\.com'/);
  assert.match(verifier, /secondFactorHash:\s*sha256\(auth\.secondFactor\)/);
  assert.doesNotMatch(verifier, /E2E_ADMIN_EMAIL\)\.toLowerCase\(\)/);
});

test('operational provenance scans every matching page instead of silently stopping at 100 records', () => {
  assert.match(provenance, /const PAGE_SIZE = 250/);
  assert.match(provenance, /readAllMatchingDocuments/);
  assert.match(provenance, /FieldPath\.documentId\(\)/);
  assert.match(provenance, /startAfter\(cursor\)/);
  assert.match(provenance, /scannedDocumentCount/);
  assert.doesNotMatch(provenance, /query\.limit\(100\)/);
});

test('Founder MFA helper never serializes raw provider response bodies', () => {
  assert.doesNotMatch(helper, /response\.text\(\)/);
  assert.doesNotMatch(helper, /raw:\s*raw/);
  assert.doesNotMatch(helper, /console\.(?:log|error|warn)/);
  assert.match(helper, /providerError/);
});
