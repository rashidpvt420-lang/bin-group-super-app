import test from 'node:test';
import assert from 'node:assert/strict';
import {
  passwordStrength, resendCooldownRemaining, existingRoleConflict, roleConflictMessage, initialOwnerSection,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '../src/components/onboarding/ownerAccountRules.ts';


test('password strength: only the 8-character minimum blocks', () => {
  assert.equal(passwordStrength('').meetsMinimum, false);
  assert.equal(passwordStrength('Ab1!xyz').meetsMinimum, false);
  assert.ok(passwordStrength('Ab1!xyz').score <= 1);
  assert.equal(passwordStrength('abcdefgh').meetsMinimum, true);
  assert.equal(passwordStrength('Abcdefgh1234!').score, 4);
});

test('verification resend cooldown', () => {
  const now = 1_000_000;
  assert.equal(resendCooldownRemaining(null, now), 0);
  assert.equal(resendCooldownRemaining(now - VERIFICATION_RESEND_COOLDOWN_MS - 1, now), 0);
  assert.equal(resendCooldownRemaining(now - 10_000, now), VERIFICATION_RESEND_COOLDOWN_MS - 10_000);
  assert.equal(resendCooldownRemaining(now + 5_000, now), 0, 'future timestamps never lock the button');
});

test('other portal roles are refused for owner onboarding', () => {
  assert.equal(existingRoleConflict(''), null);
  assert.equal(existingRoleConflict('Owner'), null);
  assert.equal(existingRoleConflict('tenant'), 'tenant');
  assert.equal(existingRoleConflict('technician'), 'technician');
  assert.match(roleConflictMessage('tenant', 'en'), /registered as a tenant account/);
  assert.match(roleConflictMessage('tenant', 'ar'), /مستأجر/);
});

test('page 1 resumes at the account section when an account exists', () => {
  assert.equal(initialOwnerSection(1, null, true), 1);
  assert.equal(initialOwnerSection(1, null, false), 0);
  assert.equal(initialOwnerSection(2, null, true), 0);
  assert.equal(initialOwnerSection(2, 2, true), 2);
});

