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
const adminFirebase = readFileSync(
  new URL('../../apps/admin-panel/src/lib/firebase.ts', import.meta.url),
  'utf8',
);
const adminLogin = readFileSync(
  new URL('../../apps/admin-panel/src/components/UnifiedLogin.tsx', import.meta.url),
  'utf8',
);

const bootTimeoutBody = (source) => {
  const start = source.indexOf('const timeoutId = window.setTimeout');
  const ownerStart = source.indexOf('const bootTimeoutId = window.setTimeout');
  const from = start >= 0 ? start : ownerStart;
  assert.ok(from >= 0, 'boot timeout must exist');
  const end = source.indexOf('AUTH_BOOT_TIMEOUT_MS);', from);
  assert.ok(end > from, 'boot timeout must stay bounded by AUTH_BOOT_TIMEOUT_MS');
  return source.slice(from, end);
};

const hardDeadlineBody = (source) => {
  assert.match(source, /AUTH_BOOT_HARD_DEADLINE_MS/);
  const start = source.indexOf('const releaseBootFailClosed');
  assert.ok(start >= 0, 'hard-deadline fail-closed helper must exist');
  const end = source.indexOf('AUTH_BOOT_HARD_DEADLINE_MS);', start);
  assert.ok(end > start, 'hard deadline must stay bounded by AUTH_BOOT_HARD_DEADLINE_MS');
  return source.slice(start, end);
};

test('main portal boot timer does not treat a restoring session as logged out', () => {
  const timeout = bootTimeoutBody(mainRoleContext);
  assert.match(mainRoleContext, /profileSyncInFlightRef/);
  assert.match(mainRoleContext, /authObserverSettledRef/);
  assert.match(timeout, /profileSyncInFlightRef\.current > 0 \|\| auth\.currentUser/);
  assert.match(timeout, /authObserverSettledRef\.current/);
  assert.match(timeout, /Holding the portal gate/);
  assert.doesNotMatch(timeout, /Auth sync timeout\. Releasing blocker\./);
  assert.match(
    mainRoleContext,
    /const finalRole = roleIsValid\(claimRole\) \? claimRole : ''/,
    'portal role still comes from verified claims',
  );
});

test('owner-app boot timer does not bypass the portal gate during session restore', () => {
  const timeout = bootTimeoutBody(ownerRoleContext);
  assert.match(ownerRoleContext, /profileSyncInFlightRef/);
  assert.match(ownerRoleContext, /authObserverSettledRef/);
  assert.match(timeout, /profileSyncInFlightRef\.current > 0 \|\| auth\.currentUser/);
  assert.match(timeout, /Holding the portal gate/);
  assert.doesNotMatch(ownerRoleContext, /Bypassing blocker/);
  assert.match(timeout, /setLoading\(false\)/);
});

test('admin session persistence stays tab-scoped and does not expire on a live user', () => {
  assert.match(adminLogin, /browserSessionPersistence/);
  assert.doesNotMatch(adminLogin, /browserLocalPersistence/);
  assert.match(adminFirebase, /if \(!currentUser\) \{\s*expireStaleAdminSession\(\);/s);
  assert.match(adminFirebase, /isTerminalAdminAuthError\(refreshError\)/);
});

test('main portal hard deadline fail-closes hung AUTHENTICATING without logging the owner out', () => {
  const hard = hardDeadlineBody(mainRoleContext);
  assert.match(hard, /Auth sync hard deadline\. Releasing portal gate fail-closed/);
  assert.match(hard, /profile_unavailable/);
  assert.match(hard, /Secure account verification timed out/);
  assert.match(hard, /auth\.currentUser/);
  assert.match(hard, /setLoading\(false\)/);
  assert.match(hard, /markGlobalAuthReady/);
  assert.doesNotMatch(hard, /setUser\(null\)/);
  assert.doesNotMatch(hard, /auth\.signOut/);
});

test('owner-app hard deadline fail-closes hung AUTHENTICATING without logging the owner out', () => {
  const hard = hardDeadlineBody(ownerRoleContext);
  assert.match(hard, /Auth sync hard deadline\. Releasing portal gate fail-closed/);
  assert.match(hard, /profile_unavailable/);
  assert.match(hard, /setLoading\(false\)/);
  assert.doesNotMatch(hard, /setUser\(null\)/);
});
