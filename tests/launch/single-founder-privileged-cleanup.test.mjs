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

test('destructive cleanup is restricted to the dedicated owner cleanup workflow', () => {
  assert.match(source, /DEPLOY_WORKFLOW_NAME = 'Firebase Production Deploy'/);
  assert.match(source, /OWNER_CLEANUP_WORKFLOW_NAME = 'Privileged Account Cleanup - Production'/);
  assert.match(source, /workflowName === DEPLOY_WORKFLOW_NAME\) return 'deploy-preflight'/);
  assert.match(source, /workflowName === OWNER_CLEANUP_WORKFLOW_NAME\) return 'owner-cleanup'/);
  assert.match(source, /Destructive privileged-account cleanup is restricted to/);
  assert.match(source, /executionMode === 'owner-cleanup'/);
});

test('Firebase production deployment performs guarded preflight after retiring only the configured E2E Admin', () => {
  const e2eRetirement = source.indexOf("phase: 'predeploy'");
  const inventory = source.indexOf('const users = await fetchAllAuthUsers');
  const deployPreflight = source.indexOf("executionMode === 'deploy-preflight'");
  const ownerCleanup = source.indexOf("executionMode === 'owner-cleanup'", deployPreflight + 1);
  const purgeTarget = source.indexOf('purgePrivilegedTarget({', ownerCleanup);

  assert.ok(e2eRetirement >= 0);
  assert.ok(inventory > e2eRetirement);
  assert.ok(deployPreflight >= 0);
  assert.ok(ownerCleanup > deployPreflight);
  assert.ok(purgeTarget > ownerCleanup);
  assert.match(source, /requiresOwnerCleanup: executionMode === 'deploy-preflight'/);
  assert.match(source, /No unexpected privileged identity was modified/);
  assert.match(source, /ephemeralE2eAdminDeletedAccountCount/);
  assert.match(source, /mutation_performed=false/);
  assert.match(source, /\/bin-launch execute-privileged-cleanup/);
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
