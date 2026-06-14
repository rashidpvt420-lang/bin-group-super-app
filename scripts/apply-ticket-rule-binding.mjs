import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8');
let changed = false;

const oldCreate = "      allow create: if isAdmin() || hasPermission('canDispatchJobs') || ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);";
const newCreate = "      allow create: if isAdmin() || hasPermission('canDispatchJobs') || ownerDraftCreate(request.resource.data) || canCreateTenantBoundTicket(request.resource.data);";

if (text.includes(oldCreate)) {
  text = text.split(oldCreate).join(newCreate);
  changed = true;
}

if (changed) writeFileSync(file, text);
console.log(changed ? 'Applied ticket create binding rule.' : 'Ticket create binding rule already applied.');
