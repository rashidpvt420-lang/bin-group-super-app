import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const login = await readFile(
  new URL('../../apps/admin-panel/src/components/UnifiedLogin.tsx', import.meta.url),
  'utf8',
);

test('Admin email login cannot spin forever while persistence or Firebase sign-in stalls', () => {
  assert.match(login, /AUTH_PERSISTENCE_TIMEOUT_MS\s*=\s*8_000/);
  assert.match(login, /AUTH_SIGN_IN_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(login, /withTimeout\([\s\S]*setPersistence\(auth, browserLocalPersistence\)[\s\S]*ADMIN_PERSISTENCE_TIMEOUT/);
  assert.match(login, /withTimeout\([\s\S]*signInWithEmailAndPassword\([\s\S]*ADMIN_SIGN_IN_TIMEOUT/);
  assert.doesNotMatch(login, /await setPersistence\(auth, browserLocalPersistence\)\.catch\(\(\) => undefined\)/);
});

test('Admin login preserves the real Firebase MFA resolver and adds bounded authorization recovery', () => {
  assert.match(login, /auth\/multi-factor-auth-required/);
  assert.match(login, /getMultiFactorResolver\(auth, err\)/);
  assert.match(login, /AUTH_VERIFICATION_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(login, /ADMIN_VERIFICATION_TIMEOUT/);
  assert.match(login, /void signOut\(auth\)\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(login, /mfaBypass|skipMfa|secondFactor.*customClaims/i);
});

test('Admin login exposes a targeted secure-session reset without clearing unrelated app data', () => {
  assert.match(login, /Reset secure session/i);
  assert.match(login, /sessionStorage\.removeItem\('bin-admin-security-session'\)/);
  assert.match(login, /deleteDatabase\('firebaseLocalStorageDb'\)/);
  assert.doesNotMatch(login, /localStorage\.clear\(\)|sessionStorage\.clear\(\)/);
});
