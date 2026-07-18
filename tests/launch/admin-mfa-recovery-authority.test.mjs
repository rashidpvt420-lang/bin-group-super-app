import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Admin MFA recovery requires two distinct MFA-verified privileged approvers', async () => {
  const source = await read('functions/adminMfaRecovery.ts');
  expectAll(source, [
    /RECOVERY_APPROVER_ROLES = new Set\(\["ceo", "super_admin"\]\)/,
    /enforceAppCheck: true/,
    /recovery approver must have enrolled MFA/,
    /verified second-factor Admin sign-in is required/,
    /An Admin cannot initiate MFA recovery for their own account/,
    /The first approver cannot provide the second approval/,
    /The second approver cannot be the target Admin/,
    /twoDistinctApprovers: true/,
    /RECOVERY_TTL_MS = 30 \* 60 \* 1000/,
  ], 'two-approver recovery authority');
});

test('Recovery binds the target factor state and forces token revocation and re-enrollment', async () => {
  const source = await read('functions/adminMfaRecovery.ts');
  expectAll(source, [
    /factorStateHash: state\.hash/,
    /currentState\.hash !== expectedHash/,
    /multiFactor: \{ enrolledFactors: null \}/,
    /revokeRefreshTokens\(targetUid\)/,
    /adminMfaRecoveryRequired: true/,
    /adminMfaRecoveryState: "RESET_COMPLETED_REENROLL_REQUIRED"/,
    /action: "ADMIN_MFA_RECOVERY_EXECUTED"/,
    /refreshTokensRevoked: true/,
    /reEnrollmentRequired: true/,
    /sensitiveValuesExcluded: true/,
  ], 'factor reset and re-enrollment');
  assert.doesNotMatch(source, /verificationCode|smsCode|otpCode|factorPhoneNumber/);
});

test('Re-enrollment finalizes the Admin recovery lifecycle', async () => {
  const [backend, enrollment] = await Promise.all([
    read('functions/adminMfaRecovery.ts'),
    read('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx'),
  ]);
  expectAll(backend, [
    /export const finalizeOwnAdminMfaRecovery = onCall/,
    /Enroll a new Firebase MFA factor before finalizing recovery/,
    /adminMfaRecoveryRequired: false/,
    /adminMfaRecoveryState: "REENROLLED"/,
    /action: "ADMIN_MFA_RECOVERY_REENROLLED"/,
  ], 're-enrollment finalization');
  assert.match(enrollment, /httpsCallable\(functions, 'finalizeOwnAdminMfaRecovery'\)/);
  assert.ok(enrollment.indexOf('multiFactor(user).enroll') < enrollment.indexOf('finalizeOwnAdminMfaRecovery'), 'Firebase enrollment must complete before recovery finalization');
});

test('Recovery console is callable-only, bilingual and visible only to CEO or Super Admin navigation', async () => {
  const [page, app, navigation, runtime] = await Promise.all([
    read('apps/admin-panel/src/pages/settings/AdminMfaRecoveryPage.tsx'),
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/components/Navigation.tsx'),
    read('functions/runtime.ts'),
  ]);
  expectAll(page, [
    /data-testid="admin-mfa-recovery-page"/,
    /createAdminMfaRecoveryRequest/,
    /listAdminMfaRecoveryRequests/,
    /approveAdminMfaRecoveryRequest/,
    /[\u0600-\u06FF]/,
    /dir=\{isRTL \? 'rtl' : 'ltr'\}/,
  ], 'recovery console');
  assert.doesNotMatch(page, /\baddDoc\s*\(|\bsetDoc\s*\(|\bupdateDoc\s*\(/);
  assert.match(app, /path="\/mfa-recovery" element=\{<ProtectedRoute adminOnly><AdminMfaRecoveryPage \/><\/ProtectedRoute>\}/);
  assert.match(navigation, /isRecoveryApprover = user\?\.role === 'ceo' \|\| user\?\.role === 'super_admin'/);
  assert.match(navigation, /path: '\/mfa-recovery'/);
  assert.match(runtime, /export \* from "\.\/adminMfaRecovery";/);
});
