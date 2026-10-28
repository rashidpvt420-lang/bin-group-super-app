// Email/password sign-ups must verify their address before choosing a portal role. The server rejects
// unverified password accounts and the UI shows a clear "verify your email" state with resend (no dead end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
const load = (p) => {
  const code = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, Number, String, Math };
  runInNewContext(code, sandbox);
  return sandbox.exports;
};
const gate = load('src/lib/emailVerificationGate.ts');

test('needsEmailVerification: only unverified password-only accounts are gated', () => {
  const pw = [{ providerId: 'password' }];
  assert.equal(gate.needsEmailVerification({ emailVerified: false, providerData: pw }), true);
  assert.equal(gate.needsEmailVerification({ emailVerified: true, providerData: pw }), false);
  assert.equal(gate.needsEmailVerification({ emailVerified: false, providerData: [{ providerId: 'google.com' }] }), false);
  assert.equal(gate.needsEmailVerification({ emailVerified: false, providerData: [{ providerId: 'phone' }] }), false);
  assert.equal(gate.needsEmailVerification({ emailVerified: false, providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] }), false);
  assert.equal(gate.needsEmailVerification({ emailVerified: false, providerData: [] }), false);
  assert.equal(gate.needsEmailVerification(null), false);
});

test('isEmailNotVerifiedError reads the callable error reason', () => {
  assert.equal(gate.isEmailNotVerifiedError({ code: 'functions/failed-precondition', details: { reason: 'email_not_verified' } }), true);
  assert.equal(gate.isEmailNotVerifiedError({ code: 'functions/failed-precondition', details: { reason: 'other' } }), false);
  assert.equal(gate.isEmailNotVerifiedError(new Error('x')), false);
  assert.equal(gate.isEmailNotVerifiedError(null), false);
});

test('resend cooldown counts down and never goes negative', () => {
  assert.equal(gate.verificationResendRemaining(null, 1000), 0);
  assert.equal(gate.verificationResendRemaining(1000, 1000), gate.VERIFICATION_RESEND_COOLDOWN_MS);
  assert.equal(gate.verificationResendRemaining(1000, 1000 + gate.VERIFICATION_RESEND_COOLDOWN_MS), 0);
  assert.equal(gate.verificationResendRemaining(1000, 1000 + gate.VERIFICATION_RESEND_COOLDOWN_MS + 5000), 0);
  assert.equal(gate.verificationResendRemaining(9999999, 1000), 0, 'future timestamps do not lock the button');
});

test('assignPublicPortalRole enforces email verification after the privileged-claims checks, google/phone untouched', () => {
  const server = read('functions/publicRoleAssignment.ts');
  assert.match(server, /assertEmailVerifiedForPasswordSignIn\(/);
  assert.ok(server.indexOf('assertEmailVerifiedForPasswordSignIn(') > server.indexOf('claimedRole'), 'same-role re-selection stays idempotent');
  const helper = read('functions/publicRoleEmailVerification.ts');
  assert.match(helper, /failed-precondition/);
  assert.match(helper, /email_not_verified/);
  assert.match(helper, /password/);
  assert.match(helper, /getUser|userRecord/);
  // The helper module must not be re-exported blindly into runtime.ts as extra callables.
  assert.doesNotMatch(helper, /onCall\(/);
});

test('RoleGatewayPage: verify-your-email state with resend/recheck, and error mapping before role-conflict messages', () => {
  const page = read('src/pages/RoleGatewayPage.tsx');
  assert.match(page, /data-testid="gateway-verify-email"/);
  assert.match(page, /sendEmailVerification\(/);
  assert.match(page, /getIdToken\(true\)/);
  assert.match(page, /needsEmailVerification\(/);
  assert.match(page, /verificationResendRemaining\(/);
  assert.match(page, /isEmailNotVerifiedError\(/);
  assert.ok(page.indexOf('isEmailNotVerifiedError(error') < page.indexOf('different portal role'), 'email_not_verified must be mapped before the generic failed-precondition message');
  // role buttons still call the callable only after the gate
  const select = page.slice(page.indexOf('const handleRoleSelect'));
  assert.ok(select.indexOf('needsEmailVerification(') < select.indexOf('assignPublicPortalRole'), 'client gate runs before the callable');
});
