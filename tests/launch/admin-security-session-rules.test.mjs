import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hardener = await readFile(new URL('../../scripts/harden-final-firestore-authority.mjs', import.meta.url), 'utf8');
const authority = await readFile(new URL('../../functions/adminSecurityProfile.ts', import.meta.url), 'utf8');

test('Admin security sessions are isolated from generic Firestore access', () => {
  assert.ok(hardener.includes('match /admin_security_sessions/{sessionId}'));
  assert.ok(hardener.includes("'broker_kyc_submission_limits', 'admin_security_sessions'"));
  assert.match(hardener, /['"]audit_logs['"],\s*['"]admin_security_sessions['"]/);
  assert.ok(hardener.includes('Admin security session block must exist exactly once'));
});

test('Admin security sessions are managed by protected Cloud Functions', () => {
  assert.ok(authority.includes('registerAdminSecuritySession'));
  assert.ok(authority.includes('getAdminSecurityProfile'));
  assert.ok(authority.includes('revokeAdminSessions'));
  assert.ok(authority.includes('enforceAppCheck: true'));
  assert.ok(authority.includes('admin_security_sessions'));
});
