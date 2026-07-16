import { readFileSync } from 'node:fs';

const rules = readFileSync('firestore.rules', 'utf8').replace(/\r\n?/g, '\n');

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
    label: 'open mission pool exposes private tickets before dispatch',
    text: 'function openMissionPoolRead(data)',
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
    label: 'boolean-only database suspension guard',
    text: "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true",
  },
  {
    label: 'token-only directory list suspension guard',
    text: "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (",
  },
  {
    label: 'broad user-subcollection authorization',
    text: 'allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));',
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
    text: 'function hasTechnicianDispatchAuthority() {\n      return canDispatchJobs();\n    }',
  },
  {
    label: 'approved technician helper',
    text: 'function isApprovedTechnician() {',
  },
  {
    label: 'tenant ticket unit/property binding helper',
    text: 'function canCreateTenantBoundTicket(data) {',
  },
  {
    label: 'tenant ticket create uses binding helper',
    text: 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);',
  },
  {
    label: 'technician evidence update helper',
    text: 'function safeTechnicianTicketUpdate() {',
  },
  {
    label: 'ticket assignment and status transitions are dispatcher/server authoritative',
    text: 'allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();',
  },
  {
    label: 'technician cannot replace assigned technician identity',
    text: "request.resource.data.assignedTechnicianId == resource.data.get('assignedTechnicianId', null)",
  },
  {
    label: 'payment transaction writes are server-only',
    text: "match /payment_transactions/{paymentId} {\n      allow read:",
  },
  {
    label: 'payment transaction create denied',
    text: "// transaction type and enter a weaker admin approval path.\n      allow create: if false;\n      allow update, delete: if false;",
  },
  {
    label: 'financial transaction create denied',
    text: 'allow create: if false; // Financial ledger rows are server-authored only.',
  },
  {
    label: 'public rate limits are server-only',
    text: "match /public_rate_limits/{rateId} {\n      allow read, write: if false;",
  },
  {
    label: 'AI quota records are server-only',
    text: "match /ai_usage/{usageId} {\n      allow read: if isAdmin();\n      allow write: if false;",
  },
  {
    label: 'production status-aware suspension helper',
    text: 'function profileAllowsAccess(data) {',
  },
  {
    label: 'production suspension status variants',
    text: "data.get('status', '') in [",
  },
  {
    label: 'dispatch checks claims before database suspension',
    text: 'function hasDispatchAuthorityClaimOnly() {',
  },
  {
    label: 'directory list checks database-backed suspension once',
    text: 'allow list: if isNotSuspended() && (',
  },
  {
    label: 'FCM token path is explicitly allowlisted',
    text: 'match /fcmTokens/{tokenId} {',
  },
  {
    label: 'device readiness path is explicitly allowlisted',
    text: 'match /deviceReadiness/{readinessId} {',
  },
  {
    label: 'unknown user subcollections are denied',
    text: 'match /{subcollection}/{document=**} {\n        allow read, write: if false;',
  },
  {
    label: 'tenant evidence updates verify suspension',
    text: 'tenantOwns(resource.data) &&\n        isNotSuspended() &&',
  },
  {
    label: 'technician updates verify suspension after cheap identity checks',
    text: 'techOwns(resource.data) &&\n        isNotSuspended() &&\n        isApprovedTechnician() &&',
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
