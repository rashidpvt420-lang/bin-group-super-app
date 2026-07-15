import { readFileSync } from 'node:fs';

const rules = readFileSync('firestore.rules', 'utf8');

const forbiddenFragments = [
  {
    label: 'broad tenant property read fallback',
    text: "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'tenant'",
  },
  {
    label: 'unrestricted notification creation',
    text: '      allow create: if signedIn();',
  },
  {
    label: 'open mission pool readable by any signed-in user',
    text: "function openMissionPoolRead(data) { return signedIn() && data.assignedTechnicianId == null",
  },
  {
    label: 'tenant ticket create without unit/property validation',
    text: "ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);",
  },
  {
    label: 'direct client-side technician mission claim helper',
    text: 'function safeOpenMissionClaim() {',
  },
  {
    label: 'direct client-side mission assignment field helper',
    text: 'function missionClaimFieldsLookValid() {',
  },
  {
    label: 'tickets update rule still permits direct technician claiming',
    text: '|| safeOpenMissionClaim()',
  },
  {
    label: 'open mission pool grants dispatcher/admin semantics to technician pool reads',
    text: 'function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && openMissionAvailable(data); }',
  },
];

const requiredFragments = [
  {
    label: 'hardened property read rule',
    text: 'ownerCanRead(resource.data) || tenantOwns(resource.data)',
  },
  {
    label: 'hardened notification create rule',
    text: 'allow create: if isAdmin() || safeClientNotificationCreate(request.resource.data);',
  },
  {
    label: 'safe client notification helper',
    text: 'function safeClientNotificationCreate(data) {',
  },
  {
    label: 'technician dispatch authority helper',
    text: 'function hasTechnicianDispatchAuthority() {',
  },
  {
    label: 'approved technician helper',
    text: 'function isApprovedTechnician() {',
  },
  {
    label: 'open mission availability helper',
    text: 'function openMissionAvailable(data) {',
  },
  {
    label: 'open mission visibility restricted to approved technicians',
    text: 'function openMissionPoolRead(data) { return isApprovedTechnician() && openMissionAvailable(data); }',
  },
  {
    label: 'tenant ticket unit/property binding helper',
    text: 'function canCreateTenantBoundTicket(data) {',
  },
  {
    label: 'tenant ticket create uses binding helper',
    text: 'ownerDraftCreate(request.resource.data) || canCreateTenantBoundTicket(request.resource.data);',
  },
  {
    label: 'technician evidence update helper',
    text: 'function safeTechnicianTicketUpdate() {',
  },
  {
    label: 'ticket assignment and status transitions are dispatcher/server authoritative',
    text: 'allow update: if canDispatchJobs() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();',
  },
  {
    label: 'technician cannot replace assigned technician identity',
    text: "request.resource.data.assignedTechnicianId == resource.data.get('assignedTechnicianId', null)",
  },
];

const failures = [];

for (const fragment of forbiddenFragments) {
  if (rules.includes(fragment.text)) {
    failures.push(`Forbidden rule fragment still exists: ${fragment.label}`);
  }
}

for (const fragment of requiredFragments) {
  const present = rules.includes(fragment.text) || (fragment.alt && rules.includes(fragment.alt));
  if (!present) {
    failures.push(`Required rule fragment missing: ${fragment.label}`);
  }
}

if (failures.length > 0) {
  console.error('Firestore launch hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Firestore launch hardening verification passed.');
