import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../functions/adminUserProvisioning.ts', import.meta.url),
  'utf8',
);

test('staff and technician provisioning queues secure first-login invitations', () => {
  assert.match(source, /generateEmailVerificationLink\s*\(/);
  assert.match(source, /generatePasswordResetLink\s*\(/);
  assert.match(source, /db\.collection\("mail"\)\.doc\(\)/);
  assert.match(source, /staff-account-invitation-v1/);
  assert.match(source, /delivery:\s*\{\s*state:\s*"QUEUED"\s*\}/);
  assert.match(source, /role === "technician"[\s\S]*login\?role=technician/);
  assert.match(source, /bin-group-admin-panel\.web\.app/);
});

test('provisioning remains fail-closed and never returns invitation bearer links', () => {
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /if \(createdAuthUser\)[\s\S]*deleteUser\(uid\)/);
  assert.match(source, /payload\.tempPassword/);
  assert.match(source, /invitationQueued/);

  const returnBlock = source.slice(source.lastIndexOf('return {'));
  assert.doesNotMatch(returnBlock, /passwordResetLink|emailVerificationLink/);
});

test('invitation audit records provenance without storing action links in audit metadata', () => {
  assert.match(source, /action:\s*"ADMIN_CREATE_STAFF_USER"/);
  assert.match(source, /invitationMailId:\s*invitationRef\?\.id \|\| null/);

  const auditBlockStart = source.indexOf('action: "ADMIN_CREATE_STAFF_USER"');
  const auditBlockEnd = source.indexOf('createdAt: now,', auditBlockStart);
  const auditBlock = source.slice(auditBlockStart, auditBlockEnd);
  assert.doesNotMatch(auditBlock, /passwordResetLink|emailVerificationLink/);
});
