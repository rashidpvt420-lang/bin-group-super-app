import { readFileSync } from 'node:fs';

const rules = readFileSync('firestore.rules', 'utf8').replace(/\r\n?/g, '\n');

function readFunction(name) {
  const needle = `    function ${name}(`;
  const start = rules.indexOf(needle);
  if (start < 0) return null;
  const open = rules.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') {
      depth -= 1;
      if (depth === 0) return rules.slice(start, index + 1);
    }
  }
  return null;
}

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
    label: 'ticket update still evaluates every actor branch',
    text: 'allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();',
  },
  {
    label: 'ticket update still uses the shared actor router',
    text: 'allow update: if safeTicketUpdateByActor();',
  },
  {
    label: 'shared actor-router helper remains',
    text: 'function safeTicketUpdateByActor() {',
  },
  {
    label: 'global admin catch-all remains',
    text: 'match /{collection}/{document=**}',
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
    label: 'fail-closed recursive fallback',
    text: 'match /{document=**} {\n      allow read, write: if false;',
  },
  {
    label: 'technician dispatch authority helper',
    text: 'function hasTechnicianDispatchAuthority() {\n      return canDispatchJobs();\n    }',
  },
  {
    label: 'non-admin dispatch authority helper',
    text: 'function hasNonAdminDispatchClaimOnly() {',
  },
  {
    label: 'approved technician read helper',
    text: 'function isApprovedTechnician() {',
  },
  {
    label: 'dedicated technician write-approval helper',
    text: 'function hasApprovedTechnicianRecord() {',
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
    label: 'admin ticket update is suspension-gated',
    text: 'allow update: if isAdmin() && isNotSuspended();',
  },
  {
    label: 'dispatcher ticket update is explicitly actor-gated',
    text: 'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  },
  {
    label: 'tenant evidence update is explicitly ownership-gated',
    text: 'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  },
  {
    label: 'technician evidence update is explicitly actor-and-assignment-gated',
    text: 'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
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

for (const rule of [
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
]) {
  if ((rules.split(rule).length - 1) !== 2) {
    failures.push(`Explicit actor-gated ticket update rule must exist exactly twice: ${rule}`);
  }
}

const technicianUpdate = readFunction('safeTechnicianTicketUpdate');
if (!technicianUpdate) {
  failures.push('Technician update helper could not be parsed.');
} else {
  for (const forbiddenField of [
    "'assignedTechnicianId',",
    "'technicianId',",
    "'techId',",
    "'priority',",
    "'paymentVerified',",
  ]) {
    if (technicianUpdate.includes(forbiddenField)) {
      failures.push(`Technician update allowlist exposes immutable field: ${forbiddenField}`);
    }
  }
  for (const requiredProof of [
    "request.resource.data.get('proofPhotos', []).hasAll(resource.data.get('proofPhotos', []))",
    "request.resource.data.get('completionPhotos', []).hasAll(resource.data.get('completionPhotos', []))",
    "request.resource.data.get('evidencePhotos', []).hasAll(resource.data.get('evidencePhotos', []))",
  ]) {
    if (!technicianUpdate.includes(requiredProof)) {
      failures.push(`Technician append-only proof guard missing: ${requiredProof}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Firestore launch hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Firestore launch hardening verification passed.');
