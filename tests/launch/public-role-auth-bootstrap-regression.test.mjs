import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('public role bootstrap cannot be deadlocked by App Check before a role exists', () => {
  const callable = read('functions/publicRoleAssignment.ts');

  assert.match(callable, /export const assignPublicPortalRole = onCall\(\{/);
  assert.match(callable, /enforceAppCheck:\s*false/);
  assert.match(callable, /if \(!request\.auth\?\.uid\)/);
  assert.match(callable, /new HttpsError\("unauthenticated"/);
  assert.match(callable, /PUBLIC_ROLES = new Set\(\["owner", "tenant", "technician", "broker"\]\)/);
  assert.match(callable, /PRIVILEGED_CLAIM_KEYS/);
  assert.match(callable, /Privileged accounts cannot use public role selection/);
  assert.match(callable, /setCustomUserClaims\(uid, \{ \.\.\.nextClaims, role \}\)/);
});

test('role gateway authenticates from the live Firebase session and never trusts stale context', () => {
  const gateway = read('src/pages/RoleGatewayPage.tsx');

  assert.match(gateway, /const activeUser = auth\.currentUser;/);
  assert.doesNotMatch(gateway, /auth\.currentUser\s*\|\|\s*user/);
  assert.match(gateway, /await activeUser\.getIdToken\(true\);[\s\S]*httpsCallable\(functions, 'assignPublicPortalRole'\)/);
  assert.match(gateway, /firstCode\.includes\('unauthenticated'\) && stillAuthenticated/);
  assert.match(gateway, /navigate\(roleLoginTarget\(roleId\)\)/);
  assert.doesNotMatch(gateway, /setNotice\(error\?\.message/);
});

test('admin gateway is routed through the dedicated admin login boundary', () => {
  const gateway = read('src/pages/RoleGatewayPage.tsx');
  const login = read('src/pages/LoginPage.tsx');

  assert.match(gateway, /roleId === 'admin'[\s\S]{0,120}navigate\('\/login\?intendedRole=admin'\)/);
  assert.doesNotMatch(gateway, /roleId === 'admin'[\s\S]{0,120}navigate\('\/admin\/dashboard'\)/);
  assert.match(login, /ADMIN_PANEL_LOGIN_URL = 'https:\/\/bin-group-admin-panel\.web\.app\/login'/);
  assert.match(login, /if \(intendedRoleKey === 'admin'\)[\s\S]{0,120}redirectToAdminPanel/);
});
