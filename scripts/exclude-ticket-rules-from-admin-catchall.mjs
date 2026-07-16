import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const oldRead = "!(collection in ['system_secrets', 'users']) && hasAdminClaim()";
const newRead = "!(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim()";

if (rules.includes(oldRead)) {
  rules = rules.replace(oldRead, newRead);
} else if (!rules.includes(newRead)) {
  throw new Error('Admin catch-all read exclusion was not found.');
}

const oldWriteList = `          'users',
          'audit_logs',`;
const newWriteList = `          'users',
          'tickets',
          'maintenanceTickets',
          'audit_logs',`;
const occurrences = rules.split(oldWriteList).length - 1;

if (occurrences === 2) {
  rules = rules.split(oldWriteList).join(newWriteList);
} else if (occurrences !== 0 || rules.split(newWriteList).length - 1 !== 2) {
  throw new Error(`Expected two admin catch-all write exclusions; found old=${occurrences}.`);
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[exclude-ticket-catchall] tickets and maintenanceTickets use explicit rules only');
