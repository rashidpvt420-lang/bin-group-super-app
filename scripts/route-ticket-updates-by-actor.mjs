import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const oldUpdate = '      allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
const newUpdate = '      allow update: if safeTicketUpdateByActor();';
const oldCount = rules.split(oldUpdate).length - 1;

if (oldCount === 2) {
  rules = rules.split(oldUpdate).join(newUpdate);
} else if (oldCount !== 0 || rules.split(newUpdate).length - 1 !== 2) {
  throw new Error(`Expected two ticket update rules; old=${oldCount}, new=${rules.split(newUpdate).length - 1}.`);
}

const helperMarker = '    function safeTicketUpdateByActor() {';
if (!rules.includes(helperMarker)) {
  const insertionPoint = '    function safeTechnicianProfileUpdate(techId) {';
  const index = rules.indexOf(insertionPoint);
  if (index < 0) throw new Error('Technician profile helper insertion point not found.');

  const helper = `    function safeTicketUpdateByActor() {
      // Select exactly one authorization path. Nested conditionals are lazy,
      // preventing dispatcher, tenant, and technician predicates from all
      // consuming the same Firestore Rules expression budget.
      return isAdmin()
        ? isNotSuspended()
        : hasDispatchAuthorityClaimOnly()
          ? safeDispatcherTicketUpdate()
          : claimedRole() == 'tenant'
            ? safeTenantEvidenceUpdate()
            : claimedRole() == 'technician'
              ? safeTechnicianTicketUpdate()
              : false;
    }

`;
  rules = `${rules.slice(0, index)}${helper}${rules.slice(index)}`;
}

if (rules.split(helperMarker).length - 1 !== 1) {
  throw new Error('safeTicketUpdateByActor must exist exactly once.');
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[route-ticket-updates] ticket writes use one lazy actor-specific authorization branch');
