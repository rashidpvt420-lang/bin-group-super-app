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
  'Admin Login',
  'Sign in with Google',
];

for (const token of requiredLoginTokens) {
  if (!login.includes(token)) {
    throw new Error(`Admin login hardening missing token: ${token}`);
  }
}

if (login.includes('signInWithPopup')) {
  throw new Error('Admin Google login still uses signInWithPopup. Use redirect SSO for mobile/admin production.');
}

// Prebuild hooks check removed as admin panel now uses a stable static routing setup without drift-injecting prebuild steps.

console.log('Admin login hardening verification passed.');
