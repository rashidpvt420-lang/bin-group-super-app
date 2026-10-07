// Regression (tenant P0): accepting a tenant invitation landed the tenant on
// /gateway ("choose your role") instead of the Tenant Portal.
// acceptTenantInvitation sets the `tenant` custom claim server-side and answers
// tokenRefreshRequired:true, but TenantInvitePage navigated to /tenant with the
// ID token cached at sign-in (no role claim). The portal's RoleProvider reads
// cached claims (getIdTokenResult(false)); a missing claim resolves to
// role_required and ProtectedRoute redirects to /gateway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const page = read('src/pages/TenantInvitePage.tsx');
const acceptStart = page.indexOf('const handleAccept = async () => {');
const acceptEnd = page.indexOf('if (loading) {', acceptStart);
const handleAccept = page.slice(acceptStart, acceptEnd);

test('the server contract still requires a token refresh after acceptance', () => {
  const functions = read('functions/index.ts');
  assert.match(functions, /setCustomUserClaims\(authUid, \{ \.\.\.existingClaims, role: "tenant" \}\)/);
  assert.match(functions, /return \{ status: "success", redirect: "\/tenant", tokenRefreshRequired: true \};/);
  const roleContext = read('src/context/RoleContext.tsx');
  assert.match(roleContext, /currentUser\.getIdTokenResult\(false\)/, 'portal reads cached claims');
  assert.match(read('src/components/ProtectedRoute.tsx'), /role_required/);
});

test('TenantInvitePage force-refreshes the ID token after acceptance and before entering the portal', () => {
  assert.notEqual(acceptStart, -1);
  assert.notEqual(acceptEnd, -1);
  const acceptCall = handleAccept.indexOf("acceptFn({ token })");
  const refresh = handleAccept.search(/await user\.getIdToken\(true\)/);
  const enterPortal = handleAccept.search(/navigate\(data\.redirect \|\| '\/tenant'/);
  assert.notEqual(acceptCall, -1, 'acceptTenantInvitation call present');
  assert.notEqual(refresh, -1, 'forced token refresh present');
  assert.notEqual(enterPortal, -1, 'portal navigation present');
  assert.ok(acceptCall < refresh, 'refresh happens after the claim is set server-side');
  assert.ok(refresh < enterPortal, 'refresh happens before the portal RoleProvider mounts');
  const success = handleAccept.slice(handleAccept.indexOf("data.status === 'success'"));
  assert.ok(success.search(/await user\.getIdToken\(true\)/) < success.indexOf('setSuccess(true)'),
    'success screen only after the refreshed claims are in hand');
});
