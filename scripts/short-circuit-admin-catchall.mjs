import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const oldRead = "allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
const newRead = "allow read: if hasAdminClaim() && !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']);";

if (rules.includes(oldRead)) {
  rules = rules.replace(oldRead, newRead);
} else if (!rules.includes(newRead)) {
  throw new Error('Global admin catch-all read rule was not found.');
}

const oldCreateStart = '      allow create: if !(\n        collection in [';
const newCreateStart = '      allow create: if hasAdminClaim() && !(\n        collection in [';
const oldUpdateStart = '      allow update, delete: if !(\n        collection in [';
const newUpdateStart = '      allow update, delete: if hasAdminClaim() && !(\n        collection in [';

if (rules.includes(oldCreateStart)) {
  rules = rules.replace(oldCreateStart, newCreateStart);
} else if (!rules.includes(newCreateStart)) {
  throw new Error('Global admin catch-all create rule was not found.');
}

if (rules.includes(oldUpdateStart)) {
  rules = rules.replace(oldUpdateStart, newUpdateStart);
} else if (!rules.includes(newUpdateStart)) {
  throw new Error('Global admin catch-all update rule was not found.');
}

const catchAllStart = rules.indexOf('    match /{collection}/{document=**} {');
if (catchAllStart < 0) throw new Error('Global admin catch-all block not found.');
const prefix = rules.slice(0, catchAllStart);
let catchAll = rules.slice(catchAllStart);
const trailingAdmin = '      ) && hasAdminClaim();';
const trailingCount = catchAll.split(trailingAdmin).length - 1;

if (trailingCount === 2) {
  catchAll = catchAll.split(trailingAdmin).join('      );');
} else if (trailingCount !== 0) {
  throw new Error(`Unexpected trailing admin-claim count: ${trailingCount}`);
}

if (!catchAll.includes(newRead) ||
    !catchAll.includes(newCreateStart) ||
    !catchAll.includes(newUpdateStart) ||
    catchAll.includes(trailingAdmin)) {
  throw new Error('Global admin catch-all was not fully short-circuited.');
}

rules = prefix + catchAll;
fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[short-circuit-admin-catchall] admin claims are evaluated before exclusion lists');
