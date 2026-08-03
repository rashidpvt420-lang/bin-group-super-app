import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const gate = readFileSync('apps/admin-panel/src/components/security/AdminAppCheckGate.tsx', 'utf8');
const loginPage = readFileSync('apps/admin-panel/src/pages/auth/LoginPage.tsx', 'utf8');
const adminFirebase = readFileSync('apps/admin-panel/src/lib/firebase.ts', 'utf8');
const authContext = readFileSync('apps/admin-panel/src/context/AuthContext.tsx', 'utf8');
const adminSecurityFunction = readFileSync('functions/adminSecurityProfile.ts', 'utf8');
const exchangeVerifier = readFileSync('scripts/verify-admin-appcheck-exchange.mjs', 'utf8');
const productionEnvWriter = readFileSync('scripts/write-production-env.mjs', 'utf8');
const founderPreflight = readFileSync('.github/workflows/production-founder-e2e-preflight.yml', 'utf8');
const securityGuide = readFileSync('SECURITY_REGISTRATION.md', 'utf8');

const canonical = Object.freeze({
  projectId: 'bin-group-57c60',
  authDomain: 'bin-group-57c60.firebaseapp.com',
  appId: '1:123413252227:web:285cb53bc26626d699f3b6',
  adminHost: 'bin-group-admin-panel.web.app',
});

test('Admin credentials stay behind an exact runtime App Check gate', () => {
  assert.match(loginPage, /<AdminAppCheckGate>[\s\S]*<UnifiedLogin \/>[\s\S]*<\/AdminAppCheckGate>/);
  assert.match(gate, /getToken\(appCheck, false\)/);
  assert.match(gate, /ADMIN_FIREBASE_IDENTITY_MISMATCH/);
  assert.match(gate, /ADMIN_APPCHECK_NOT_INITIALIZED/);
  assert.match(gate, /No email or password was submitted/);

  for (const value of Object.values(canonical)) {
    assert.ok(gate.includes(value), `Admin App Check gate must bind ${value}`);
  }

  const tokenCheck = gate.indexOf('getToken(appCheck, false)');
  const childRender = gate.indexOf("if (gate.status === 'ready') return <>{children}</>");
  assert.ok(tokenCheck >= 0, 'runtime App Check token exchange must exist');
  assert.ok(childRender > tokenCheck, 'credentials must render only after the token-check path is defined');
  assert.doesNotMatch(gate, /getAppCheck/);
  assert.doesNotMatch(gate, /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*true/);
});

test('Admin runtime uses a dedicated named Firebase app and one exported App Check instance', () => {
  assert.ok(adminFirebase.includes(`const ADMIN_FIREBASE_APP_ID = '${canonical.appId}'`));
  assert.match(adminFirebase, /const ADMIN_FIREBASE_APP_NAME = 'bin-group-admin'/);
  assert.match(adminFirebase, /getApps\(\)\.find\(\(candidate\) => candidate\.name === ADMIN_FIREBASE_APP_NAME\)/);
  assert.match(adminFirebase, /initializeApp\(firebaseConfig, ADMIN_FIREBASE_APP_NAME\)/);
  assert.match(adminFirebase, /let appCheck: AppCheck \| null = null/);
  assert.match(adminFirebase, /appCheck = initializeAppCheck\(app,/);
  assert.match(adminFirebase, /app, appCheck, db, auth/);
  assert.doesNotMatch(adminFirebase, /getApps\(\)\.length === 0 \? initializeApp\(firebaseConfig\) : getApp\(\)/);
  assert.match(adminFirebase, /process\.env\.REACT_APP_ADMIN_FIREBASE_APP_ID/);
  assert.ok(productionEnvWriter.includes(`const ADMIN_FIREBASE_APP_ID = '${canonical.appId}'`));
  assert.match(productionEnvWriter, /\['REACT_APP_ADMIN_FIREBASE_APP_ID', ADMIN_FIREBASE_APP_ID\]/);
});

test('Founder preflight probes the exact Admin App Check registration before MFA secret validation', () => {
  const appCheckStep = founderPreflight.indexOf('Verify exact Admin App Check token exchange');
  const founderEnvStep = founderPreflight.indexOf('Run verification script');
  assert.ok(appCheckStep >= 0, 'Admin App Check preflight step must exist');
  assert.ok(founderEnvStep > appCheckStep, 'Admin App Check must be diagnosed before the Founder MFA gate');
  assert.ok(founderPreflight.includes(`REACT_APP_ADMIN_FIREBASE_APP_ID: '${canonical.appId}'`));
  assert.ok(founderPreflight.includes(`E2E_ADMIN_BASE_URL: https://${canonical.adminHost}`));
  assert.match(founderPreflight, /EXPECTED_COMMIT_SHA:.*pull_request\.head\.sha.*github\.sha/);
});

test('Admin App Check verifier is app-specific and never persists the returned token', () => {
  assert.ok(exchangeVerifier.includes(canonical.appId));
  assert.ok(exchangeVerifier.includes(canonical.adminHost));
  assert.match(exchangeVerifier, /:exchangeDebugToken/);
  assert.match(exchangeVerifier, /tokenReturned: true/);
  assert.doesNotMatch(exchangeVerifier, /token:\s*payload\?\.token/);
  assert.doesNotMatch(exchangeVerifier, /console\.log\([^\n]*debugToken/);
});

test('frontend, Functions and operator guide agree on users/{uid} authorization profile', () => {
  assert.match(authContext, /doc\(db, 'users', firebaseUser\.uid\)/);
  assert.match(adminSecurityFunction, /db\.collection\("users"\)\.doc\(auth\.uid\)/);
  assert.match(securityGuide, /Canonical Admin authorization profile: `users\/\{uid\}`/);
  assert.match(securityGuide, /`users\/\{uid\}` exists and is active/);
  assert.match(securityGuide, /Do not create a parallel `admin_users\/\{uid\}` document as a workaround/);
  assert.doesNotMatch(securityGuide, /Canonical Admin authorization profile: `admin_users\/\{uid\}`/);
});
