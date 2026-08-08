import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  validateEphemeralE2eAdminIdentity,
} from '../../scripts/e2e-admin-lifecycle.mjs';

const lifecycleSource = await readFile(
  new URL('../../scripts/e2e-admin-lifecycle.mjs', import.meta.url),
  'utf8',
);
const cleanupSource = await readFile(
  new URL('../../scripts/delete-obsolete-privileged-accounts-production.mjs', import.meta.url),
  'utf8',
);
const criticalEvidenceSource = await readFile(
  new URL('../../scripts/run-critical-evidence.mjs', import.meta.url),
  'utf8',
);
const liveAuditSource = await readFile(
  new URL('../../scripts/run-live-launch-audit.mjs', import.meta.url),
  'utf8',
);
const seedSource = await readFile(
  new URL('../../scripts/seed-e2e-auth.mjs', import.meta.url),
  'utf8',
);

function validIdentity() {
  return {
    configuredEmail: 'e2e-admin@example.test',
    authUser: {
      uid: 'e2e-admin-uid',
      email: 'e2e-admin@example.test',
      customClaims: { admin: true, role: 'admin', testAccount: true },
    },
    profile: {
      uid: 'e2e-admin-uid',
      email: 'e2e-admin@example.test',
      role: 'admin',
      testAccount: true,
    },
  };
}

test('ephemeral E2E Admin identity requires matching Auth and Firestore test markers', () => {
  const identity = validateEphemeralE2eAdminIdentity(validIdentity());
  assert.equal(identity.uid, 'e2e-admin-uid');
  assert.equal(identity.email, 'e2e-admin@example.test');
  assert.match(identity.identityHash, /^[0-9a-f]{64}$/);

  const missingAuthMarker = validIdentity();
  delete missingAuthMarker.authUser.customClaims.testAccount;
  assert.throws(
    () => validateEphemeralE2eAdminIdentity(missingAuthMarker),
    /exact testAccount\/admin Auth markers/,
  );

  const missingProfileMarker = validIdentity();
  missingProfileMarker.profile.testAccount = false;
  assert.throws(
    () => validateEphemeralE2eAdminIdentity(missingProfileMarker),
    /exact Firestore testAccount\/admin markers/,
  );

  const mismatchedProfile = validIdentity();
  mismatchedProfile.profile.uid = 'different-uid';
  assert.throws(
    () => validateEphemeralE2eAdminIdentity(mismatchedProfile),
    /profile does not match the Auth identity/,
  );
});

test('ephemeral lifecycle can never target the canonical Founder', () => {
  const founder = validIdentity();
  founder.configuredEmail = 'ceo@bin-groups.com';
  founder.authUser.email = 'ceo@bin-groups.com';
  founder.profile.email = 'ceo@bin-groups.com';
  assert.throws(
    () => validateEphemeralE2eAdminIdentity(founder),
    /Canonical Founder protection/,
  );

  assert.match(lifecycleSource, /E2E_ADMIN_EMAIL must never equal the canonical Founder email/);
  assert.match(lifecycleSource, /canonicalFounderProtected: true/);
  assert.match(lifecycleSource, /sensitiveValuesExcluded: true/);
  assert.match(lifecycleSource, /targetIdentityHash/);
  assert.doesNotMatch(lifecycleSource, /targetEmail:/);
  assert.doesNotMatch(lifecycleSource, /targetUid:/);
});

test('deploy preflight retires only the configured ephemeral Admin before inventory', () => {
  const retirement = cleanupSource.indexOf("phase: 'predeploy'");
  const inventory = cleanupSource.indexOf('const users = await fetchAllAuthUsers');
  assert.ok(retirement >= 0, 'deploy preflight must invoke the E2E Admin lifecycle');
  assert.ok(inventory > retirement, 'ephemeral Admin retirement must precede privileged inventory');
  assert.match(cleanupSource, /ephemeralE2eAdminDeletedAccountCount/);
  assert.match(cleanupSource, /No unexpected privileged identity was modified/);
});

test('business evidence always retires the ephemeral Admin even when a suite fails', () => {
  const tryIndex = criticalEvidenceSource.indexOf('try {');
  const finallyIndex = criticalEvidenceSource.indexOf('} finally {', tryIndex);
  const cleanupIndex = criticalEvidenceSource.indexOf("retireEphemeralE2eAdmin('post-business-evidence')");
  assert.ok(tryIndex >= 0);
  assert.ok(finallyIndex > tryIndex);
  assert.ok(cleanupIndex > finallyIndex);
  assert.match(criticalEvidenceSource, /DEPLOYMENT_ENVIRONMENT: 'production'/);
});

test('live launch audit recreates the Admin for evidence and retires it in finally', () => {
  const seedIndex = liveAuditSource.indexOf("['scripts/seed-gate11-fixtures.mjs']");
  const auditIndex = liveAuditSource.indexOf("['scripts/run-critical-evidence.mjs', '--suite', 'launchAuditLive']");
  const finallyIndex = liveAuditSource.indexOf('} finally {');
  const cleanupIndex = liveAuditSource.indexOf("'--phase=post-launch-audit'");
  assert.ok(seedIndex >= 0);
  assert.ok(auditIndex > seedIndex);
  assert.ok(finallyIndex > auditIndex);
  assert.ok(cleanupIndex > finallyIndex);
});

test('E2E seeding refuses Founder and cross-role email collisions', () => {
  assert.match(seedSource, /E2E role accounts must never use the canonical Founder email/);
  assert.match(seedSource, /Every E2E role must use a distinct email address/);
  assert.match(seedSource, /Duplicate variable groups/);
  assert.match(seedSource, /E2E Technician B must use a distinct non-Founder email address/);
  assert.match(seedSource, /claims: \{ admin: true, role: 'admin', testAccount: true \}/);
});
