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
    label: 'open mission claim without technician/dispatch authority',
    text: "function safeOpenMissionClaim() {\n      return openMissionPoolRead(resource.data) &&",
  },
];

const requiredFragments = [
  {
    label: 'hardened property read rule',
    text: "      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data) || tenantOwns(resource.data) || techOwns(resource.data);",
  },
  {
    label: 'hardened notification create rule',
    text: "allow create: if isAdmin() || (signedIn() && request.resource.data.recipientId == request.auth.uid",
  },
  {
    label: 'technician dispatch authority helper',
    text: 'function hasTechnicianDispatchAuthority() {',
  },
  {
    label: 'open mission pool scoped to dispatch authority',
    text: "function openMissionPoolRead(data) { return hasTechnicianDispatchAuthority() && data.assignedTechnicianId == null",
  },
  {
    label: 'open mission claim requires dispatch authority',
    text: 'return hasTechnicianDispatchAuthority() && openMissionPoolRead(resource.data) &&',
  },
  {
    label: 'tenant ticket unit/property binding helper',
    text: 'function canCreateTenantBoundTicket(data) {',
  },
  {
    label: 'tenant ticket create uses binding helper',
    text: 'ownerDraftCreate(request.resource.data) || canCreateTenantBoundTicket(request.resource.data);',
  },
];

const failures = [];

for (const fragment of forbiddenFragments) {
  if (rules.includes(fragment.text)) {
    failures.push(`Forbidden rule fragment still exists: ${fragment.label}`);
  }
}

for (const fragment of requiredFragments) {
  if (!rules.includes(fragment.text)) {
    failures.push(`Required rule fragment missing: ${fragment.label}`);
  }
}

if (failures.length > 0) {
  console.error('Firestore launch hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Firestore launch hardening verification passed.');
