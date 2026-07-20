import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../../scripts/delete-obsolete-privileged-accounts-production.mjs', import.meta.url),
  'utf8',
);

test('privileged cleanup is exact-main production only and explicitly confirmed', () => {
  assert.match(source, /DELETE_ALL_OTHER_PRIVILEGED_ACCOUNTS_BIN_GROUP/);
  assert.match(source, /GITHUB_ACTIONS !== 'true'/);
  assert.match(source, /GITHUB_REF !== 'refs\/heads\/main'/);
  assert.match(source, /DEPLOYMENT_ENVIRONMENT/);
  assert.match(source, /CANONICAL_FOUNDER_EMAIL_CONFIRMATION/);
  assert.match(source, /GCP_PROJECT_ID must equal/);
});

test('cleanup refuses unless canonical founder is active, verified and phone-MFA ready', () => {
  assert.match(source, /canonical\.length !== 1/);
  assert.match(source, /founder\.disabled === true \|\| !profileActive\(founder\)/);
  assert.match(source, /founder\.emailVerified !== true/);
  assert.match(source, /!phoneMfaReady\(founder\)/);
  assert.match(source, /isCanonicalFounderAccount/);
});

test('cleanup targets only privileged claims and preserves audit evidence', () => {
  assert.match(source, /privileged = enriched\.filter\(\(user\) => claimsGrantAdminPortal/);
  assert.match(source, /targets = privileged\.filter\(\(user\) => !isCanonicalFounderAccount/);
  assert.match(source, /OBSOLETE_PRIVILEGED_ACCOUNT_DELETED/);
  assert.match(source, /auditLogsPreserved: true/);
  assert.match(source, /nonPrivilegedAccountsUntouched: true/);
  assert.match(source, /sensitiveValuesExcluded: true/);
  assert.doesNotMatch(source, /deleteUsers\(users\)|listUsers\([^)]*\).*deleteUser/s);
});

test('cleanup disables and revokes each target before profile and Auth deletion', () => {
  const disable = source.indexOf('updateUser(uid, { disabled: true })');
  const revoke = source.indexOf('revokeRefreshTokens(uid)');
  const profileDelete = source.indexOf('DIRECT_PROFILE_COLLECTIONS');
  const authDelete = source.indexOf('deleteUser(uid)');
  assert.ok(disable >= 0 && revoke > disable);
  assert.ok(profileDelete >= 0);
  assert.ok(authDelete > revoke);
  assert.match(source, /staffAccess/);
  assert.match(source, /hrProfiles/);
  assert.match(source, /admin_security_sessions/);
  assert.match(source, /notifications/);
});
