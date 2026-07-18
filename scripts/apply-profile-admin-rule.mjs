import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
let rules = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

if (!rules.includes('function hasAdminClaim()')) {
  console.error('Claims-backed hasAdminClaim helper is missing.');
  process.exit(1);
}

const profileHelper = /\n    function adminProfileGrantsAccess\(\) \{[\s\S]*?\n    \}\n/;
rules = rules.replace(profileHelper, '\n');

const isAdminBlock = /    function isAdmin\(\) \{[\s\S]*?\n    \}/;
const claimsOnlyBlock = `    function isAdmin() {
      // Firestore profile fields are display/cache data, never an authorization
      // source. Privileged access must be backed by signed Auth custom claims.
      return hasAdminClaim();
    }`;

if (!isAdminBlock.test(rules)) {
  console.error('isAdmin helper is missing.');
  process.exit(1);
}

rules = rules.replace(isAdminBlock, claimsOnlyBlock);

if (rules.includes('adminProfileGrantsAccess') || !rules.includes('return hasAdminClaim();')) {
  console.error('Admin authorization is not claims-only.');
  process.exit(1);
}

writeFileSync(path, rules);
console.log('Claims-only admin rule installed.');

// Push registration and delivery authority is hardened immediately after the
// profile/admin transformation so every existing prepare:rules path applies it.
await import('./harden-push-token-authority.mjs');
