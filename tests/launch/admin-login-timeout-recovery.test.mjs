import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const login = await readFile(new URL('../../apps/admin-panel/src/components/UnifiedLogin.tsx', import.meta.url), 'utf8');
const challenge = await readFile(new URL('../../apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx', import.meta.url), 'utf8');
const adminSpec = await readFile(new URL('../e2e/business-admin.spec.ts', import.meta.url), 'utf8');

const authContext = await readFile(new URL('../../apps/admin-panel/src/context/AuthContext.tsx', import.meta.url), 'utf8');

test('Admin password login is bounded and exposes targeted secure-session recovery', () => {
  assert.match(login, /AUTH_PERSISTENCE_TIMEOUT_MS\s*=\s*8_000/);
  assert.match(login, /AUTH_SIGN_IN_TIMEOUT_MS\s*=\s*20_000/);
  
  assert.doesNotMatch(login, /AUTH_VERIFICATION_TIMEOUT_MS/);
  assert.doesNotMatch(login, /startAuthorizationTimer/);
  assert.doesNotMatch(login, /setTimeout.*signOut/);
  assert.match(login, /loading\s*=\s*localLoading\s*\|\|\s*status\s*===\s*'verifying-token'\s*\|\|\s*status\s*===\s*'verifying-profile'/);
  
  assert.match(authContext, /globalTimeoutTimer\s*=\s*window\.setTimeout/);
  assert.match(authContext, /getIdTokenResult.*15000/);
  assert.match(authContext, /getDoc.*8000/);
  assert.match(authContext, /setIsAuthenticated\(false\)/);
  assert.match(authContext, /setUser\(null\)/);
  
  assert.match(login, /withTimeout\(setPersistence\(auth, browserLocalPersistence\)/);
  assert.match(login, /signInWithEmailAndPassword/);
  assert.match(login, /Reset secure session/i);
  assert.match(login, /deleteDatabase\('firebaseLocalStorageDb'\)/);
  assert.doesNotMatch(login, /localStorage\.clear\(\)|sessionStorage\.clear\(\)/);
});

test('Admin authentication uses only real Firebase MFA', () => {
  assert.match(login, /auth\/multi-factor-auth-required/);
  assert.match(login, /getMultiFactorResolver\(auth, err\)/);
  assert.match(challenge, /PhoneAuthProvider/);
  assert.match(challenge, /resolver\.resolveSignIn\(assertion\)/);

  for (const source of [login, challenge, adminSpec]) {
    assert.doesNotMatch(source, /appVerificationDisabledForTesting/);
    assert.doesNotMatch(source, /bin-e2e-admin-mfa-test/);
    assert.doesNotMatch(source, /testPhoneNumbers/);
    assert.doesNotMatch(source, /fictional[- ]phone/i);
  }
});

test('Admin proof captures loader, Firebase response, page and asset diagnostics', () => {
  assert.match(adminSpec, /accounts:signInWithPassword/);
  assert.match(adminSpec, /firebaseAuthStatus/);
  assert.match(adminSpec, /firstPageError/);
  assert.match(adminSpec, /consoleErrors/);
  assert.match(adminSpec, /requestFailures/);
  assert.match(adminSpec, /failedScriptUrl/);
  assert.match(adminSpec, /AUTHENTICATING SOVEREIGN IDENTITY/);
  assert.match(adminSpec, /E2E_ADMIN_REAL_MFA_CODE/);
});
