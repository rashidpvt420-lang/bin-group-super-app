import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const duplicateSuspension = /(^[ \t]*)isNotSuspended\(\) &&\n\1isNotSuspended\(\) &&/gm;
let duplicateCount = 0;
while (duplicateSuspension.test(rules)) {
  duplicateSuspension.lastIndex = 0;
  rules = rules.replace(duplicateSuspension, (_match, indent) => {
    duplicateCount += 1;
    return `${indent}isNotSuspended() &&`;
  });
}

const requiredFragments = [
  'match /fcmTokens/{tokenId}',
  'match /deviceReadiness/{readinessId}',
  'match /{subcollection}/{document=**} {\n        allow read, write: if false;',
  "!(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim()",
  "'users',\n          'tickets',\n          'maintenanceTickets',\n          'audit_logs'",
];

for (const fragment of requiredFragments) {
  if (!rules.includes(fragment)) {
    throw new Error(`Final Firestore hardening fragment missing: ${fragment}`);
  }
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log(`[final-firestore-cleanup] removed ${duplicateCount} duplicate suspension guard(s)`);
