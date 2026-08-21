import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../functions/adminUserProvisioning.ts', import.meta.url),
  'utf8',
);

const createStart = source.indexOf('export const adminCreateUser = onCall');
const createEnd = source.indexOf('export const adminUpdateStaffAccess = onCall', createStart);
assert.ok(createStart >= 0 && createEnd > createStart, 'adminCreateUser implementation block is missing');
const createBlock = source.slice(createStart, createEnd);

test('staff and technician creation queues secure first-login invitations', () => {
  assert.match(createBlock, /generateEmailVerificationLink\s*\(/);
  assert.match(createBlock, /generatePasswordResetLink\s*\(/);
  assert.match(createBlock, /db\.collection\("mail"\)\.doc\(\)/);
  assert.match(createBlock, /template:\s*"staff-account-invitation-v3"/);
  assert.match(createBlock, /delivery:\s*\{\s*state:\s*"QUEUED"\s*\}/);
  assert.match(source, /role === "technician"[^\n]*login\?role=technician/);
  assert.match(source, /bin-group-admin-panel\.web\.app/);
  assert.match(createBlock, /onboardingStage:\s*"INVITED"/);
  assert.match(createBlock, /onboardingComplete:\s*false/);
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
  assert.match(createBlock, /invitationQueued:\s*true/);

  const createReturnStart = createBlock.lastIndexOf('return {');
  assert.ok(createReturnStart >= 0, 'create result block missing');
  const createReturnEnd = createBlock.indexOf('};', createReturnStart);
  assert.ok(createReturnEnd > createReturnStart, 'create result block is not terminated');
  const createReturn = createBlock.slice(createReturnStart, createReturnEnd + 2);

  assert.match(createReturn, /success:\s*true/);
  assert.match(createReturn, /invitationQueued:\s*true/);
  assert.match(createReturn, /onboardingStage:\s*"INVITED"/);
  assert.match(createReturn, /onboardingComplete:\s*false/);
  assert.doesNotMatch(createReturn, /passwordResetLink|emailVerificationLink|bootstrap|password\s*:/i);
});

test('invitation audit stores hashes and provenance without identity links or passwords', () => {
  assert.match(source, /action:\s*"ADMIN_CREATE_STAFF_USER"/);
  assert.match(source, /emailHash:\s*hashValue\(email\)/);
  assert.match(source, /invitationMailId:\s*invitationRef\.id/);
  assert.match(source, /privateHrSeparated:\s*true/);
  assert.match(source, /onboardingStage:\s*"INVITED"/);
  assert.match(source, /onboardingComplete:\s*false/);

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