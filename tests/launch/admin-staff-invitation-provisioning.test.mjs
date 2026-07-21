import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../functions/adminUserProvisioning.ts', import.meta.url),
  'utf8',
);

test('staff and technician creation queues secure first-login invitations', () => {
  assert.match(source, /generateEmailVerificationLink\s*\(/);
  assert.match(source, /generatePasswordResetLink\s*\(/);
  assert.match(source, /db\.collection\("mail"\)\.doc\(\)/);
  assert.match(source, /staff-account-invitation-v2/);
  assert.match(source, /delivery:\s*\{\s*state:\s*"QUEUED"\s*\}/);
  assert.match(source, /role === "technician"[^\n]*login\?role=technician/);
  assert.match(source, /bin-group-admin-panel\.web\.app/);
});

test('creation is create-only and rejects client passwords and existing identities', () => {
  assert.match(source, /assertNoExistingIdentity\(email\)/);
  assert.match(source, /getUserByEmail\(email\)[\s\S]*already-exists/);
  assert.match(source, /db\.collection\("users"\)\.where\("email", "==", email\)/);
  assert.match(source, /Client-supplied passwords are prohibited/);
  assert.match(source, /password:\s*generatedBootstrapPassword\(\)/);
  assert.match(source, /tx\.create\(db\.collection\("users"\)\.doc\(uid\)/);
  assert.match(source, /deleteUser\(uid\)/);
});

test('provisioning is App Check protected and never returns invitation bearer links', () => {
  const callableCount = source.match(/enforceAppCheck:\s*true/g)?.length || 0;
  assert.ok(callableCount >= 3, `expected at least three App Check-protected staff callables, got ${callableCount}`);
  assert.match(source, /invitationQueued:\s*true/);

  const createReturnStart = source.indexOf('return { success: true, uid, role, modules, invitationQueued: true');
  assert.ok(createReturnStart >= 0, 'create result block missing');
  const createReturn = source.slice(createReturnStart, source.indexOf('};', createReturnStart) + 2);
  assert.doesNotMatch(createReturn, /passwordResetLink|emailVerificationLink|password|bootstrap/i);
});

test('invitation audit stores hashes and provenance without identity links or passwords', () => {
  assert.match(source, /action:\s*"ADMIN_CREATE_STAFF_USER"/);
  assert.match(source, /emailHash:\s*hashValue\(email\)/);
  assert.match(source, /invitationMailId:\s*invitationRef\.id/);
  assert.match(source, /privateHrSeparated:\s*true/);

  const auditStart = source.indexOf('action: "ADMIN_CREATE_STAFF_USER"');
  const auditEnd = source.indexOf('createdAt: now,', auditStart);
  const auditBlock = source.slice(auditStart, auditEnd);
  assert.doesNotMatch(auditBlock, /passwordResetLink|emailVerificationLink|password:/);
  assert.doesNotMatch(auditBlock, /\bemail,\s*role/);
});

test('access updates and suspension use separate rollback-aware authorities', () => {
  assert.match(source, /export const adminUpdateStaffAccess = onCall/);
  assert.match(source, /export const adminSetStaffStatus = onCall/);
  assert.match(source, /setCustomUserClaims\(uid, previousClaims\)/);
  assert.match(source, /updateUser\(uid, \{ disabled: previousDisabled \}\)/);
  assert.match(source, /revokeRefreshTokens\(uid\)/);
  assert.match(source, /Technician identities cannot be converted to or from Admin-portal staff roles/);
});
