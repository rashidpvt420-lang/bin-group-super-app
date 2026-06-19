import { readFileSync } from 'node:fs';

const login = readFileSync('apps/admin-panel/src/components/UnifiedLogin.tsx', 'utf8');
const adminPkg = readFileSync('apps/admin-panel/package.json', 'utf8');

const requiredLoginTokens = [
  'signInWithRedirect',
  'setPersistence',
  'browserLocalPersistence',
  'provider.setCustomParameters({ prompt: \'select_account\' })',
  'auth/unauthorized-domain',
  'auth/operation-not-allowed',
  'ADMIN PORTAL',
  'SIGN IN WITH GOOGLE',
];

for (const token of requiredLoginTokens) {
  if (!login.includes(token)) {
    throw new Error(`Admin login hardening missing token: ${token}`);
  }
}

if (login.includes('signInWithPopup')) {
  throw new Error('Admin Google login still uses signInWithPopup. Use redirect SSO for mobile/admin production.');
}

const pkg = JSON.parse(adminPkg);
const prebuild = pkg.scripts?.prebuild || '';
const requiredPrebuildHooks = [
  'wire-bin-connect-admin-inbox.mjs',
  'wire-pilot-completion-routes.mjs',
];

for (const token of requiredPrebuildHooks) {
  if (!prebuild.includes(token)) {
    throw new Error(`Admin package prebuild missing hook: ${token}`);
  }
}

console.log('Admin login hardening verification passed.');
