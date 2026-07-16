import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin security profile is a dedicated protected bilingual route', async () => {
  const [app, page] = await Promise.all([
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
  ]);
  assert.match(app, /import AdminSecurityProfilePage/);
  assert.match(app, /Route path="\/profile" element=\{<ProtectedRoute adminOnly><AdminSecurityProfilePage/);
  assert.match(app, /navigate\('\/profile'\)/);
  assert.match(page, /dir=\{isRTL \? 'rtl' : 'ltr'\}/);
  assert.match(page, /Personal Security Profile/);
  assert.match(page, /ملف الأمان الشخصي/);
  assert.doesNotMatch(page, /setDoc\(|updateDoc\(|addDoc\(/);
});

test('Admin security authority is App Check protected and Firebase Auth derived', async () => {
  const source = await read('functions/adminSecurityProfile.ts');
  for (const callable of [
    'registerAdminSecuritySession',
    'getAdminSecurityProfile',
    'revokeAdminSessions',
    'lockOwnAdminAccount',
  ]) assert.match(source, new RegExp(`export const ${callable} = onCall`));
  assert.match(source, /enforceAppCheck: true/);
  assert.match(source, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(source, /multiFactor\?\.enrolledFactors/);
  assert.match(source, /customClaims/);
  assert.match(source, /revokeRefreshTokens\(adminActor\.uid\)/);
  assert.match(source, /updateUser\(adminActor\.uid, \{ disabled: true \}\)/);
  assert.match(source, /ADMIN_EMERGENCY_SELF_LOCK/);
  assert.match(source, /ADMIN_REVOKE_ALL_SESSIONS/);
});

test('Admin security sessions are ephemeral and never stored in localStorage', async () => {
  const [app, page] = await Promise.all([
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
  ]);
  assert.match(page, /sessionStorage\.getItem\('bin-admin-security-session'\)/);
  assert.match(page, /sessionStorage\.setItem\('bin-admin-security-session'/);
  assert.doesNotMatch(page, /localStorage/);
  assert.match(app, /sessionStorage\.removeItem\('bin-admin-security-session'\)/);
});

test('runtime exports Admin security authority', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \* from "\.\/adminSecurityProfile";/);
});
