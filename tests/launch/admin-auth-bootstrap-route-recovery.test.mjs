import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authContext = await readFile(
  new URL('../../apps/admin-panel/src/context/AuthContext.tsx', import.meta.url),
  'utf8',
);
const app = await readFile(
  new URL('../../apps/admin-panel/src/App.tsx', import.meta.url),
  'utf8',
);

test('Admin login route is never hidden behind initial Firebase session restoration', () => {
  assert.match(authContext, /const shouldBlockForInitialAuth = \(\) =>/);
  assert.match(authContext, /window\.location\.pathname !== '\/login'/);
  assert.match(authContext, /useState\(shouldBlockForInitialAuth\)/);
  assert.match(app, /if \(loading\)/);
  assert.match(app, /<Route path="\/login" element=\{<LoginPage \/>\} \/>/);
});

test('Protected Admin routes remain fail-closed while bootstrap verification runs', () => {
  assert.match(authContext, /if \(typeof window === 'undefined'\) return true/);
  assert.match(authContext, /getIdTokenResult\(firebaseUser, true\)/);
  assert.match(authContext, /ADMIN_MFA_REQUIRED/);
  assert.match(authContext, /authStateWatchdog/);
  assert.match(app, /\{isAuthenticated && \(/);
});
