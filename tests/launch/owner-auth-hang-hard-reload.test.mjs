import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainRoleContext = readFileSync(
  new URL('../../src/context/RoleContext.tsx', import.meta.url),
  'utf8',
);
const ownerRoleContext = readFileSync(
  new URL('../../apps/owner-app/src/context/RoleContext.tsx', import.meta.url),
  'utf8',
);
const appShell = readFileSync(
  new URL('../../src/App.tsx', import.meta.url),
  'utf8',
);

test('Owner hard reload prefers cached claims and bounds profile/App Check recovery', () => {
  assert.match(mainRoleContext, /AUTH_BOOT_HARD_DEADLINE_MS\s*=\s*16000/);
  assert.match(mainRoleContext, /PROFILE_OP_TIMEOUT_MS\s*=\s*6000/);
  assert.match(mainRoleContext, /Prefer cached claims on hard reload/);
  assert.match(mainRoleContext, /getIdTokenResult\(false\)/);
  assert.match(mainRoleContext, /withTimeout\(getDoc\(userDocRef\), PROFILE_OP_TIMEOUT_MS/);
  assert.match(mainRoleContext, /withTimeout\(forceNativeAppCheckRefresh\(\), PROFILE_OP_TIMEOUT_MS/);
  assert.match(mainRoleContext, /withTimeout\(getAppCheckToken\(appCheck, true\), PROFILE_OP_TIMEOUT_MS/);
  // App Check remains required on recovery — never disabled or bypassed.
  assert.match(mainRoleContext, /if \(appCheck\) \{/);
  assert.doesNotMatch(mainRoleContext, /enforceAppCheck:\s*false/);
  assert.doesNotMatch(mainRoleContext, /getAppCheckToken\([^)]*false\)/);
});

test('Owner soft hold still protects restore, hard deadline still releases AUTHENTICATING', () => {
  assert.match(mainRoleContext, /Holding the portal gate/);
  assert.match(mainRoleContext, /Auth sync hard deadline\. Releasing portal gate fail-closed/);
  assert.match(mainRoleContext, /hardDeadlineId/);
  assert.match(mainRoleContext, /clearTimeout\(hardDeadlineId\)/);
  assert.match(ownerRoleContext, /AUTH_BOOT_HARD_DEADLINE_MS/);
  assert.match(ownerRoleContext, /getIdTokenResult\(false\)/);
  assert.match(ownerRoleContext, /hardDeadlineId/);
});

test('LoadingScreen AUTHENTICATING copy remains the Owner hard-reload gate UI', () => {
  assert.match(appShell, /function LoadingScreen\(/);
  assert.match(appShell, /common\.auth_sync/);
  assert.match(appShell, /Authenticating BIN-Groups Identity/);
  assert.match(appShell, /loadingFallback=\{<LoadingScreen \/>\}/);
});
