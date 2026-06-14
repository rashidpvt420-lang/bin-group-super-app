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

const start = text.indexOf('    function isTechnicianActor() {');
const endMarker = "    function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && data.assignedTechnicianId == null && data.status in ['OPEN', 'open', 'emergency_submitted']; }";
const end = text.indexOf(endMarker, start);

if (start >= 0 && end >= 0) {
  const light = `    function hasTechnicianDispatchAuthority() {
      return signedIn() && (
        request.auth.token.role in ['admin', 'super_admin', 'operations_admin', 'operations_manager', 'dispatcher', 'technician'] ||
        request.auth.token.userRole in ['admin', 'super_admin', 'operations_admin', 'operations_manager', 'dispatcher', 'technician'] ||
        request.auth.token.primaryRole in ['admin', 'super_admin', 'operations_admin', 'operations_manager', 'dispatcher', 'technician']
      );
    }

    function openMissionAvailable(data) { return data.assignedTechnicianId == null && data.status in ['OPEN', 'open', 'emergency_submitted']; }
    function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && openMissionAvailable(data); }`;
  text = text.slice(0, start) + light + text.slice(end + endMarker.length);
  changed = true;
}

const duplicateClaim = 'return hasTechnicianDispatchAuthority() && openMissionPoolRead(resource.data) &&';
if (text.includes(duplicateClaim)) {
  text = text.split(duplicateClaim).join('return hasTechnicianDispatchAuthority() && openMissionAvailable(resource.data) &&');
  changed = true;
}

if (changed) writeFileSync(file, text);
console.log(changed ? 'Applied ticket and dispatch rule cleanup.' : 'Ticket and dispatch rules already clean.');
